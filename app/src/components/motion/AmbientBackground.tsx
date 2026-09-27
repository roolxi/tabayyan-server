import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../../theme/colors";
import { useSceneMotion } from "../../hooks/useSceneMotion";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const AmbientBackground: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const motionEnabled = useSceneMotion();
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  const orb1TranslateX = useSharedValue(0);
  const orb1TranslateY = useSharedValue(0);
  const orb2TranslateX = useSharedValue(0);
  const orb2TranslateY = useSharedValue(0);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        setReduceMotion(enabled);
      }
    );

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || !motionEnabled) {
      orb1TranslateX.value = 0;
      orb1TranslateY.value = 0;
      orb2TranslateX.value = 0;
      orb2TranslateY.value = 0;
      return;
    }

    // Extremely slow, graceful ambient floating (14–18 seconds cycle)
    orb1TranslateX.value = withRepeat(
      withTiming(60, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    orb1TranslateY.value = withRepeat(
      withTiming(-80, { duration: 16000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );

    orb2TranslateX.value = withRepeat(
      withTiming(-50, { duration: 18000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    orb2TranslateY.value = withRepeat(
      withTiming(70, { duration: 15000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => {
      [orb1TranslateX, orb1TranslateY, orb2TranslateX, orb2TranslateY].forEach(cancelAnimation);
    };
  }, [reduceMotion, motionEnabled]);

  const animatedOrb1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: orb1TranslateX.value },
      { translateY: orb1TranslateY.value },
    ],
  }));

  const animatedOrb2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: orb2TranslateX.value },
      { translateY: orb2TranslateY.value },
    ],
  }));

  return (
    <View style={styles.container}>
      {/* Base Obsidian canvas */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={[colors.obsidian, "#030806", colors.obsidian]}
          style={StyleSheet.absoluteFill}
        />

        {/* Ambient Emerald Orb 1 */}
        <Animated.View
          style={[styles.ambientOrb1, animatedOrb1Style]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={["rgba(52, 211, 153, 0.09)", "rgba(7, 26, 20, 0.0)"]}
            style={styles.orbGradient}
          />
        </Animated.View>

        {/* Ambient Mint Orb 2 */}
        <Animated.View
          style={[styles.ambientOrb2, animatedOrb2Style]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={["rgba(167, 243, 208, 0.05)", "rgba(6, 95, 70, 0.0)"]}
            style={styles.orbGradient}
          />
        </Animated.View>

        {/* Ambient Warm Gold Tint in center */}
        <View style={styles.ambientGoldCenter} pointerEvents="none" />
      </View>

      {/* Content */}
      <View style={styles.contentContainer}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.obsidian,
    position: "relative",
  },
  contentContainer: {
    flex: 1,
  },
  ambientOrb1: {
    position: "absolute",
    top: SCREEN_HEIGHT * 0.18,
    left: -SCREEN_WIDTH * 0.15,
    width: SCREEN_WIDTH * 1.1,
    height: SCREEN_WIDTH * 1.1,
    borderRadius: SCREEN_WIDTH * 0.55,
  },
  ambientOrb2: {
    position: "absolute",
    bottom: SCREEN_HEIGHT * 0.12,
    right: -SCREEN_WIDTH * 0.2,
    width: SCREEN_WIDTH * 1.2,
    height: SCREEN_WIDTH * 1.2,
    borderRadius: SCREEN_WIDTH * 0.6,
  },
  orbGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 9999,
  },
  ambientGoldCenter: {
    position: "absolute",
    top: SCREEN_HEIGHT * 0.45,
    left: SCREEN_WIDTH * 0.2,
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    borderRadius: SCREEN_WIDTH * 0.3,
    backgroundColor: "rgba(215, 182, 106, 0.025)",
  },
});
