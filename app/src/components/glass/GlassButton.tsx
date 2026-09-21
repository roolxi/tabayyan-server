import React from "react";
import {
  AccessibilityRole,
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { AdaptiveGlass } from "./AdaptiveGlass";
import { colors } from "../../theme/colors";
import { springConfigs } from "../../theme/motion";
import { radii, spacing } from "../../theme/spacing";

export interface GlassButtonProps {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "glass" | "danger" | "gold";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const GlassButton: React.FC<GlassButtonProps> = ({
  label,
  onPress,
  icon,
  variant = "glass",
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (disabled || loading) return;
    scale.value = withSpring(0.96, springConfigs.snappy);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    if (disabled || loading) return;
    scale.value = withSpring(1, springConfigs.soft);
  };

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isGold = variant === "gold";

  const buttonStyle = [
    styles.buttonBase,
    isPrimary && styles.primaryButton,
    isDanger && styles.dangerButton,
    isGold && styles.goldButton,
    disabled && styles.disabledButton,
    style,
  ];

  const labelColor = isPrimary
    ? colors.obsidian
    : isDanger
    ? "#FFF"
    : isGold
    ? colors.obsidian
    : colors.ivory;

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled || loading}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      style={animatedStyle}
    >
      <AdaptiveGlass
        borderRadius={radii.md}
        style={buttonStyle}
        highlightBorder={!isPrimary && !isGold}
      >
        <View style={styles.contentRow}>
          {loading ? (
            <ActivityIndicator size="small" color={labelColor} />
          ) : (
            <>
              {icon && <View style={styles.iconContainer}>{icon}</View>}
              <Text style={[styles.label, { color: labelColor }, textStyle]}>
                {label}
              </Text>
            </>
          )}
        </View>
      </AdaptiveGlass>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  buttonBase: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  contentRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm + 2,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  dangerButton: {
    backgroundColor: "rgba(239, 68, 68, 0.8)",
    borderColor: colors.danger,
  },
  goldButton: {
    backgroundColor: colors.warmGold,
    borderColor: colors.warmGold,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
