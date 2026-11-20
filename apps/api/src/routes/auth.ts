import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { signJwt, verifyJwt, type JwtPayload } from "../modules/auth/jwt.js";
import {
  generateOtp,
  getUserById,
  listUsers,
  normalizePhone,
  upsertGoogleUser,
  verifyOtpAndGetUser
} from "../modules/auth/user-store.js";

const sendOtpSchema = z.object({
  phoneNumber: z.string().min(5).max(20),
  turnstileToken: z.string().optional()
});

const verifyOtpSchema = z.object({
  phoneNumber: z.string().min(5).max(20),
  otp: z.string().min(4).max(8),
  name: z.string().max(100).optional()
});

const googleAuthSchema = z.object({
  idToken: z.string().optional(),
  accessToken: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().url().optional()
});

/**
 * Verify Cloudflare Turnstile token if configured
 */
async function verifyTurnstile(token?: string, remoteIp?: string): Promise<boolean> {
  if (!config.cloudflare.turnstileSecretKey || !token) {
    // If not configured, pass through (free tier friendly)
    return true;
  }
  try {
    const form = new URLSearchParams();
    form.append("secret", config.cloudflare.turnstileSecretKey);
    form.append("response", token);
    if (remoteIp) form.append("remoteip", remoteIp);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    console.error("Cloudflare Turnstile verification error:", err);
    return true;
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  // 1. Send OTP to Phone
  app.post("/v1/auth/phone/send-otp", async (request, reply) => {
    const parsed = sendOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_PHONE_NUMBER", details: parsed.error.flatten() });
    }

    const { phoneNumber, turnstileToken } = parsed.data;

    // Optional Cloudflare Turnstile bot verification
    const isHuman = await verifyTurnstile(turnstileToken, request.ip);
    if (!isHuman) {
      return reply.code(403).send({ error: "BOT_VERIFICATION_FAILED", message: "Cloudflare Turnstile challenge failed." });
    }

    const { phone, otp, expiresIn } = generateOtp(phoneNumber);

    return {
      success: true,
      message: `OTP sent to ${phone}`,
      phone,
      // devOtp is exposed for effortless local & Cloudflare tunnel testing without needing a paid SMS provider
      devOtp: otp,
      expiresIn
    };
  });

  // 2. Verify OTP & Issue JWT
  app.post("/v1/auth/phone/verify-otp", async (request, reply) => {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    }

    const { phoneNumber, otp, name } = parsed.data;
    const result = verifyOtpAndGetUser(phoneNumber, otp, name);

    if (!result.success || !result.user) {
      return reply.code(400).send({ error: "INVALID_OTP", message: result.error || "Incorrect OTP code." });
    }

    const jwtPayload: JwtPayload = {
      sub: result.user.id,
      name: result.user.name,
      phone: result.user.phone ?? undefined,
      provider: "phone"
    };

    const token = signJwt(jwtPayload, config.auth.jwtSecret);

    return {
      success: true,
      token,
      user: result.user
    };
  });

  // 3. Google Sign-In (Direct or token verification)
  app.post("/v1/auth/google", async (request, reply) => {
    const parsed = googleAuthSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    }

    const { idToken, email, name, avatarUrl } = parsed.data;
    let resolvedEmail = email;
    let resolvedName = name;
    let resolvedSub: string | undefined;
    let resolvedPicture = avatarUrl;

    // If idToken is provided, verify directly with Google
    if (idToken) {
      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
        if (verifyRes.ok) {
          const googleData = (await verifyRes.json()) as {
            email?: string;
            name?: string;
            sub?: string;
            picture?: string;
          };
          if (googleData.email) {
            resolvedEmail = googleData.email;
            resolvedName = googleData.name || resolvedName;
            resolvedSub = googleData.sub;
            resolvedPicture = googleData.picture || resolvedPicture;
          }
        }
      } catch (err) {
        console.warn("Failed to verify Google ID token:", err);
      }
    }

    if (!resolvedEmail) {
      return reply.code(400).send({ error: "GOOGLE_AUTH_FAILED", message: "Could not retrieve email from Google." });
    }

    const user = upsertGoogleUser({
      email: resolvedEmail,
      name: resolvedName ?? undefined,
      sub: resolvedSub ?? undefined,
      picture: resolvedPicture ?? undefined
    });

    const jwtPayload: JwtPayload = {
      sub: user.id,
      name: user.name,
      email: user.email ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
      provider: "google"
    };

    const token = signJwt(jwtPayload, config.auth.jwtSecret);

    return {
      success: true,
      token,
      user
    };
  });

  // 4. Google OAuth Web Flow Start
  app.get("/v1/auth/google/login", async (request, reply) => {
    const clientId = config.auth.googleClientId;
    if (!clientId) {
      return reply.code(503).send({
        error: "GOOGLE_OAUTH_NOT_CONFIGURED",
        message: "GOOGLE_CLIENT_ID is not configured in .env. You can use Phone Number OTP or configure Google Cloud Console."
      });
    }

    const redirectUri = `${config.auth.publicApiUrl}/v1/auth/google/callback`;
    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", clientId);
    googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("prompt", "select_account");

    return reply.redirect(googleAuthUrl.toString());
  });

  // 5. Google OAuth Callback (Exchanges code, signs JWT, redirects back to mobile app via deep link)
  app.get("/v1/auth/google/callback", async (request, reply) => {
    const query = request.query as { code?: string; error?: string };
    if (query.error || !query.code) {
      return reply.type("text/html").send(`
        <html>
          <body style="font-family:sans-serif; text-align:center; padding:40px;">
            <h2>Google Authentication Canceled</h2>
            <p>${query.error || "No authorization code received."}</p>
            <a href="yesterday://auth?error=${encodeURIComponent(query.error || "canceled")}">Return to App</a>
          </body>
        </html>
      `);
    }

    const clientId = config.auth.googleClientId;
    const clientSecret = config.auth.googleClientSecret;
    const redirectUri = `${config.auth.publicApiUrl}/v1/auth/google/callback`;

    try {
      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.code,
          client_id: clientId || "",
          client_secret: clientSecret || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      });

      const tokenData = (await tokenRes.json()) as { access_token?: string; id_token?: string };
      if (!tokenData.access_token) {
        throw new Error("Failed to obtain Google access token");
      }

      // Fetch user profile from Google
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const profile = (await userRes.json()) as {
        email?: string;
        name?: string;
        sub?: string;
        picture?: string;
      };

      if (!profile.email) throw new Error("Google did not return an email address.");

      const user = upsertGoogleUser({
        email: profile.email,
        name: profile.name ?? undefined,
        sub: profile.sub ?? undefined,
        picture: profile.picture ?? undefined
      });

      const token = signJwt(
        {
          sub: user.id,
          name: user.name,
          email: user.email ?? undefined,
          avatarUrl: user.avatarUrl ?? undefined,
          provider: "google"
        },
        config.auth.jwtSecret
      );

      // Deep link back to the mobile app
      const appUrl = `yesterday://auth?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(user))}`;

      return reply.type("text/html").send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Logging in...</title>
            <script>
              window.location.href = "${appUrl}";
            </script>
          </head>
          <body style="font-family:system-ui, -apple-system, sans-serif; text-align:center; padding:50px; background:#FAF6F0; color:#2B2118;">
            <div style="max-width:400px; margin:0 auto; background:#fff; padding:30px; border-radius:16px; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
              <h2 style="color:#C95D4A; margin-top:0;">Welcome back, ${user.name}!</h2>
              <p style="color:#6B5E51;">Redirecting to Yesterday...</p>
              <a href="${appUrl}" style="display:inline-block; margin-top:16px; background:#C95D4A; color:#fff; text-decoration:none; padding:12px 24px; border-radius:999px; font-weight:bold;">
                Open Yesterday App
              </a>
            </div>
          </body>
        </html>
      `);
    } catch (err) {
      console.error("Google callback error:", err);
      return reply.type("text/html").send(`
        <html>
          <body style="font-family:sans-serif; text-align:center; padding:40px;">
            <h2>Google Sign-In Error</h2>
            <p>${err instanceof Error ? err.message : "Authentication failed."}</p>
            <a href="yesterday://auth?error=failed">Return to App</a>
          </body>
        </html>
      `);
    }
  });

  // 6. Get Current User (/v1/auth/me)
  app.get("/v1/auth/me", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Bearer token required." });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const payload = verifyJwt<JwtPayload>(token, config.auth.jwtSecret);

    if (!payload || !payload.sub) {
      return reply.code(401).send({ error: "INVALID_OR_EXPIRED_TOKEN" });
    }

    const user = getUserById(payload.sub);
    if (!user) {
      return reply.code(404).send({ error: "USER_NOT_FOUND" });
    }

    return { success: true, user };
  });

  // 7. List registered users
  app.get("/v1/auth/users", async () => {
    return { success: true, users: listUsers() };
  });
}
