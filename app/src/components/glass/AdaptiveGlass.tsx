import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewProps,
  ViewStyle,
} from "react-native";
import { BlurView, BlurTint } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { colors } from "../../theme/colors";

export interface AdaptiveGlassProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  blurTint?: BlurTint;
  intensity?: number;
  borderRadius?: number;
  highlightBorder?: boolean;
}

export const AdaptiveGlass: React.FC<AdaptiveGlassProps> = ({
  style,
  children,
  blurTint = "dark",
  intensity = 65,
  borderRadius = 16,
  highlightBorder = true,
  ...rest
}) => {
  const [reduceTransparency, setReduceTransparency] = useState<boolean>(false);
  const [hasCheckedAccessibility, setHasCheckedAccessibility] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (isMounted) {
        setReduceTransparency(enabled);
        setHasCheckedAccessibility(true);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      (enabled) => {
        setReduceTransparency(enabled);
      }
    );

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  const borderStyle: ViewStyle = highlightBorder
    ? {
        borderColor: reduceTransparency ? colors.solidBorder : colors.glassBorder,
        borderWidth: 1,
      }
    : {};

  // 1. Accessibility High-Contrast Fallback (Reduce Transparency)
  if (reduceTransparency) {
    return (
      <View
        style={[
          styles.solidFallback,
          { borderRadius },
          borderStyle,
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }

  // 2. Native iOS Liquid Glass if available
  const canUseNativeGlass =
    Platform.OS === "ios" &&
    isGlassEffectAPIAvailable?.() &&
    isLiquidGlassAvailable?.();

  if (canUseNativeGlass) {
    return (
      <GlassView
        style={[styles.glassBase, { borderRadius }, borderStyle, style]}
        glassEffectStyle="clear"
        colorScheme="dark"
        {...rest}
      >
        {children}
      </GlassView>
    );
  }

  // 3. Robust cross-platform fallback with BlurView
  return (
    <View
      style={[
        styles.blurContainer,
        { borderRadius },
        borderStyle,
        style,
      ]}
      {...rest}
    >
      <BlurView
        tint={blurTint}
        intensity={intensity}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.tintOverlay, { borderRadius }]} pointerEvents="none" />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  solidFallback: {
    backgroundColor: colors.solidSurface,
    overflow: "hidden",
  },
  glassBase: {
    overflow: "hidden",
    backgroundColor: "rgba(7, 26, 20, 0.45)",
  },
  blurContainer: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "rgba(7, 26, 20, 0.55)",
  },
  tintOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(5, 9, 7, 0.35)",
  },
});
