import React from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { palette } from "./theme";
export type IconName =
  | "arrow"
  | "plus"
  | "close"
  | "camera"
  | "camera-flip"
  | "flash-on"
  | "flash-off"
  | "flash-auto"
  | "image"
  | "link"
  | "book"
  | "info"
  | "chevron"
  | "check"
  | "spark"
  | "refresh"
  | "source";
const paths: Partial<Record<IconName, string>> = {
  arrow: "M12 19V5m-6 6 6-6 6 6",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  camera:
    "M8 6l1.5-2h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Z",
  "camera-flip":
    "M20 10V7a2 2 0 0 0-2-2H7 M7 5 4 8l3 3 M4 14v3a2 2 0 0 0 2 2h11 M17 19l3-3-3-3",
  "flash-on": "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
  "flash-off": "M13 2 4 14h6l-1 8 9-12h-6l1-8Z M3 3l18 18",
  "flash-auto": "M11 2 3 13h5l-1 7 8-10h-5l1-7Z",
  image: "m3 16 5-5 5 5 3-3 5 5",
  link: "m10 13 4-4m-6 6-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 2 1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0",
  book: "M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14",
  info: "M12 11v6M12 7v.1",
  chevron: "m8 10 4 4 4-4",
  check: "m5 12 4 4L19 6",
  spark: "m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z",
  refresh: "M20 10a8 8 0 1 0-1.5 7M20 4v6h-6",
  source:
    "M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
};
export function Icon({
  name,
  size = 20,
  color = palette.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {name === "info" && <Circle cx={12} cy={12} r={9} />}
      {name === "camera" && <Circle cx={12} cy={12.5} r={3.5} />}
      {name === "image" && (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={4} />
          <Circle cx={16} cy={8} r={1} />
        </>
      )}
      <Path d={paths[name]} />
    </Svg>
  );
}
