import React from "react";
import { ViewProps } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
} from "react-native-reanimated";
import { easeOut, flow } from "./theme";
/** React Bits AnimatedContent: distance + opacity + power3-out, on native mount instead of ScrollTrigger. */
export function AnimatedContent({
  children,
  delay = 0,
  style,
  ...props
}: ViewProps & { delay?: number }) {
  return (
    <Animated.View
      {...props}
      style={style}
      layout={flow}
      entering={FadeInDown.duration(450)
        .delay(delay)
        .easing(easeOut)
        .withInitialValues({ opacity: 0, transform: [{ translateY: 16 }] })
        .reduceMotion(ReduceMotion.System)}
      exiting={FadeOutUp.duration(160).reduceMotion(ReduceMotion.System)}
    >
      {children}
    </Animated.View>
  );
}
