import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  ViewProps,
} from "react-native";
import { BlurView } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { palette } from "./theme";
/** Glass Surface material translated to native Liquid Glass; frosted fallback, never simulated refraction. */
export function Glass({
  children,
  style,
  radius = 28,
  strong = false,
  ...props
}: ViewProps & { radius?: number; strong?: boolean }) {
  const [solid, setSolid] = useState(true);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((v) => {
        if (alive) setSolid(v);
      })
      .catch(() => {
        if (alive) setSolid(false);
      });
    const sub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setSolid,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  const native =
    !solid &&
    Platform.OS === "ios" &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable();
  return (
    <View
      {...props}
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: palette.edge,
          backgroundColor: solid
            ? "#132C22"
            : strong
              ? "rgba(52,99,75,.20)"
              : "rgba(26,66,46,.12)",
        },
        style,
      ]}
    >
      {native ? (
        <GlassView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          colorScheme="dark"
        />
      ) : !solid && Platform.OS !== "android" ? (
        <BlurView
          pointerEvents="none"
          tint="dark"
          intensity={strong ? 34 : 22}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {!solid && (
        <LinearGradient
          pointerEvents="none"
          colors={[
            "rgba(223,255,234,.12)",
            "rgba(189,255,217,.025)",
            "rgba(13,36,26,.08)",
          ]}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: radius / 2,
          right: radius / 2,
          height: 1,
          backgroundColor: solid ? "transparent" : "rgba(226,255,237,.25)",
        }}
      />
      {children}
    </View>
  );
}
