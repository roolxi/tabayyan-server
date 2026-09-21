import { TextStyle } from "react-native";
import { colors } from "./colors";

export const typography: Record<string, TextStyle> = {
  hero: {
    fontSize: 34,
    lineHeight: 44,
    fontWeight: "700",
    color: colors.ivory,
    textAlign: "right",
  },
  title1: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "700",
    color: colors.ivory,
    textAlign: "right",
  },
  title2: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    color: colors.ivory,
    textAlign: "right",
  },
  headline: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    color: colors.ivory,
    textAlign: "right",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
    color: colors.ivory,
    textAlign: "right",
  },
  bodyMuted: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    color: colors.muted,
    textAlign: "right",
  },
  callout: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: colors.spectralMint,
    textAlign: "right",
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: colors.muted,
    textAlign: "right",
  },
  // Sacred typography tokens
  quranText: {
    fontSize: 22,
    lineHeight: 42,
    fontWeight: "500",
    color: colors.ivory,
    textAlign: "right",
  },
  hadithText: {
    fontSize: 18,
    lineHeight: 34,
    fontWeight: "400",
    color: colors.ivory,
    textAlign: "right",
  },
};

