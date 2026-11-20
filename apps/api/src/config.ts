import { config as dotenvConfig } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.resolve(__dirname, "../.env") });
dotenvConfig({ path: path.resolve(process.cwd(), "apps/api/.env") });
dotenvConfig({ path: path.resolve(process.cwd(), ".env") });

const numberFromEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  port: numberFromEnv(process.env.PORT, 3333),
  apiToken: process.env.APP_API_TOKEN,
  sarvamApiKey: process.env.SARVAM_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  maxUploadBytes: numberFromEnv(process.env.MAX_UPLOAD_MB, 50) * 1024 * 1024,

  // Cloudflare R2 Object Storage
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CLOUDFLARE_R2_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,
    r2: {
      accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID,
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      bucket: process.env.CLOUDFLARE_R2_BUCKET ?? "yesterday-archive",
      publicDomain: process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN
    }
  },

  // Authentication & Cloudflare Turnstile / Google OAuth
  auth: {
    jwtSecret: process.env.JWT_SECRET || "yesterday_family_archive_jwt_secret_2026_production",
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    publicApiUrl: process.env.PUBLIC_API_URL || "https://continued-alternatives-owners-metals.trycloudflare.com"
  }
};
