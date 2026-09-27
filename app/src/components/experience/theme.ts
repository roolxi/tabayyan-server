import {
  Easing,
  ReduceMotion,
  LinearTransition,
} from "react-native-reanimated";
export const palette = {
  bg: "#061410",
  text: "#EDF8F1",
  muted: "#A3BCB0",
  dim: "#729688",
  mint: "#B9F9D5",
  green: "#54DFA2",
  edge: "rgba(192,255,220,.17)",
  danger: "#FFAAA0",
  gold: "#E7CEA0",
  panel: "rgba(38,76,59,.19)",
};
// React Bits Rubber Segment / Thought Line cubic curves.
export const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
export const easeInOut = Easing.bezier(0.77, 0, 0.175, 1);
export const spring = {
  damping: 23,
  stiffness: 260,
  mass: 0.8,
  reduceMotion: ReduceMotion.System,
};
export const flow = LinearTransition.duration(350)
  .easing(easeOut)
  .reduceMotion(ReduceMotion.System);
export const timing = {
  duration: 350,
  easing: easeOut,
  reduceMotion: ReduceMotion.System,
};
