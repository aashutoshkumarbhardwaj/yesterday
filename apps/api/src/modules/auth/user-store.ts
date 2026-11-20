import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface UserRecord {
  id: string;
  name: string;
  phone?: string | undefined;
  email?: string | undefined;
  avatarUrl?: string | undefined;
  provider: "phone" | "google";
  createdAt: string;
  lastLoginAt: string;
}

interface OtpState {
  code: string;
  expiresAt: number;
  attempts: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../../data");
const USERS_FILE = join(DATA_DIR, "users.json");

// In-memory cache backed by JSON file
const users = new Map<string, UserRecord>();
const otps = new Map<string, OtpState>();

function loadUsers(): void {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    if (existsSync(USERS_FILE)) {
      const content = readFileSync(USERS_FILE, "utf-8");
      const list = JSON.parse(content) as UserRecord[];
      list.forEach((u) => users.set(u.id, u));
    }
  } catch (err) {
    console.error("Failed to load users from file:", err);
  }
}

function saveUsers(): void {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(users.values());
    writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save users to file:", err);
  }
}

// Initial load
loadUsers();

/**
 * Normalizes phone numbers (e.g. +91 98765 43210 -> +919876543210)
 */
export function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    // Default to +91 if 10 digits
    if (cleaned.length === 10) cleaned = `+91${cleaned}`;
    else cleaned = `+${cleaned}`;
  }
  return cleaned;
}

/**
 * Generate a 6-digit OTP for the given phone number.
 * Valid for 5 minutes (300 seconds).
 */
export function generateOtp(rawPhone: string): { phone: string; otp: string; expiresIn: number } {
  const phone = normalizePhone(rawPhone);
  // Generate random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresIn = 300; // 5 minutes

  otps.set(phone, {
    code,
    expiresAt: Date.now() + expiresIn * 1000,
    attempts: 0
  });

  console.log(`[AUTH OTP] Code for ${phone}: ${code} (expires in 5m)`);
  return { phone, otp: code, expiresIn };
}

/**
 * Verify phone OTP and get or create user profile.
 */
export function verifyOtpAndGetUser(
  rawPhone: string,
  enteredCode: string,
  name?: string
): { success: boolean; user?: UserRecord; error?: string } {
  const phone = normalizePhone(rawPhone);

  // Master dev OTP "123456" always works for effortless instant login
  const isMasterOtp = enteredCode === "123456";

  if (!isMasterOtp) {
    const record = otps.get(phone);

    if (!record) {
      return { success: false, error: "No OTP was requested for this phone number or it has expired. (Tip: Enter test code 123456)" };
    }

    if (Date.now() > record.expiresAt) {
      otps.delete(phone);
      return { success: false, error: "OTP has expired. Please request a new one." };
    }

    record.attempts += 1;
    if (record.attempts > 5) {
      otps.delete(phone);
      return { success: false, error: "Too many incorrect attempts. Please request a new OTP." };
    }

    if (enteredCode !== record.code) {
      return { success: false, error: "Invalid OTP code. (Tip: Enter test code 123456)" };
    }

    // Consumed
    otps.delete(phone);
  }

  // Find or create user
  const userId = `usr_phone_${phone.replace(/\+/g, "")}`;
  const now = new Date().toISOString();
  let user = users.get(userId);

  if (!user) {
    user = {
      id: userId,
      name: name?.trim() || `User ${phone.slice(-4)}`,
      phone,
      provider: "phone",
      createdAt: now,
      lastLoginAt: now
    };
    users.set(userId, user);
  } else {
    user.lastLoginAt = now;
    if (name?.trim() && user.name.startsWith("User ")) {
      user.name = name.trim();
    }
  }

  saveUsers();
  return { success: true, user };
}

/**
 * Find or create user from Google profile info.
 */
export function upsertGoogleUser(googleProfile: {
  email: string;
  name?: string | undefined;
  sub?: string | undefined;
  picture?: string | undefined;
}): UserRecord {
  const now = new Date().toISOString();
  const userId = googleProfile.sub ? `usr_g_${googleProfile.sub}` : `usr_g_${googleProfile.email.replace(/[^a-zA-Z0-9]/g, "_")}`;

  let user = users.get(userId);
  if (!user) {
    // Check by email
    for (const existing of users.values()) {
      if (existing.email && existing.email.toLowerCase() === googleProfile.email.toLowerCase()) {
        user = existing;
        break;
      }
    }
  }

  const resultUser: UserRecord = user
    ? {
        ...user,
        name: googleProfile.name || user.name,
        avatarUrl: googleProfile.picture || user.avatarUrl,
        lastLoginAt: now
      }
    : {
        id: userId,
        name: googleProfile.name || googleProfile.email.split("@")[0] || "Google User",
        email: googleProfile.email,
        avatarUrl: googleProfile.picture,
        provider: "google",
        createdAt: now,
        lastLoginAt: now
      };

  users.set(userId, resultUser);
  saveUsers();
  return resultUser;
}

export function getUserById(id: string): UserRecord | null {
  return users.get(id) || null;
}

export function listUsers(): UserRecord[] {
  return Array.from(users.values());
}
