import React, { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { Alert, Linking } from "react-native";
import { getSetting, setSetting } from "./database";
import { getServerUrl, setAuthenticatedProfile } from "./sync-client";

export interface AuthUser {
  id: string;
  name: string;
  phone?: string | undefined;
  email?: string | undefined;
  avatarUrl?: string | undefined;
  provider: "phone" | "google";
  createdAt?: string | undefined;
  lastLoginAt?: string | undefined;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  sendPhoneOtp: (phoneNumber: string) => Promise<{ success: boolean; devOtp?: string; message?: string }>;
  verifyPhoneOtp: (phoneNumber: string, otp: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogleWeb: () => Promise<void>;
  loginWithGoogleDirect: (profile: { email: string; name?: string; avatarUrl?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load existing session on app startup
  useEffect(() => {
    async function restoreSession() {
      try {
        const storedToken = await getSetting("auth_token");
        const storedUser = await getSetting("auth_user");

        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser) as AuthUser;
          setToken(storedToken);
          setUser(parsedUser);
          setAuthenticatedProfile(parsedUser.id, parsedUser.name);

          // Verify with server in background
          fetch(`${getServerUrl()}/v1/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` }
          })
            .then(res => res.json())
            .then(data => {
              if (data.success && data.user) {
                setUser(data.user);
                setAuthenticatedProfile(data.user.id, data.user.name);
                setSetting("auth_user", JSON.stringify(data.user)).catch(() => {});
              }
            })
            .catch(() => {
              // Server may be offline; keep cached user
            });
        }
      } catch (err) {
        console.warn("Could not restore auth session:", err);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  // Listen to deep linking (e.g. yesterday://auth?token=...&user=...) from Google OAuth redirect
  useEffect(() => {
    function handleDeepLink(event: { url: string }) {
      try {
        const urlStr = event.url;
        if (!urlStr.includes("auth")) return;

        const url = new URL(urlStr);
        const queryToken = url.searchParams.get("token");
        const queryUser = url.searchParams.get("user");
        const queryError = url.searchParams.get("error");

        if (queryError) {
          Alert.alert("Google Sign-In", `Sign-in was canceled or failed: ${queryError}`);
          return;
        }

        if (queryToken && queryUser) {
          const parsedUser = JSON.parse(decodeURIComponent(queryUser)) as AuthUser;
          setToken(queryToken);
          setUser(parsedUser);
          setAuthenticatedProfile(parsedUser.id, parsedUser.name);
          setSetting("auth_token", queryToken).catch(console.error);
          setSetting("auth_user", JSON.stringify(parsedUser)).catch(console.error);
          Alert.alert("Welcome!", `Signed in successfully as ${parsedUser.name}`);
        }
      } catch (err) {
        console.error("Deep link auth error:", err);
      }
    }

    const sub = Linking.addEventListener("url", handleDeepLink);
    Linking.getInitialURL().then(initialUrl => {
      if (initialUrl) handleDeepLink({ url: initialUrl });
    });

    return () => {
      sub.remove();
    };
  }, []);

  // 1. Send OTP to Phone
  const sendPhoneOtp = async (phoneNumber: string) => {
    try {
      const res = await fetch(`${getServerUrl()}/v1/auth/phone/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, message: data.message || data.error || "Failed to send OTP." };
      }
      return {
        success: true,
        devOtp: data.devOtp,
        message: data.message
      };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Network error connecting to API server." };
    }
  };

  // 2. Verify Phone OTP
  const verifyPhoneOtp = async (phoneNumber: string, otp: string, name?: string) => {
    try {
      const res = await fetch(`${getServerUrl()}/v1/auth/phone/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, otp, name })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.message || data.error || "Invalid OTP code." };
      }

      setToken(data.token);
      setUser(data.user);
      setAuthenticatedProfile(data.user.id, data.user.name);
      await setSetting("auth_token", data.token);
      await setSetting("auth_user", JSON.stringify(data.user));

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Network connection failed." };
    }
  };

  // 3. Google Sign-In via Browser Deep Link
  const loginWithGoogleWeb = async () => {
    const loginUrl = `${getServerUrl()}/v1/auth/google/login`;
    const supported = await Linking.canOpenURL(loginUrl).catch(() => false);
    if (!supported) {
      Alert.alert("Error", "Could not launch web browser for Google Sign-In.");
      return;
    }
    await Linking.openURL(loginUrl);
  };

  // 4. Google Sign-In Direct (For testing or client SDK)
  const loginWithGoogleDirect = async (profile: { email: string; name?: string; avatarUrl?: string }) => {
    try {
      const res = await fetch(`${getServerUrl()}/v1/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        Alert.alert("Google Sign-In Error", data.message || "Failed to sign in with Google.");
        return false;
      }

      setToken(data.token);
      setUser(data.user);
      setAuthenticatedProfile(data.user.id, data.user.name);
      await setSetting("auth_token", data.token);
      await setSetting("auth_user", JSON.stringify(data.user));
      return true;
    } catch (err) {
      Alert.alert("Network Error", err instanceof Error ? err.message : "Connection failed.");
      return false;
    }
  };

  // 5. Logout
  const logout = async () => {
    setToken(null);
    setUser(null);
    setAuthenticatedProfile(null, null);
    await setSetting("auth_token", "");
    await setSetting("auth_user", "");
  };

  const refreshProfile = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getServerUrl()}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        await setSetting("auth_user", JSON.stringify(data.user));
      }
    } catch {
      // Ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        sendPhoneOtp,
        verifyPhoneOtp,
        loginWithGoogleWeb,
        loginWithGoogleDirect,
        logout,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
