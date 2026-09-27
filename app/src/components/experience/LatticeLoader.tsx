import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useSceneMotion } from "../../hooks/useSceneMotion";
import { palette } from "./theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type LatticeStatus = "working" | "done" | "error" | "cancelled";

// 9 deterministic cell coordinates for a 3x3 grid (cellSize = 4, gap = 3, total = 18x18)
// Orbit units:
// 0: Top-Left  (r:0, c:0)
// 1: Top-Center (r:0, c:1)
// 2: Top-Right (r:0, c:2)
// 3: Mid-Right (r:1, c:2)
// 4: Bottom-Right (r:2, c:2)
// 5: Bottom-Center (r:2, c:1)
// 6: Bottom-Left (r:2, c:0)
// 7: Mid-Left (r:1, c:0)
// null: Center (r:1, c:1)
const DETERMINISTIC_CELLS: Array<{ unit: number | null; left: number; top: number }> = [
  { unit: 0, left: 0, top: 0 },
  { unit: 1, left: 7, top: 0 },
  { unit: 2, left: 14, top: 0 },
  { unit: 3, left: 14, top: 7 },
  { unit: 4, left: 14, top: 14 },
  { unit: 5, left: 7, top: 14 },
  { unit: 6, left: 0, top: 14 },
  { unit: 7, left: 0, top: 7 },
  { unit: null, left: 7, top: 7 },
];

function OrbitCell({
  unit,
  left,
  top,
  phase,
  moving,
  size,
}: {
  unit: number | null;
  left: number;
  top: number;
  phase: SharedValue<number>;
  moving: boolean;
  size: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    if (unit === null) {
      return { opacity: 0.07 };
    }
    if (!moving) {
      return { opacity: 0.45 };
    }

    // Phase animates from 0 to 8 smoothly.
    // Calculate circular distance diff in [0, 8)
    const diff = ((phase.value - unit) % 8 + 8) % 8;
    let opacity = 0.15;

    // Smooth continuous comet wave with circular wrap across 0/8 boundary
    if (diff >= 7.2) {
      // Leading edge smoothly rising from idle (0.15) to peak (1.0)
      opacity = 0.15 + ((diff - 7.2) / 0.8) * 0.85;
    } else if (diff <= 1.8) {
      // Trailing edge smoothly falling from peak (1.0) to idle (0.15)
      opacity = 1.0 - (diff / 1.8) * 0.85;
    }

    return {
      opacity,
      backgroundColor: palette.mint,
    };
  });

  return (
    <Animated.View
      style={[
        styles.cell,
        {
          left,
          top,
          width: size,
          height: size,
        },
        animatedStyle,
      ]}
    />
  );
}

export function LatticeLoader({
  status = "working",
  size = 4,
  requestId,
}: {
  status?: LatticeStatus;
  size?: number;
  requestId?: number | string;
}) {
  const moving = useSceneMotion();
  const phase = useSharedValue(0);

  // Animation values for finished completion / error / cancelled symbols
  const checkProgress = useSharedValue(status === "done" ? 1 : 0);
  const symbolScale = useSharedValue(status !== "working" ? 1 : 0.7);
  const symbolOpacity = useSharedValue(status !== "working" ? 1 : 0);
  const latticeOpacity = useSharedValue(status === "working" ? 1 : 0);

  // Track if done animation already ran to avoid replaying on rerenders
  const hasAnimatedDone = useRef(status === "done");
  const prevRequestId = useRef(requestId);

  // When a genuinely new request starts, restart animation from 0
  useEffect(() => {
    if (requestId !== prevRequestId.current) {
      prevRequestId.current = requestId;
      hasAnimatedDone.current = false;
      phase.value = 0;
    }
  }, [requestId]);

  // Manage repeating lattice animation while working
  useEffect(() => {
    if (moving && status === "working") {
      phase.value = withRepeat(
        withTiming(8, {
          duration: 864,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        false
      );
    } else {
      cancelAnimation(phase);
    }
    return () => cancelAnimation(phase);
  }, [moving, status]);

  // Manage transitions between working, done, error, and cancelled
  useEffect(() => {
    if (status === "working") {
      hasAnimatedDone.current = false;
      latticeOpacity.value = withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System });
      symbolOpacity.value = withTiming(0, { duration: 150, reduceMotion: ReduceMotion.System });
      symbolScale.value = 0.7;
      checkProgress.value = 0;
    } else {
      // Transition lattice out
      latticeOpacity.value = withTiming(0, { duration: 200, reduceMotion: ReduceMotion.System });

      if (status === "done") {
        if (!hasAnimatedDone.current && moving) {
          hasAnimatedDone.current = true;
          symbolOpacity.value = withTiming(1, { duration: 250, reduceMotion: ReduceMotion.System });
          symbolScale.value = withSpring(1, {
            damping: 14,
            stiffness: 140,
            reduceMotion: ReduceMotion.System,
          });
          checkProgress.value = withTiming(1, {
            duration: 350,
            easing: Easing.out(Easing.quad),
            reduceMotion: ReduceMotion.System,
          });
        } else {
          // Already settled or reduced motion: keep immediate terminal values
          symbolOpacity.value = 1;
          symbolScale.value = 1;
          checkProgress.value = 1;
        }
      } else {
        // error or cancelled
        symbolOpacity.value = withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System });
        symbolScale.value = withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System });
        checkProgress.value = 0;
      }
    }
  }, [status, moving]);

  const latticeAnimStyle = useAnimatedStyle(() => ({
    opacity: latticeOpacity.value,
  }));

  const symbolAnimStyle = useAnimatedStyle(() => ({
    opacity: symbolOpacity.value,
    transform: [{ scale: symbolScale.value }],
  }));

  const animatedCheckProps = useAnimatedProps(() => ({
    strokeDashoffset: 14 * (1 - checkProgress.value),
  }));

  return (
    <View accessible={false} style={styles.fixedSlot}>
      {/* 3x3 Continuous Deterministic Lattice */}
      <Animated.View style={[styles.latticeContainer, latticeAnimStyle]} pointerEvents="none">
        {DETERMINISTIC_CELLS.map((cell, idx) => (
          <OrbitCell
            key={`orbit-${idx}`}
            unit={cell.unit}
            left={cell.left}
            top={cell.top}
            phase={phase}
            moving={moving}
            size={size}
          />
        ))}
      </Animated.View>

      {/* Finished Completion Symbol (Glass circle with smoothly drawn checkmark) */}
      {status === "done" && (
        <Animated.View style={[styles.symbolContainer, styles.successCircle, symbolAnimStyle]}>
          <Svg width={22} height={22} viewBox="0 0 22 22">
            <AnimatedPath
              d="M 6.5 11.5 L 9.5 14.5 L 15.5 8.5"
              fill="none"
              stroke={palette.mint}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={[14, 14]}
              animatedProps={animatedCheckProps}
            />
          </Svg>
        </Animated.View>
      )}

      {/* Neutral Stopped Symbol (Cancelled) */}
      {status === "cancelled" && (
        <Animated.View style={[styles.symbolContainer, styles.neutralCircle, symbolAnimStyle]}>
          <Svg width={22} height={22} viewBox="0 0 22 22">
            <Path
              d="M 7.5 11 L 14.5 11"
              fill="none"
              stroke={palette.muted}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
      )}

      {/* Distinct Error Symbol */}
      {status === "error" && (
        <Animated.View style={[styles.symbolContainer, styles.errorCircle, symbolAnimStyle]}>
          <Svg width={22} height={22} viewBox="0 0 22 22">
            <Path
              d="M 7.5 7.5 L 14.5 14.5 M 14.5 7.5 L 7.5 14.5"
              fill="none"
              stroke={palette.danger}
              strokeWidth={1.75}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fixedSlot: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    position: "relative",
  },
  latticeContainer: {
    width: 18,
    height: 18,
    position: "absolute",
    direction: "ltr",
  },
  cell: {
    position: "absolute",
    borderRadius: 2,
  },
  symbolContainer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
  },
  successCircle: {
    backgroundColor: "rgba(10, 194, 139, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(10, 194, 139, 0.4)",
  },
  neutralCircle: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  errorCircle: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
});
