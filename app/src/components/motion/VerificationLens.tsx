import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Accelerometer } from "expo-sensors";
import Animated, {
  Easing,
  cancelAnimation,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { AdaptiveGlass } from "../glass/AdaptiveGlass";
import { colors } from "../../theme/colors";
import { durations, springConfigs } from "../../theme/motion";
import { radii, spacing } from "../../theme/spacing";
import { shadows } from "../../theme/shadows";
import { useSceneMotion } from "../../hooks/useSceneMotion";

const LENS_SIZE = 148;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export interface VerificationLensProps {
  onCapturePhoto: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
}

export const VerificationLens: React.FC<VerificationLensProps> = ({
  onCapturePhoto,
  onPickImage,
  onPickVideo,
}) => {
  const motionEnabled = useSceneMotion();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  // Motion values
  const scale = useSharedValue(1);
  const breathingScale = useSharedValue(1);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const rotationAngle = useSharedValue(0);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotion(enabled);
    });

    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setReduceMotion(enabled);
    });

    return () => {
      isMounted = false;
      sub?.remove();
    };
  }, []);

  // Breathing animation & spectral highlight rotation
  useEffect(() => {
    if (reduceMotion || !motionEnabled) {
      breathingScale.value = 1;
      rotationAngle.value = 0;
      return;
    }

    breathingScale.value = withRepeat(
      withSequence(
        withTiming(1.025, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 2800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    rotationAngle.value = withRepeat(
      withTiming(360, { duration: 12000, easing: Easing.linear }),
      -1,
      false
    );
    return () => { cancelAnimation(breathingScale); cancelAnimation(rotationAngle); };
  }, [reduceMotion, motionEnabled]);

  // Subtle device tilt via accelerometer (only small parallax of a few pixels)
  useEffect(() => {
    if (reduceMotion || !motionEnabled) return;

    let subscription: { remove: () => void } | null = null;
    let active = true;
    Accelerometer.isAvailableAsync().then((available) => {
      if (available && active) {
        Accelerometer.setUpdateInterval(100);
        subscription = Accelerometer.addListener(({ x, y }) => {
          // Clamp subtle offset to +- 6 pixels
          tiltX.value = withSpring(Math.max(-6, Math.min(6, x * 8)), springConfigs.soft);
          tiltY.value = withSpring(Math.max(-6, Math.min(6, -y * 8)), springConfigs.soft);
        });
      }
    }).catch(() => {});

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [reduceMotion, motionEnabled]);

  const handlePressIn = () => {
    scale.value = withSpring(0.95, springConfigs.snappy);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfigs.soft);
  };

  const handleToggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExpanded((prev) => !prev);
  };

  const animatedLensStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value * (isExpanded ? 1 : breathingScale.value) },
      { translateX: tiltX.value },
      { translateY: tiltY.value },
    ],
  }));

  return (
    <View style={styles.container}>
      {!isExpanded ? (
        // Floating circular glass lens
        <Animated.View style={[styles.lensWrapper, animatedLensStyle]}>
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handleToggleExpand}
            accessible
            accessibilityRole="button"
            accessibilityLabel="عدسة الفحص، اضغط لاختيار صورة أو فيديو"
            accessibilityHint="تفتح قائمة التقاط صورة أو اختيار ملف للتحقق منه"
            style={styles.pressable}
          >
            <AdaptiveGlass
              borderRadius={radii.full}
              style={[styles.lensCircle, shadows.lensGlow]}
              highlightBorder
            >
              {/* Internal spectral highlight shimmer */}
              <View style={styles.shimmerRing} pointerEvents="none" />

              <View style={styles.iconCircle}>
                {Platform.OS === "ios" ? (
                  <SymbolView
                    name="viewfinder"
                    size={46}
                    tintColor={colors.spectralMint}
                    style={styles.symbol}
                  />
                ) : (
                  <View style={styles.fallbackIconRing}>
                    <View style={styles.fallbackIconDot} />
                  </View>
                )}
              </View>

              <Text style={styles.lensPromptText}>افحص صورة أو فيديو</Text>
            </AdaptiveGlass>
          </Pressable>
        </Animated.View>
      ) : (
        // Expanded glass action sheet morphing fluidly
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(durations.standard)}
          exiting={reduceMotion ? undefined : FadeOutUp.duration(durations.quick)}
          style={styles.sheetWrapper}
        >
          <AdaptiveGlass
            borderRadius={radii.xl}
            style={[styles.sheetCard, shadows.glassCard]}
            highlightBorder
          >
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>اختر وسيلة الفحص</Text>
              <Pressable
                onPress={handleToggleExpand}
                accessible
                accessibilityRole="button"
                accessibilityLabel="إغلاق قائمة الفحص"
                hitSlop={12}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.sheetActionsContainer}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsExpanded(false);
                  onCapturePhoto();
                }}
                accessible
                accessibilityRole="button"
                accessibilityLabel="التقاط صورة بالكاميرا"
                style={styles.actionRow}
              >
                <View style={styles.actionIconContainer}>
                  {Platform.OS === "ios" ? (
                    <SymbolView name="camera.fill" size={22} tintColor={colors.emerald} />
                  ) : null}
                </View>
                <Text style={styles.actionLabel}>التقاط صورة</Text>
              </Pressable>

              <View style={styles.actionDivider} />

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsExpanded(false);
                  onPickImage();
                }}
                accessible
                accessibilityRole="button"
                accessibilityLabel="اختيار صورة من مكتبة الصور"
                style={styles.actionRow}
              >
                <View style={styles.actionIconContainer}>
                  {Platform.OS === "ios" ? (
                    <SymbolView name="photo.fill" size={22} tintColor={colors.emerald} />
                  ) : null}
                </View>
                <Text style={styles.actionLabel}>اختيار صورة</Text>
              </Pressable>

              <View style={styles.actionDivider} />

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsExpanded(false);
                  onPickVideo();
                }}
                accessible
                accessibilityRole="button"
                accessibilityLabel="اختيار مقطع فيديو"
                style={styles.actionRow}
              >
                <View style={styles.actionIconContainer}>
                  {Platform.OS === "ios" ? (
                    <SymbolView name="video.fill" size={22} tintColor={colors.emerald} />
                  ) : null}
                </View>
                <Text style={styles.actionLabel}>اختيار فيديو</Text>
              </Pressable>
            </View>
          </AdaptiveGlass>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.lg,
  },
  lensWrapper: {
    width: LENS_SIZE,
    height: LENS_SIZE,
  },
  pressable: {
    width: "100%",
    height: "100%",
  },
  lensCircle: {
    width: "100%",
    height: "100%",
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 26, 20, 0.72)",
    borderColor: "rgba(52, 211, 153, 0.4)",
    borderWidth: 1.5,
    padding: spacing.sm,
  },
  shimmerRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "rgba(167, 243, 208, 0.25)",
  },
  iconCircle: {
    marginBottom: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  symbol: {
    width: 46,
    height: 46,
  },
  fallbackIconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.spectralMint,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackIconDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.emerald,
  },
  lensPromptText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.ivory,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  sheetWrapper: {
    width: Math.min(SCREEN_WIDTH - 48, 340),
  },
  sheetCard: {
    padding: spacing.md + 2,
    backgroundColor: colors.cardBackground,
  },
  sheetHeaderRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ivory,
    textAlign: "right",
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeText: {
    fontSize: 18,
    color: colors.muted,
  },
  sheetActionsContainer: {
    backgroundColor: "rgba(5, 9, 7, 0.5)",
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  actionRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  actionIconContainer: {
    width: 32,
    alignItems: "center",
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ivory,
    flex: 1,
    textAlign: "right",
  },
  actionDivider: {
    height: 1,
    backgroundColor: "rgba(52, 211, 153, 0.12)",
    marginHorizontal: spacing.md,
  },
});
