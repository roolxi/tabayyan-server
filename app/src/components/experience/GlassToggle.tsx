import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSceneMotion } from "../../hooks/useSceneMotion";
import { palette } from "./theme";

export interface GlassToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  supportingText?: string;
  disabled?: boolean;
}

export function GlassToggle({
  value,
  onChange,
  label,
  supportingText,
  disabled = false,
}: GlassToggleProps) {
  const motion = useSceneMotion();
  const thumbOffset = useSharedValue(value ? 18 : 0);

  useEffect(() => {
    thumbOffset.value = motion
      ? withSpring(value ? 18 : 0, {
          damping: 16,
          stiffness: 180,
          reduceMotion: ReduceMotion.System,
        })
      : value
        ? 18
        : 0;
  }, [value, motion]);

  const thumbAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbOffset.value }],
  }));

  const handlePress = () => {
    if (disabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(!value);
  };

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={supportingText}
      disabled={disabled}
      onPress={handlePress}
      style={styles.container}
    >
      <View style={styles.textColumn}>
        <Text style={styles.label}>{label}</Text>
        {Boolean(supportingText) && (
          <Text style={styles.supportingText}>{supportingText}</Text>
        )}
      </View>
      <View style={[styles.track, value && styles.trackActive]}>
        <Animated.View style={[styles.thumb, thumbAnimStyle]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 12,
  },
  textColumn: {
    flex: 1,
    alignItems: "flex-end",
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.text,
    textAlign: "right",
  },
  supportingText: {
    fontSize: 11,
    color: palette.dim,
    textAlign: "right",
  },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    direction: "ltr",
    backgroundColor: "rgba(0, 24, 14, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(192, 255, 220, 0.15)",
    justifyContent: "center",
  },
  trackActive: {
    backgroundColor: "rgba(10, 194, 139, 0.25)",
    borderColor: palette.mint,
  },
  thumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.mint,
    shadowColor: palette.mint,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
});

