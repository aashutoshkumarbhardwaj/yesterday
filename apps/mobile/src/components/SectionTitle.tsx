import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  return <View style={styles.row}><Text style={styles.title}>{title}</Text>{action ? <Text style={styles.action}>{action}</Text> : null}</View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.ink, fontSize: 21, fontWeight: "700", letterSpacing: -0.4 },
  action: { color: colors.terra, fontSize: 13, fontWeight: "700" }
});