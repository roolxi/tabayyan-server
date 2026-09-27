import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { easeOut, palette } from "./theme";
import { Glass } from "./Glass";
import { useSceneMotion } from "../../hooks/useSceneMotion";
/** Port of React Bits RubberSegment: independent edges, dilation, trailing squash, projected drag. */
export function RubberSegment<T extends string>({
  items,
  value,
  onChange,
  label,
  compact = false,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  compact?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const left = useSharedValue(0),
    right = useSharedValue(0),
    start = useSharedValue(0);
  const previous = useRef(-1);
  const motion = useSceneMotion();
  const index = Math.max(
    0,
    items.findIndex((x) => x.value === value),
  );
  const slot = (width - 8) / items.length;
  const signature = `${width}:${items.length}`;
  const measured = useRef("");
  useEffect(() => {
    if (slot <= 0) return;
    const l = index * slot,
      r = l + slot;
    cancelAnimation(left);
    cancelAnimation(right);
    if (!motion || previous.current < 0) {
      left.value = l;
      right.value = r;
    } else if (previous.current !== index || measured.current !== signature) {
      const dir = index > previous.current ? 1 : -1;
      const tween = {
        duration: 190,
        easing: easeOut,
        reduceMotion: ReduceMotion.System,
      };
      const land = {
        duration: 300,
        dampingRatio: 1,
        reduceMotion: ReduceMotion.System,
      };
      const relax = {
        duration: 160,
        dampingRatio: 1,
        reduceMotion: ReduceMotion.System,
      };
      // Stretch over old + new slots first; the trailing edge squashes 3px on landing.
      left.value = withSequence(
        withTiming(Math.min(left.value, l), tween),
        withSpring(l + (dir > 0 ? 3 : 0), land),
        withSpring(l, relax),
      );
      right.value = withSequence(
        withTiming(Math.max(right.value, r), tween),
        withSpring(r + (dir < 0 ? -3 : 0), land),
        withSpring(r, relax),
      );
    }
    previous.current = index;
    measured.current = signature;
  }, [index, slot, motion, signature]);
  const select = (i: number) => {
    if (items[i] && items[i].value !== value) {
      void Haptics.selectionAsync().catch(() => {});
      onChange(items[i].value);
    }
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .enabled(slot > 0)
    .onStart(() => {
      cancelAnimation(left);
      cancelAnimation(right);
      start.value = left.value;
    })
    .onUpdate((e) => {
      const max = (items.length - 1) * slot,
        raw = start.value + e.translationX;
      const rubber = (over: number) =>
        (over * slot * 0.55) / (slot + 0.55 * Math.abs(over));
      if (raw < 0) {
        left.value = 0;
        right.value = slot - rubber(-raw);
      } else if (raw > max) {
        right.value = max + slot;
        left.value = max + rubber(raw - max);
      } else {
        left.value = raw;
        right.value = raw + slot;
      }
    })
    .onEnd((e) => {
      const velocity = Math.max(-2000, Math.min(2000, e.velocityX));
      const d = 1 - 0.1 * Math.pow(0.05, 0.75);
      const projected = ((velocity / 1000) * d) / (1 - d);
      const next = Math.max(
        0,
        Math.min(items.length - 1, Math.round((left.value + projected) / slot)),
      );
      left.value = withSpring(next * slot, {
        duration: 400,
        dampingRatio: 0.8,
        reduceMotion: ReduceMotion.System,
      });
      right.value = withSpring((next + 1) * slot, {
        duration: 400,
        dampingRatio: 0.8,
        reduceMotion: ReduceMotion.System,
      });
      runOnJS(select)(next);
    })
    .onFinalize((_e, ok) => {
      if (!ok) {
        left.value = withSpring(index * slot);
        right.value = withSpring((index + 1) * slot);
      }
    });
  const thumb = useAnimatedStyle(() => ({
    left: left.value + 4,
    width: Math.max(0, right.value - left.value),
  }));
  return (
    <GestureDetector gesture={pan}>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={label}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[
          styles.track,
          compact && { backgroundColor: "rgba(0,15,8,.17)" },
        ]}
      >
        {slot > 0 && (
          <Animated.View pointerEvents="none" style={[styles.thumb, thumb]}>
            <Glass
              radius={compact ? 15 : 22}
              style={{ flex: 1, backgroundColor: "rgba(137,225,169,.13)" }}
            />
          </Animated.View>
        )}
        {items.map((item, i) => (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === index }}
            accessibilityLabel={item.label}
            onPress={() => select(i)}
            style={styles.item}
          >
            <Text
              style={[
                styles.label,
                compact && { fontSize: 12 },
                i === index && { color: palette.mint, fontWeight: "700" },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </GestureDetector>
  );
}
const styles = StyleSheet.create({
  track: {
    direction: "ltr",
    flexDirection: "row",
    padding: 4,
    borderRadius: 26,
    backgroundColor: "rgba(0,16,8,.23)",
    borderWidth: 1,
    borderColor: "rgba(192,255,220,.08)",
  },
  thumb: { position: "absolute", top: 4, bottom: 4 },
  item: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 9,
  },
  label: { color: palette.muted, fontSize: 14, textAlign: "center" },
});
