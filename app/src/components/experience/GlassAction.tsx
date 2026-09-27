import React, { useEffect, useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ReduceMotion,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Icon, IconName } from "./Icon";
import { Glass } from "./Glass";
import { SpecularRim } from "./SpecularRim";
import { easeInOut, palette, spring } from "./theme";
const AnimatedPath = Animated.createAnimatedComponent(Path);
// Exact seven-vertex arrow/square correspondence from React Bits PromptBar.
const ARROW = [
  12, 4.5, 18.5, 11, 14.25, 11, 14.25, 19.5, 9.75, 19.5, 9.75, 11, 5.5, 11,
];
const SQUARE = [12, 6, 18, 6, 18, 12, 18, 18, 6, 18, 6, 12, 6, 6];
function SendGlyph({ busy }: { busy: boolean }) {
  const t = useSharedValue(busy ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(busy ? 1 : 0, {
      duration: 450,
      easing: easeInOut,
      reduceMotion: ReduceMotion.System,
    });
  }, [busy]);
  const props = useAnimatedProps(() => {
    let d = "";
    for (let i = 0; i < ARROW.length; i += 2)
      d += `${i ? "L" : "M"}${ARROW[i] + (SQUARE[i] - ARROW[i]) * t.value} ${ARROW[i + 1] + (SQUARE[i + 1] - ARROW[i + 1]) * t.value}`;
    return { d: d + "Z" };
  });
  const style = useAnimatedStyle(() => {
    const goo = Math.sin(t.value * Math.PI);
    return {
      transform: [
        { scaleX: 1 - 0.22 * goo },
        { scaleY: 1 + 0.12 * goo },
        { rotate: `${-12 * goo}deg` },
      ],
    };
  });
  return (
    <Animated.View style={style}>
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <AnimatedPath animatedProps={props} fill={palette.mint} />
      </Svg>
    </Animated.View>
  );
}
export function GlassAction({
  label,
  onPress,
  icon,
  primary = false,
  busy = false,
  disabled = false,
  style,
  iconOnly = false,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  primary?: boolean;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  iconOnly?: boolean;
}) {
  const scale = useSharedValue(1),
    glow = useSharedValue(0);
  const [pressed, setPressed] = useState(false),
    [touchX, setTouchX] = useState(0.5);
  const [width, setWidth] = useState(160);
  const transform = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.45 : 1,
  }));
  const sheen = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Animated.View style={[style, transform]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={onPress}
        onPressIn={(e) => {
          setTouchX(e.nativeEvent.locationX / width);
          setPressed(true);
          scale.value = withSpring(0.97, spring);
          glow.value = withTiming(1, { duration: 120 });
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
        }}
        onPressOut={() => {
          setPressed(false);
          scale.value = withSpring(1, spring);
          glow.value = withTiming(0, { duration: 350 });
        }}
      >
        <Glass
          radius={primary ? 25 : 22}
          style={[
            styles.face,
            primary && styles.primary,
            iconOnly && { width: 46, paddingHorizontal: 0 },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(195,255,214,.12)" },
              sheen,
            ]}
          />
          <View style={styles.row}>
            {primary ? (
              <SendGlyph busy={busy} />
            ) : icon ? (
              <Icon name={icon} size={19} color={palette.mint} />
            ) : null}
            {!iconOnly && (
              <Text
                style={[
                  styles.label,
                  primary && { fontWeight: "700", color: palette.mint },
                ]}
              >
                {label}
              </Text>
            )}
          </View>
          {primary && !disabled && (
            <SpecularRim pressed={pressed} touchX={touchX} />
          )}
        </Glass>
      </Pressable>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  face: { minHeight: 46, justifyContent: "center", paddingHorizontal: 16 },
  primary: {
    minHeight: 52,
    backgroundColor: "rgba(120,221,151,.13)",
    borderColor: "rgba(196,255,215,.3)",
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  label: { fontSize: 13, color: palette.text, textAlign: "center" },
});
