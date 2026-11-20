import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../src/theme";
import { initSyncSession } from "../src/lib/sync-client";
import { AuthProvider } from "../src/lib/auth-context";

export default function RootLayout() {
  useEffect(() => {
    initSyncSession().catch(console.error);
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
