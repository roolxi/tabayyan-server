import React from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Glass } from "./Glass";
import { Icon } from "./Icon";
import { palette, spring } from "./theme";
/** SwipeToast's vertical dismissal, 24px rubberband resistance and 40px/110px/s release thresholds. */
export function SwipeToast({
  message,
  onClose,
  onRetry,
}: {
  message: string;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const y = useSharedValue(0),
    alpha = useSharedValue(1);
  const gesture = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onUpdate((e) => {
      const dy = e.translationY;
      y.value = dy < 0 ? (dy * 24 * 0.55) / (24 + 0.55 * Math.abs(dy)) : dy;
    })
    .onEnd((e) => {
      if (y.value > 40 || e.velocityY > 110) {
        y.value = withTiming(140, { duration: 250 });
        alpha.value = withTiming(0, { duration: 200 }, (done) => {
          if (done) runOnJS(onClose)();
        });
      } else y.value = withSpring(0, spring);
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: alpha.value,
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style}>
        <Glass radius={22} strong style={{ padding: 16 }}>
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <Icon name="info" color={palette.danger} />
            <Text
              accessibilityRole="alert"
              style={{
                flex: 1,
                color: palette.text,
                fontSize: 13,
                lineHeight: 23,
                textAlign: "right",
              }}
            >
              {message}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إخفاء التنبيه"
              onPress={onClose}
              hitSlop={12}
            >
              <Icon name="close" size={17} />
            </Pressable>
          </View>
          {onRetry && (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text
                style={{
                  color: palette.mint,
                  textAlign: "right",
                  fontSize: 13,
                }}
              >
                إعادة المحاولة ←
              </Text>
            </Pressable>
          )}
        </Glass>
      </Animated.View>
    </GestureDetector>
  );
}
