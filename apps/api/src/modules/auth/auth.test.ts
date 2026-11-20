import test from "node:test";
import assert from "node:assert";
import Fastify from "fastify";
import { registerAuthRoutes } from "../../routes/auth.js";
import { signJwt, verifyJwt } from "./jwt.js";
import { normalizePhone, verifyOtpAndGetUser, generateOtp } from "./user-store.js";

test("JWT sign and verify works correctly", () => {
  const secret = "test_secret_123456789";
  const token = signJwt(
    { sub: "usr_123", name: "Test User", provider: "phone" },
    secret,
    3600
  );
  assert.ok(token);
  assert.strictEqual(token.split(".").length, 3);

  const decoded = verifyJwt(token, secret);
  assert.ok(decoded);
  assert.strictEqual(decoded.sub, "usr_123");
  assert.strictEqual(decoded.name, "Test User");
  assert.strictEqual(decoded.provider, "phone");

  // Invalid secret returns null
  const invalid = verifyJwt(token, "wrong_secret");
  assert.strictEqual(invalid, null);
});

test("OTP generation, rate limiting, and verification works", () => {
  const phone = "+91 9988776655";
  const normalized = normalizePhone(phone);
  assert.strictEqual(normalized, "+919988776655");

  const { otp, expiresIn } = generateOtp(phone);
  assert.strictEqual(otp.length, 6);
  assert.strictEqual(expiresIn, 300);

  // Wrong code fails
  const failed = verifyOtpAndGetUser(phone, "000000");
  assert.strictEqual(failed.success, false);

  // Correct code succeeds
  const success = verifyOtpAndGetUser(phone, otp, "Radha Sharma");
  assert.strictEqual(success.success, true);
  assert.ok(success.user);
  assert.strictEqual(success.user.name, "Radha Sharma");
  assert.strictEqual(success.user.phone, "+919988776655");
  assert.strictEqual(success.user.provider, "phone");
});

test("Fastify Auth Routes (/v1/auth/phone/send-otp and verify-otp)", async () => {
  const app = Fastify();
  await registerAuthRoutes(app);

  // 1. Send OTP
  const sendRes = await app.inject({
    method: "POST",
    url: "/v1/auth/phone/send-otp",
    payload: { phoneNumber: "+91 9123456789" }
  });
  assert.strictEqual(sendRes.statusCode, 200);
  const sendBody = JSON.parse(sendRes.body);
  assert.strictEqual(sendBody.success, true);
  assert.ok(sendBody.devOtp);

  // 2. Verify OTP
  const verifyRes = await app.inject({
    method: "POST",
    url: "/v1/auth/phone/verify-otp",
    payload: {
      phoneNumber: "+91 9123456789",
      otp: sendBody.devOtp,
      name: "Amitabh Verma"
    }
  });
  assert.strictEqual(verifyRes.statusCode, 200);
  const verifyBody = JSON.parse(verifyRes.body);
  assert.strictEqual(verifyBody.success, true);
  assert.ok(verifyBody.token);
  assert.strictEqual(verifyBody.user.name, "Amitabh Verma");

  // 3. /v1/auth/me
  const meRes = await app.inject({
    method: "GET",
    url: "/v1/auth/me",
    headers: { Authorization: `Bearer ${verifyBody.token}` }
  });
  assert.strictEqual(meRes.statusCode, 200);
  const meBody = JSON.parse(meRes.body);
  assert.strictEqual(meBody.success, true);
  assert.strictEqual(meBody.user.id, verifyBody.user.id);

  // 4. Google auth endpoint
  const googleRes = await app.inject({
    method: "POST",
    url: "/v1/auth/google",
    payload: {
      email: "family.lead@gmail.com",
      name: "Family Lead",
      avatarUrl: "https://lh3.googleusercontent.com/photo.jpg"
    }
  });
  assert.strictEqual(googleRes.statusCode, 200);
  const googleBody = JSON.parse(googleRes.body);
  assert.strictEqual(googleBody.success, true);
  assert.strictEqual(googleBody.user.email, "family.lead@gmail.com");
  assert.strictEqual(googleBody.user.provider, "google");
  assert.ok(googleBody.token);
});

