import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme";

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home-outline",
  stories: "book-outline",
  family: "people-outline",
  ask: "sparkles-outline"
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.terra,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: 76,
          paddingTop: 9,
          paddingBottom: 12,
          borderTopColor: colors.border,
          backgroundColor: colors.card
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={icons[route.name] ?? "ellipse-outline"} color={typeof color === "string" ? color : undefined} size={size} />
        )
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="stories" options={{ title: "Stories" }} />
      <Tabs.Screen name="family" options={{ title: "Family" }} />
      <Tabs.Screen name="ask" options={{ title: "Ask" }} />
    </Tabs>
  );
}