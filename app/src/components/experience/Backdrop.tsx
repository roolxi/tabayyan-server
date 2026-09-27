import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Stop, Rect, Path } from "react-native-svg";
import { palette } from "./theme";
import { SilkField } from "./SilkField";
/** A static optical field: depth behind translucent controls, no expensive full-screen animation. */
export function Backdrop({
  busy = false,
  context = "hadith",
  animated = false,
}: {
  busy?: boolean;
  context?: string;
  animated?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}
    >
      <LinearGradient
        colors={["#12372A", "#071D15", "#061410"]}
        start={{ x: 0.95, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {animated && <SilkField busy={busy} context={context} />}
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 430 932"
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <RadialGradient id="emerald">
            <Stop offset="0" stopColor="#86DBA8" stopOpacity={0.24} />
            <Stop offset="1" stopColor="#2C6D4C" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="low">
            <Stop offset="0" stopColor="#459E6A" stopOpacity={0.17} />
            <Stop offset="1" stopColor="#123F29" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={110} y={-220} width={580} height={790} fill="url(#emerald)" />
        <Rect x={-280} y={350} width={680} height={670} fill="url(#low)" />
        <Path
          d="M520 -80C75 70 510 410 30 1020"
          stroke="#BCF8CD"
          strokeOpacity={0.06}
          strokeWidth={54}
          fill="none"
        />
        <Path
          d="M530 -80C85 70 520 410 40 1020"
          stroke="#CAFFDC"
          strokeOpacity={0.1}
          strokeWidth={1}
          fill="none"
        />
      </Svg>
    </View>
  );
}
