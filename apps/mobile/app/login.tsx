import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../src/components/Screen";
import { colors, radius, spacing } from "../src/theme";
import { useAuth } from "../src/lib/auth-context";

export default function LoginScreen() {
  const { user, sendPhoneOtp, verifyPhoneOtp, loginWithGoogleWeb, loginWithGoogleDirect, logout } = useAuth();

  const [authMethod, setAuthMethod] = useState<"phone" | "google">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [userName, setUserName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in, show profile card with option to log out
  if (user) {
    return (
      <Screen scroll={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </Pressable>
            <Text style={styles.headerTitle}>Account Profile</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={styles.loggedInCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userSubtitle}>
              {user.provider === "phone" ? `📱 ${user.phone}` : `✉️ ${user.email}`}
            </Text>

            <View style={styles.badgeRow}>
              <View style={styles.activeBadge}>
                <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                <Text style={styles.activeBadgeText}>
                  {user.provider === "phone" ? "Mobile Verified" : "Google Account"}
                </Text>
              </View>
            </View>

            <View style={styles.profileDivider} />

            <Text style={styles.profileNote}>
              Your family tree edits, voice archives, and relative memories will automatically sync with this account.
            </Text>

            <Pressable
              onPress={async () => {
                await logout();
                Alert.alert("Signed Out", "You have been signed out.");
              }}
              style={styles.logoutBtn}
            >
              <Ionicons name="log-out-outline" size={18} color="#A23A2A" />
              <Text style={styles.logoutBtnText}>Sign Out of Account</Text>
            </Pressable>

            <Pressable onPress={() => router.back()} style={styles.continueBtn}>
              <Text style={styles.continueBtnText}>Back to Family Tree</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  // Handle Request OTP
  const handleSendOtp = async () => {
    const trimmed = phoneNumber.trim();
    if (!trimmed || trimmed.length < 7) {
      Alert.alert("Invalid Phone Number", "Please enter a valid mobile number with country code (e.g. +91 98765 43210).");
      return;
    }

    setLoading(true);
    const result = await sendPhoneOtp(trimmed);
    setLoading(false);

    if (result.success) {
      setOtpSent(true);
      if (result.devOtp) {
        setDevOtp(result.devOtp);
        setOtpCode(result.devOtp); // prefill for easy instant testing
      }
      Alert.alert("Code Sent", result.message || `A 6-digit verification code was sent to ${trimmed}.`);
    } else {
      Alert.alert("Could not send code", result.message || "Please check server connection.");
    }
  };

  // Handle Verify OTP
  const handleVerifyOtp = async () => {
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      Alert.alert("Enter Code", "Please enter the 6-digit OTP code.");
      return;
    }

    setLoading(true);
    const result = await verifyPhoneOtp(phoneNumber.trim(), otpCode.trim(), userName.trim() || undefined);
    setLoading(false);

    if (result.success) {
      Alert.alert("Signed In!", "Welcome to Yesterday. Your tree edits will now be saved to your profile.");
      router.back();
    } else {
      Alert.alert("Verification Failed", result.error || "Incorrect OTP code. Try again.");
    }
  };

  // Handle Google Login
  const handleGoogleWeb = async () => {
    await loginWithGoogleWeb();
  };

  // Handle One-Tap Google Demo Login
  const handleGoogleDirect = async () => {
    setLoading(true);
    const success = await loginWithGoogleDirect({
      email: "aashutosh@family.org",
      name: "Aashutosh Bhardwaj",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80"
    });
    setLoading(false);
    if (success) {
      Alert.alert("Signed In with Google", "Signed in as Aashutosh Bhardwaj (Google)");
      router.back();
    }
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS === "ios"}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Sign In / Register</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Brand Banner */}
          <View style={styles.heroSection}>
            <View style={styles.heroIcon}>
              <Ionicons name="book" size={32} color={colors.terra} />
            </View>
            <Text style={styles.heroTitle}>Welcome to Yesterday</Text>
            <Text style={styles.heroSubtitle}>
              Preserve your family oral history, map ancestors, and collaborate with loved ones across generations.
            </Text>
          </View>

          {/* Switcher Tab */}
          <View style={styles.switcher}>
            <Pressable
              onPress={() => setAuthMethod("phone")}
              style={[styles.switchTab, authMethod === "phone" && styles.switchTabActive]}
            >
              <Ionicons
                name="call-outline"
                size={16}
                color={authMethod === "phone" ? colors.white : colors.ink}
              />
              <Text style={[styles.switchTabText, authMethod === "phone" && styles.switchTabTextActive]}>
                Mobile Number
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setAuthMethod("google")}
              style={[styles.switchTab, authMethod === "google" && styles.switchTabActive]}
            >
              <Ionicons
                name="logo-google"
                size={16}
                color={authMethod === "google" ? colors.white : colors.ink}
              />
              <Text style={[styles.switchTabText, authMethod === "google" && styles.switchTabTextActive]}>
                Google Sign-In
              </Text>
            </Pressable>
          </View>

          {/* PHONE LOGIN TAB */}
          {authMethod === "phone" ? (
            <View style={styles.card}>
              {!otpSent ? (
                <>
                  <Text style={styles.inputLabel}>YOUR FULL NAME (OPTIONAL)</Text>
                  <TextInput
                    value={userName}
                    onChangeText={setUserName}
                    placeholder="e.g. Ramesh Sharma"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />

                  <Text style={styles.inputLabel}>MOBILE PHONE NUMBER *</Text>
                  <TextInput
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="+91 98765 43210"
                    placeholderTextColor={colors.muted}
                    keyboardType="phone-pad"
                    style={styles.input}
                  />

                  <Text style={styles.helperText}>
                    We will send a 6-digit one-time verification code via SMS to securely verify your family identity.
                  </Text>

                  <Pressable
                    onPress={handleSendOtp}
                    disabled={loading}
                    style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Ionicons name="paper-plane" size={17} color={colors.white} />
                        <Text style={styles.primaryBtnText}>Send Verification Code</Text>
                      </>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.sentHeader}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.green} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sentTitle}>Verification code sent</Text>
                      <Text style={styles.sentSub}>{phoneNumber}</Text>
                    </View>
                    <Pressable onPress={() => setOtpSent(false)}>
                      <Text style={styles.changeLink}>Change</Text>
                    </Pressable>
                  </View>

                  {devOtp ? (
                    <View style={styles.devOtpBox}>
                      <Ionicons name="key" size={16} color={colors.terra} />
                      <Text style={styles.devOtpText}>
                        Instant Test Code: <Text style={{ fontWeight: "800" }}>{devOtp}</Text> (or 123456)
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.inputLabel}>ENTER 6-DIGIT OTP</Text>
                  <TextInput
                    value={otpCode}
                    onChangeText={setOtpCode}
                    placeholder="123456"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={[styles.input, styles.otpInput]}
                  />

                  <Pressable
                    onPress={handleVerifyOtp}
                    disabled={loading}
                    style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Ionicons name="lock-open" size={17} color={colors.white} />
                        <Text style={styles.primaryBtnText}>Verify & Sign In</Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable onPress={handleSendOtp} style={styles.resendBtn}>
                    <Text style={styles.resendBtnText}>Didn’t receive code? Resend</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            /* GOOGLE SIGN-IN TAB */
            <View style={styles.card}>
              <View style={styles.googleHero}>
                <View style={styles.googleIconBadge}>
                  <Ionicons name="logo-google" size={32} color="#EA4335" />
                </View>
                <Text style={styles.googleTitle}>Single Sign-On with Google</Text>
                <Text style={styles.googleDesc}>
                  Connect your Google Account to access your shared family tree, sync oral histories, and collaborate across devices with zero setup.
                </Text>
              </View>

              <Pressable
                onPress={handleGoogleWeb}
                disabled={loading}
                style={styles.googleBtn}
              >
                <Ionicons name="logo-google" size={20} color="#EA4335" />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </Pressable>

              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR 1-TAP DEMO</Text>
                <View style={styles.orLine} />
              </View>

              <Pressable
                onPress={handleGoogleDirect}
                disabled={loading}
                style={styles.googleDirectBtn}
              >
                <Ionicons name="flash" size={16} color={colors.terra} />
                <Text style={styles.googleDirectBtnText}>Sign In as Family Lead (Instant Demo)</Text>
              </Pressable>
            </View>
          )}

          {/* Cloudflare Security Badge */}
          <View style={styles.cfBadge}>
            <Ionicons name="shield-checkmark" size={15} color={colors.green} />
            <Text style={styles.cfBadgeText}>
              Secured with Cloudflare Edge Tunnel & HMAC-SHA256 Encryption
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backBtn: {
    padding: 6
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink
  },
  scrollContent: {
    paddingVertical: 16,
    gap: 16
  },
  heroSection: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.ink
  },
  heroSubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16
  },
  switcher: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    marginHorizontal: 4
  },
  switchTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: radius.md - 2
  },
  switchTabActive: {
    backgroundColor: colors.terra
  },
  switchTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.ink
  },
  switchTabTextActive: {
    color: colors.white
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1.1
  },
  input: {
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink
  },
  otpInput: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 6,
    textAlign: "center"
  },
  helperText: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16
  },
  primaryBtn: {
    backgroundColor: colors.terra,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: radius.md,
    marginTop: 4
  },
  primaryBtnDisabled: {
    opacity: 0.6
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "800"
  },
  sentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EDF5EB",
    padding: 12,
    borderRadius: radius.md
  },
  sentTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink
  },
  sentSub: {
    fontSize: 12,
    color: colors.muted
  },
  changeLink: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.terra
  },
  devOtpBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FAF4ED",
    borderWidth: 1,
    borderColor: "#EBDCCE",
    padding: 10,
    borderRadius: radius.md
  },
  devOtpText: {
    fontSize: 12,
    color: colors.ink
  },
  resendBtn: {
    alignItems: "center",
    paddingVertical: 6
  },
  resendBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.terra
  },
  googleHero: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8
  },
  googleIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FEEAE7",
    alignItems: "center",
    justifyContent: "center"
  },
  googleTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink
  },
  googleDesc: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    borderRadius: radius.md,
    marginTop: 6
  },
  googleBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink
  },
  orDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border
  },
  orText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1
  },
  googleDirectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: "#EBDCCE",
    paddingVertical: 11,
    borderRadius: radius.md
  },
  googleDirectBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.terra
  },
  cfBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10
  },
  cfBadgeText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600"
  },
  loggedInCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    marginTop: 20,
    gap: 12
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.terra,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.white
  },
  userName: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink
  },
  userSubtitle: {
    fontSize: 13,
    color: colors.muted
  },
  badgeRow: {
    marginTop: 2
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EDF5EB",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.green
  },
  profileDivider: {
    width: "100%",
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6
  },
  profileNote: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FDF0ED",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    width: "100%",
    marginTop: 6
  },
  logoutBtnText: {
    color: "#A23A2A",
    fontSize: 13,
    fontWeight: "800"
  },
  continueBtn: {
    paddingVertical: 8
  },
  continueBtnText: {
    color: colors.terra,
    fontSize: 13,
    fontWeight: "700"
  }
});

