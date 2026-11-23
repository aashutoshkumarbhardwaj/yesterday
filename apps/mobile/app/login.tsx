import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { detectActiveServerUrl } from "../src/lib/sync-client";

// Curated avatar assets representing the multi-generational family
const AVATARS = {
  manBeard: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=240&q=80",
  womanBlack: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80",
  youngWomanYellow: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80",
  grandpa: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80",
  grandma: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80",
  boy: "https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?auto=format&fit=crop&w=240&q=80"
};

export default function LoginScreen() {
  const { user, sendPhoneOtp, verifyPhoneOtp, loginWithGoogleWeb, loginWithGoogleDirect, logout } = useAuth();

  // Mode: Onboarding Walkthrough or Auth Input
  const [viewMode, setViewMode] = useState<"onboarding" | "auth">("onboarding");
  const [currentSlide, setCurrentSlide] = useState<0 | 1 | 2>(0);

  // Auth form states
  const [authMethod, setAuthMethod] = useState<"phone" | "google">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [userName, setUserName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleName, setGoogleName] = useState("");
  const [showManualGoogle, setShowManualGoogle] = useState(true);

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
      const codeToUse = result.devOtp || "123456";
      setDevOtp(codeToUse);
      setOtpCode(codeToUse);
      Alert.alert("Code Ready", `Verification code is ${codeToUse}. Tap 'Verify & Sign In' to continue.`);
    } else {
      setOtpSent(true);
      setDevOtp("123456");
      setOtpCode("123456");
      Alert.alert("Test Verification", "Using offline dev code: 123456. Tap 'Verify & Sign In' to continue.");
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
    try {
      setLoading(true);
      await detectActiveServerUrl();
      await loginWithGoogleWeb();
    } catch (err) {
      Alert.alert("Google Sign-In", err instanceof Error ? err.message : "Could not open Google Sign-In.");
    } finally {
      setLoading(false);
    }
  };

  // Handle One-Tap Google Direct Login
  const handleGoogleDirect = async () => {
    if (!googleEmail.trim()) {
      Alert.alert("Email Required", "Please enter your Google email address.");
      return;
    }
    setLoading(true);
    const targetEmail = googleEmail.trim();
    const targetName = googleName.trim() || targetEmail.split("@")[0] || "Google User";
    const success = await loginWithGoogleDirect({
      email: targetEmail,
      name: targetName,
      avatarUrl: AVATARS.manBeard
    });
    setLoading(false);
    if (success) {
      Alert.alert("Signed In", `Welcome ${targetName}! Signed in as ${targetEmail}.`);
      router.back();
    }
  };

  // ---------------------------------------------------------------------------
  // 1. ONBOARDING WALKTHROUGH MODE (MATCHING REFERENCE MOCKUP)
  // ---------------------------------------------------------------------------
  if (viewMode === "onboarding") {
    return (
      <Screen scroll={false}>
        <View style={styles.onboardingRoot}>
          {/* Top Segmented Progress Bar & Navigation Header */}
          <View style={styles.onboardingTopNav}>
            {currentSlide > 0 ? (
              <Pressable
                onPress={() => setCurrentSlide((prev) => (prev - 1) as 0 | 1)}
                style={styles.navRoundBtn}
              >
                <Ionicons name="chevron-back" size={20} color="#2C221E" />
              </Pressable>
            ) : (
              <View style={{ width: 38 }} />
            )}

            {/* Segmented 3-Bar Indicator */}
            <View style={styles.progressSegmentsRow}>
              <View style={[styles.segmentBar, currentSlide >= 0 && styles.segmentBarActive]} />
              <View style={[styles.segmentBar, currentSlide >= 1 && styles.segmentBarActive]} />
              <View style={[styles.segmentBar, currentSlide >= 2 && styles.segmentBarActive]} />
            </View>

            {/* Direct Skip / Log In Button */}
            <Pressable onPress={() => setViewMode("auth")} style={styles.skipBtn}>
              <Text style={styles.skipBtnText}>Sign In</Text>
            </Pressable>
          </View>

          {/* SLIDE 1: PERFECTLY ORGANIZE YOUR FAMILY LIFE */}
          {currentSlide === 0 ? (
            <View style={styles.slideWrap}>
              <View style={styles.graphicBox}>
                {/* Orbital Constellation Background Rings */}
                <View style={styles.orbitRingOuter} />
                <View style={styles.orbitRingInner} />

                {/* Central Floating Pill: Family, Simplified */}
                <View style={styles.centerPill}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={styles.centerPillText}>Family, Simplified</Text>
                </View>

                {/* Floating Avatars in Orbit */}
                {/* 1. Top Center Avatar */}
                <View style={[styles.orbitAvatarWrapper, { top: 12, alignSelf: "center" }]}>
                  <Image source={{ uri: AVATARS.manBeard }} style={styles.orbitAvatarLarge} />
                </View>

                {/* 2. Middle Left Avatar */}
                <View style={[styles.orbitAvatarWrapper, { top: 96, left: 16 }]}>
                  <Image source={{ uri: AVATARS.womanBlack }} style={styles.orbitAvatarSmall} />
                </View>

                {/* 3. Middle Right Avatar */}
                <View style={[styles.orbitAvatarWrapper, { top: 70, right: 28 }]}>
                  <Image source={{ uri: AVATARS.boy }} style={styles.orbitAvatarSmall} />
                </View>

                {/* 4. Bottom Left Grandfather */}
                <View style={[styles.orbitAvatarWrapper, { bottom: 24, left: 24 }]}>
                  <Image source={{ uri: AVATARS.grandpa }} style={styles.orbitAvatarSmall} />
                </View>

                {/* 5. Bottom Middle Grandmother */}
                <View style={[styles.orbitAvatarWrapper, { bottom: 34, left: 90 }]}>
                  <Image source={{ uri: AVATARS.grandma }} style={styles.orbitAvatarSmall} />
                </View>

                {/* 6. Bottom Right Young Woman */}
                <View style={[styles.orbitAvatarWrapper, { bottom: 20, right: 26 }]}>
                  <Image source={{ uri: AVATARS.youngWomanYellow }} style={styles.orbitAvatarMedium} />
                </View>

                {/* Floating Dark Icon Badges */}
                <View style={[styles.floatingDarkBadge, { top: 130, left: 22 }]}>
                  <Ionicons name="calendar-outline" size={13} color="#FFFFFF" />
                </View>
                <View style={[styles.floatingDarkBadge, { top: 138, right: 26 }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={13} color="#FFFFFF" />
                </View>
                <View style={[styles.floatingDarkBadge, { bottom: 22, left: "45%" }]}>
                  <Ionicons name="cart-outline" size={13} color="#FFFFFF" />
                </View>

                {/* Warm Sparkles */}
                <Text style={[styles.sparkleMark, { top: 32, left: 44 }]}>✦</Text>
                <Text style={[styles.sparkleMark, { top: 22, right: 86 }]}>✦</Text>
                <Text style={[styles.sparkleMark, { bottom: 64, left: 136 }]}>✧</Text>
              </View>

              {/* Title & Description */}
              <View style={styles.copyBox}>
                <Text style={styles.slideTitle}>
                  Perfectlys Organize{"\n"}Your Family Life
                </Text>
                <Text style={styles.slideSubtitle}>
                  Manage events, chores, groceries, and daily plans in one simple shared place.
                </Text>
              </View>

              {/* Action Button */}
              <Pressable
                onPress={() => setCurrentSlide(1)}
                style={styles.onboardingActionBtn}
              >
                <Text style={styles.onboardingActionBtnText}>Next →</Text>
              </Pressable>
            </View>
          ) : null}

          {/* SLIDE 2: AI THAT ORGANIZES FOR YOUR WORK PRIORITY */}
          {currentSlide === 1 ? (
            <View style={styles.slideWrap}>
              <View style={styles.graphicBox}>
                {/* Floating Mockup Card */}
                <View style={styles.mockupCard}>
                  {/* Mock Status Bar */}
                  <View style={styles.mockStatusBar}>
                    <Text style={styles.mockTime}>9:41</Text>
                    <View style={styles.mockStatusRight}>
                      <Ionicons name="cellular" size={11} color="#7A6E65" />
                      <Ionicons name="wifi" size={11} color="#7A6E65" />
                      <Ionicons name="battery-full" size={11} color="#7A6E65" />
                    </View>
                  </View>

                  {/* Task 1: School PTA Meeting */}
                  <View style={styles.taskCardItem}>
                    <Image source={{ uri: AVATARS.womanBlack }} style={styles.taskCardAvatar} />
                    <View style={styles.taskCardInfo}>
                      <Text style={styles.taskCardTitle}>School PTA Meeting</Text>
                      <Text style={styles.taskCardTime}>5:00 PM · MIT School</Text>
                    </View>
                    <View style={styles.todayTag}>
                      <Text style={styles.todayTagText}>Today</Text>
                    </View>
                  </View>

                  {/* Task 2: Doctor Appointment */}
                  <View style={styles.taskCardItem}>
                    <Image source={{ uri: AVATARS.manBeard }} style={styles.taskCardAvatar} />
                    <View style={styles.taskCardInfo}>
                      <Text style={styles.taskCardTitle}>Doctor Appointment</Text>
                      <Text style={styles.taskCardTime}>11:30 AM · Apollo</Text>
                    </View>
                    <View style={styles.tomorrowTag}>
                      <Text style={styles.tomorrowTagText}>Tomorrow</Text>
                    </View>
                  </View>

                  {/* Checkbox Task: Call internet provider */}
                  <View style={styles.checkboxItemPill}>
                    <View style={styles.mockCheckboxSquare} />
                    <Text style={styles.checkboxItemText}>Call internet provider</Text>
                  </View>
                </View>

                {/* Bottom Row of Floating Avatars */}
                <View style={styles.bottomAvatarsCluster}>
                  <Image source={{ uri: AVATARS.youngWomanYellow }} style={styles.clusterAvatarTiny} />
                  <Image source={{ uri: AVATARS.manBeard }} style={styles.clusterAvatarSmall} />
                  <Image source={{ uri: AVATARS.womanBlack }} style={styles.clusterAvatarLarge} />
                  <Image source={{ uri: AVATARS.boy }} style={styles.clusterAvatarSmall} />
                  <Image source={{ uri: AVATARS.grandpa }} style={styles.clusterAvatarTiny} />
                </View>

                {/* Sparkles */}
                <Text style={[styles.sparkleMark, { top: 160, left: 16 }]}>✦</Text>
                <Text style={[styles.sparkleMark, { top: 145, right: 24 }]}>✦</Text>
              </View>

              {/* Title & Description */}
              <View style={styles.copyBox}>
                <Text style={styles.slideTitle}>
                  AI That Organizes For{"\n"}Your Work Priority
                </Text>
                <Text style={styles.slideSubtitle}>
                  AI suggests schedules, assigns chores, reminds tasks, and plans family activities.
                </Text>
              </View>

              {/* Action Button */}
              <Pressable
                onPress={() => setCurrentSlide(2)}
                style={styles.onboardingActionBtn}
              >
                <Text style={styles.onboardingActionBtnText}>Next →</Text>
              </Pressable>
            </View>
          ) : null}

          {/* SLIDE 3: STAY CONNECTED TOGETHER */}
          {currentSlide === 2 ? (
            <View style={styles.slideWrap}>
              <View style={styles.graphicBox}>
                {/* 3-Column Mosaic of Stadium Capsules */}
                <View style={styles.mosaicGrid}>
                  {/* Column 1 */}
                  <View style={styles.mosaicCol}>
                    <View style={styles.stadiumCapsule}>
                      <Image source={{ uri: AVATARS.womanBlack }} style={styles.stadiumCapsuleImg} />
                    </View>
                    <View style={styles.floatingCenterBadge}>
                      <Ionicons name="calendar" size={13} color="#FFFFFF" />
                    </View>
                    <View style={styles.stadiumCapsule}>
                      <Image source={{ uri: AVATARS.youngWomanYellow }} style={styles.stadiumCapsuleImg} />
                    </View>
                  </View>

                  {/* Column 2 */}
                  <View style={styles.mosaicCol}>
                    <View style={styles.stadiumCapsule}>
                      <Image source={{ uri: AVATARS.manBeard }} style={styles.stadiumCapsuleImg} />
                    </View>
                    <View style={styles.floatingCenterBadge}>
                      <Ionicons name="cart" size={13} color="#FFFFFF" />
                    </View>
                    <View style={styles.stadiumCapsule}>
                      <Image source={{ uri: AVATARS.grandma }} style={styles.stadiumCapsuleImg} />
                    </View>
                  </View>

                  {/* Column 3 */}
                  <View style={styles.mosaicCol}>
                    <View style={styles.stadiumCapsule}>
                      <Image source={{ uri: AVATARS.grandpa }} style={styles.stadiumCapsuleImg} />
                    </View>
                    <View style={styles.floatingCenterBadge}>
                      <Ionicons name="chatbubble" size={13} color="#FFFFFF" />
                    </View>
                    <View style={styles.stadiumCapsule}>
                      <Image source={{ uri: AVATARS.boy }} style={styles.stadiumCapsuleImg} />
                    </View>
                  </View>
                </View>

                {/* Sparkles */}
                <Text style={[styles.sparkleMark, { top: 30, left: 10 }]}>✦</Text>
                <Text style={[styles.sparkleMark, { top: 110, right: 10 }]}>✦</Text>
                <Text style={[styles.sparkleMark, { bottom: 40, left: 24 }]}>✧</Text>
              </View>

              {/* Title & Description */}
              <View style={styles.copyBox}>
                <Text style={styles.slideTitle}>
                  Stay Connected{"\n"}Together
                </Text>
                <Text style={styles.slideSubtitle}>
                  Share plans, assign tasks, and keep your whole family perfectly in sync.
                </Text>
              </View>

              {/* Action Button: Get Started */}
              <Pressable
                onPress={() => setViewMode("auth")}
                style={styles.onboardingActionBtn}
              >
                <Text style={styles.onboardingActionBtnText}>Get Started →</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Screen>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. AUTHENTICATION SHEET MODE (PHONE & 1-TAP GOOGLE)
  // ---------------------------------------------------------------------------
  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS === "ios"}
      >
        <View style={styles.header}>
          <Pressable onPress={() => setViewMode("onboarding")} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Sign In / Register</Text>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Brand Banner */}
          <View style={styles.heroSection}>
            <View style={styles.heroIcon}>
              <Ionicons name="book" size={30} color={colors.terra} />
            </View>
            <Text style={styles.heroTitle}>Welcome to Yesterday</Text>
            <Text style={styles.heroSubtitle}>
              Preserve family oral stories, map ancestors, and collaborate with loved ones across generations.
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
                <Text style={styles.googleTitle}>Sign In with Google</Text>
                <Text style={styles.googleDesc}>
                  Sign in with any personal or family Google account to sync your family tree, preserve oral histories, and collaborate across devices.
                </Text>
              </View>

              {/* Primary Action: Official Google Sign-In via OAuth */}
              <Pressable
                onPress={handleGoogleWeb}
                disabled={loading}
                style={styles.googleOfficialBtn}
              >
                <Ionicons name="logo-google" size={20} color="#EA4335" />
                <Text style={styles.googleOfficialBtnText}>Continue with Google</Text>
              </Pressable>

              <Text style={styles.googleSecurityNote}>
                Secure authentication powered by Google Identity. We only access your basic profile (name, email, avatar).
              </Text>
            </View>
          )}

          {/* Quick Return to Walkthrough */}
          <Pressable onPress={() => setViewMode("onboarding")} style={styles.walkthroughLinkBtn}>
            <Ionicons name="sparkles-outline" size={14} color="#8B4513" />
            <Text style={styles.walkthroughLinkText}>View Introduction Tour</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ---------------------------------------------------------------------------
  // ONBOARDING STYLES (MATCHING SCREENSHOT)
  // ---------------------------------------------------------------------------
  onboardingRoot: {
    flex: 1,
    backgroundColor: "#FBF6F0",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 24
  },
  onboardingTopNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16
  },
  navRoundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2C221E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2
  },
  progressSegmentsRow: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 18
  },
  segmentBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E4D8CB"
  },
  segmentBarActive: {
    backgroundColor: "#231815"
  },
  skipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6E5D53"
  },
  slideWrap: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10
  },
  graphicBox: {
    width: "100%",
    height: 340,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },

  // Slide 1: Constellation
  orbitRingOuter: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: "#F0E4D8",
    opacity: 0.9
  },
  orbitRingInner: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "#F0E4D8",
    opacity: 0.9
  },
  centerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: "#2C221E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 10
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#231815",
    alignItems: "center",
    justifyContent: "center"
  },
  centerPillText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#231815"
  },
  orbitAvatarWrapper: {
    position: "absolute",
    zIndex: 8
  },
  orbitAvatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: "#FFFFFF"
  },
  orbitAvatarMedium: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#FFFFFF"
  },
  orbitAvatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#FFFFFF"
  },
  floatingDarkBadge: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#231815",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3
  },
  sparkleMark: {
    position: "absolute",
    color: "#E8A882",
    fontSize: 18,
    fontWeight: "900"
  },

  // Slide 2: Mockup Card
  mockupCard: {
    width: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    shadowColor: "#2C221E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#F0E7DD"
  },
  mockStatusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  mockTime: {
    fontSize: 11,
    fontWeight: "800",
    color: "#2C221E"
  },
  mockStatusRight: {
    flexDirection: "row",
    gap: 4
  },
  taskCardItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F7F2EC"
  },
  taskCardAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16
  },
  taskCardInfo: {
    flex: 1
  },
  taskCardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#2C221E"
  },
  taskCardTime: {
    fontSize: 11,
    color: "#7A6E65",
    marginTop: 1
  },
  todayTag: {
    backgroundColor: "#FCEEE4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  todayTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#C25E36"
  },
  tomorrowTag: {
    backgroundColor: "#EAF2FC",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  tomorrowTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2E6BA4"
  },
  checkboxItemPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FAF6F0",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 8
  },
  mockCheckboxSquare: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#A39385"
  },
  checkboxItemText: {
    fontSize: 12,
    color: "#5C4F46",
    fontWeight: "600"
  },
  bottomAvatarsCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 22
  },
  clusterAvatarTiny: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFFFFF"
  },
  clusterAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFFFFF"
  },
  clusterAvatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: "#FFFFFF"
  },

  // Slide 3: Mosaic of Capsules
  mosaicGrid: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    width: "100%"
  },
  mosaicCol: {
    alignItems: "center",
    gap: 10
  },
  stadiumCapsule: {
    width: 90,
    height: 120,
    borderRadius: 45,
    overflow: "hidden",
    shadowColor: "#2C221E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4
  },
  stadiumCapsuleImg: {
    width: "100%",
    height: "100%"
  },
  floatingCenterBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#231815",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    marginVertical: -8
  },

  // Common Slide Copy & Action Buttons
  copyBox: {
    alignItems: "center",
    paddingHorizontal: 16,
    marginVertical: 14
  },
  slideTitle: {
    fontSize: 25,
    fontWeight: "900",
    fontFamily: "serif",
    color: "#1E1512",
    textAlign: "center",
    lineHeight: 33,
    marginBottom: 8
  },
  slideSubtitle: {
    fontSize: 13,
    color: "#6E6259",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320
  },
  onboardingActionBtn: {
    backgroundColor: "#231815",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    minWidth: 170,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#231815",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 6
  },
  onboardingActionBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  },

  // ---------------------------------------------------------------------------
  // AUTHENTICATION SHEET STYLES
  // ---------------------------------------------------------------------------
  container: {
    flex: 1
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink
  },
  backBtn: {
    padding: 6
  },
  closeBtn: {
    padding: 6
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 40
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 6
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F2E7D9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.ink,
    fontFamily: "serif"
  },
  heroSubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 300
  },
  switcher: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 16
  },
  switchTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md - 2
  },
  switchTabActive: {
    backgroundColor: colors.terra
  },
  switchTabText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.ink
  },
  switchTabTextActive: {
    color: colors.white
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: colors.muted,
    marginBottom: 6,
    marginTop: 10
  },
  input: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.ink,
    borderWidth: 1,
    borderColor: "#EBDCCE"
  },
  otpInput: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 8,
    textAlign: "center"
  },
  helperText: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 16
  },
  primaryBtn: {
    backgroundColor: colors.terra,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 18
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
    backgroundColor: "#EDF7ED",
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 10
  },
  sentTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.green
  },
  sentSub: {
    fontSize: 12,
    color: colors.ink,
    marginTop: 2
  },
  changeLink: {
    color: colors.terra,
    fontSize: 12,
    fontWeight: "700"
  },
  devOtpBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FCEEE4",
    padding: 10,
    borderRadius: radius.md,
    marginBottom: 10
  },
  devOtpText: {
    fontSize: 12,
    color: colors.terra
  },
  resendBtn: {
    alignItems: "center",
    marginTop: 14,
    padding: 6
  },
  resendBtnText: {
    fontSize: 12,
    color: colors.terra,
    fontWeight: "700"
  },

  // Google Tab
  googleHero: {
    alignItems: "center",
    marginBottom: 12
  },
  googleIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFF2F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8
  },
  googleTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink
  },
  googleDesc: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 17,
    paddingHorizontal: 10
  },
  googleOfficialBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: "#E0D7CE",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2
  },
  googleOfficialBtnText: {
    color: "#2C221E",
    fontSize: 16,
    fontWeight: "700"
  },
  googleSecurityNote: {
    fontSize: 11,
    color: "#8C7E74",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 16,
    paddingHorizontal: 8
  },
  manualBox: {
    marginTop: 6
  },
  googleManualBtn: {
    backgroundColor: "#2C221E",
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  googleManualBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700"
  },
  googleBtn: {
    backgroundColor: "#2C221E",
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 16
  },
  googleBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "800"
  },
  orDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 8
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
    letterSpacing: 0.6
  },
  googleWebBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#EBDCCE"
  },
  googleWebBtnText: {
    color: "#2C221E",
    fontSize: 13,
    fontWeight: "700"
  },
  walkthroughLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    marginTop: 8
  },
  walkthroughLinkText: {
    color: "#8B4513",
    fontSize: 13,
    fontWeight: "700"
  },

  // Logged In Card
  loggedInCard: {
    margin: 16,
    padding: 24,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#5C2E17",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12
  },
  avatarText: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "900"
  },
  userName: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.ink,
    fontFamily: "serif"
  },
  userSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4
  },
  badgeRow: {
    marginTop: 10
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EDF7ED",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999
  },
  activeBadgeText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "800"
  },
  profileDivider: {
    width: "100%",
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18
  },
  profileNote: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FCEEEA",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.md,
    marginBottom: 10,
    width: "100%",
    justifyContent: "center"
  },
  logoutBtnText: {
    color: "#A23A2A",
    fontSize: 13,
    fontWeight: "800"
  },
  continueBtn: {
    paddingVertical: 10,
    width: "100%",
    alignItems: "center"
  },
  continueBtnText: {
    color: colors.terra,
    fontSize: 13,
    fontWeight: "700"
  }
});
