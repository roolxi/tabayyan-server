import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { AdaptiveGlass } from "../glass/AdaptiveGlass";
import { colors } from "../../theme/colors";
import { radii, spacing } from "../../theme/spacing";

export interface ScanProgressProps {
  mediaType: "image" | "video";
  isComplete: boolean;
  isError: boolean;
  errorMessage?: string;
  onIrisOpened?: () => void;
}

const IMAGE_STAGES = [
  "قراءة الصورة",
  "استخراج النص",
  "مطابقة المصدر",
  "إعداد النتيجة",
];

const VIDEO_STAGES = [
  "رفع الفيديو",
  "استخراج الصوت",
  "التعرّف على النص",
  "مطابقة المصدر",
  "إعداد النتيجة",
];

const RING_SIZE = 190;

export const ScanProgress: React.FC<ScanProgressProps> = ({
  mediaType,
  isComplete,
  isError,
  errorMessage,
  onIrisOpened,
}) => {
  const stages = mediaType === "image" ? IMAGE_STAGES : VIDEO_STAGES;
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  const progress = useSharedValue(0);
  const rotation = useSharedValue(0);
  const irisScale = useSharedValue(1);
  const irisOpacity = useSharedValue(1);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotion(enabled);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Presentational progress up to 90%
  useEffect(() => {
    if (isError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (isComplete) {
      // Complete to 100%, trigger iris opening
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCurrentStageIndex(stages.length - 1);

      let triggered = false;
      const triggerIrisSafe = () => {
        if (!triggered) {
          triggered = true;
          if (onIrisOpened) {
            onIrisOpened();
          }
        }
      };

      if (reduceMotion) {
        progress.value = 1;
        irisScale.value = 1.45;
        irisOpacity.value = 0;
        triggerIrisSafe();
        return;
      }

      // Safety timeout: ensure onIrisOpened is called even if animation drops frames
      const fallbackTimer = setTimeout(() => {
        triggerIrisSafe();
      }, 950);

      progress.value = withTiming(1, { duration: 300 }, (isFinished) => {
        if (isFinished) {
          irisScale.value = withTiming(1.45, { duration: 400, easing: Easing.out(Easing.cubic) });
          irisOpacity.value = withTiming(0, { duration: 400 }, (irisFinished) => {
            if (irisFinished) {
              runOnJS(triggerIrisSafe)();
            }
          });
        }
      });

      return () => {
        clearTimeout(fallbackTimer);
      };
    }

    // Advance slowly up to 0.90 while in progress
    progress.value = withTiming(0.90, {
      duration: mediaType === "image" ? 14000 : 26000,
      easing: Easing.out(Easing.quad),
    });

    rotation.value = withRepeat(
      withTiming(360, { duration: 3200, easing: Easing.linear }),
      -1,
      false
    );

    // Increment presentation stages smoothly
    const intervalMs = mediaType === "image" ? 3000 : 5000;
    const intervalId = setInterval(() => {
      setCurrentStageIndex((prev) => {
        if (prev < stages.length - 2) return prev + 1;
        return prev;
      });
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [isComplete, isError, mediaType, reduceMotion]);

  const animatedRingStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${rotation.value}deg` },
        { scale: irisScale.value },
      ],
      opacity: irisOpacity.value,
    };
  });

  const currentStageText = stages[currentStageIndex];

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`جارٍ التحقق: ${currentStageText}`}
    >
      <View style={styles.ringWrapper}>
        {/* Animated Scanning Ring */}
        <Animated.View style={[styles.outerScanRing, animatedRingStyle]}>
          <View
            style={[
              styles.ringArc,
              isError && { borderColor: colors.danger },
            ]}
          />
        </Animated.View>

        {/* Inner Glass Core */}
        <AdaptiveGlass
          borderRadius={radii.full}
          style={styles.innerGlassCore}
          highlightBorder
        >
          <View style={styles.coreContent}>
            {isError ? (
              <>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorText}>تعذّر الفحص</Text>
              </>
            ) : (
              <>
                <Text style={styles.stageNumber}>
                  {currentStageIndex + 1} / {stages.length}
                </Text>
                <Text style={styles.stageLabel}>{currentStageText}</Text>
                <Text style={styles.subtext}>جارٍ التحقق من المصدر...</Text>
              </>
            )}
          </View>
        </AdaptiveGlass>
      </View>

      {isError && errorMessage ? (
        <Text style={styles.errorMessageText}>{errorMessage}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  outerScanRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  ringArc: {
    width: "100%",
    height: "100%",
    borderRadius: radii.full,
    borderWidth: 2.5,
    borderColor: colors.emerald,
    borderTopColor: colors.spectralMint,
    borderRightColor: "transparent",
    borderBottomColor: colors.emerald,
    borderLeftColor: "transparent",
  },
  innerGlassCore: {
    width: RING_SIZE - 28,
    height: RING_SIZE - 28,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 26, 20, 0.8)",
  },
  coreContent: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  stageNumber: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.spectralMint,
    marginBottom: spacing.xs,
    letterSpacing: 1,
  },
  stageLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ivory,
    textAlign: "center",
    marginBottom: spacing.xs - 2,
  },
  subtext: {
    fontSize: 11,
    color: colors.muted,
    textAlign: "center",
  },
  errorIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  errorText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.danger,
    textAlign: "center",
  },
  errorMessageText: {
    marginTop: spacing.md,
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
