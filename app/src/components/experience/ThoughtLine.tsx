import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Glass } from "./Glass";
import { LatticeLoader } from "./LatticeLoader";
import { AnimatedContent } from "./AnimatedContent";
import { Icon } from "./Icon";
import { flow, palette } from "./theme";
/** ThoughtLine's folding trace and settled label; events are real request stages, not invented progress. */
export function ThoughtLine({
  busy,
  error,
  cancelled,
  message,
  steps,
  startedAt,
  endedAt,
}: {
  busy: boolean;
  error: boolean;
  cancelled: boolean;
  message: string;
  steps: string[];
  startedAt: number;
  endedAt: number | null;
}) {
  const [open, setOpen] = useState(busy),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    setOpen(busy);
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy, startedAt]);
  const seconds = Math.max(
    0,
    Math.floor(((endedAt || now) - startedAt) / 1000),
  );
  const title = busy
    ? message
    : error
      ? "تعذّر إكمال التحقق"
      : cancelled
        ? "توقّفت المتابعة"
        : "اكتمل البحث";
  return (
    <Animated.View layout={flow}>
      <Glass radius={22} style={{ padding: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((x) => !x)}
          style={styles.head}
        >
          <View style={styles.loaderSlot}>
            <LatticeLoader
              status={busy ? "working" : cancelled ? "cancelled" : error ? "error" : "done"}
              requestId={startedAt}
            />
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.time}>{seconds} ث</Text>
          <Icon name="chevron" size={15} color={palette.muted} />
        </Pressable>
        {open && steps.length > 0 && (
          <AnimatedContent>
            <View style={styles.trace}>
              {steps.map((step, i) => (
                <View key={`${i}:${step}`} style={styles.step}>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          busy && i === steps.length - 1
                            ? palette.green
                            : palette.dim,
                      },
                    ]}
                  />
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </AnimatedContent>
        )}
      </Glass>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  head: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    minHeight: 32,
  },
  loaderSlot: {
    width: 24,
    height: 24,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: palette.mint,
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
    flex: 1,
  },
  time: { color: palette.muted, fontSize: 11, fontVariant: ["tabular-nums"] },
  trace: {
    marginTop: 14,
    borderRightWidth: 1,
    borderRightColor: palette.edge,
    paddingRight: 16,
    gap: 12,
  },
  step: { flexDirection: "row-reverse", gap: 10, alignItems: "center" },
  dot: { width: 4, height: 4, borderRadius: 2 },
  stepText: {
    flex: 1,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 21,
    textAlign: "right",
  },
});
