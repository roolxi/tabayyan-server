import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colors } from "../../theme/colors";
import { useSceneMotion } from "../../hooks/useSceneMotion";

/** Indeterminate loading, deliberately not a fabricated percentage. */
export function SearchLoading() {
  const motion = useSceneMotion();
  const phase = useSharedValue(0);
  useEffect(() => {
    if (motion) phase.value = withRepeat(withTiming(1, { duration: 1450, easing: Easing.inOut(Easing.sin) }), -1, true);
    else phase.value = 0.5;
    return () => cancelAnimation(phase);
  }, [motion]);
  const pulse = useAnimatedStyle(() => ({ opacity: 0.35 + phase.value * 0.55 }));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="جارٍ البحث عن المصدر" style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.label}>نبحث عن النصّ ومصدره</Text>
        <Animated.View style={[styles.beacon, pulse]} />
      </View>
      {[0, 1].map(index => (
        <View key={index} style={styles.card}>
          <Animated.View style={[styles.line, { width: "40%", backgroundColor: colors.warmGold }, pulse]} />
          <Animated.View style={[styles.line, { width: "94%", marginTop: 16 }, pulse]} />
          <Animated.View style={[styles.line, { width: "76%" }, pulse]} />
          <Animated.View style={[styles.line, { width: "56%" }, pulse]} />
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 14, paddingVertical: 8 },
  heading: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  label: { color: colors.spectralMint, fontSize: 13 },
  beacon: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.emerald },
  card: { padding: 22, borderRadius: 22, borderWidth: 1, borderColor: colors.glassBorderSubtle,
    backgroundColor: colors.deepGreen, alignItems: "flex-end", gap: 10 },
  line: { height: 7, borderRadius: 4, backgroundColor: "#426356" },
});
