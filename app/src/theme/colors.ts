export const colors = {
  // Core palette requested
  obsidian: "#050907",
  deepGreen: "#071A14",
  emerald: "#34D399",
  emeraldDark: "#065F46",
  spectralMint: "#A7F3D0",
  warmGold: "#D7B66A",
  ivory: "#F4F1E8",
  muted: "#A7B4AE",
  danger: "#FF6B63",

  // Glass and surface tints
  glassSurface: "rgba(7, 26, 20, 0.65)",
  glassBorder: "rgba(52, 211, 153, 0.22)",
  glassBorderSubtle: "rgba(244, 241, 232, 0.12)",
  glassHighlight: "rgba(167, 243, 208, 0.15)",
  glassDock: "rgba(5, 9, 7, 0.78)",
  cardBackground: "rgba(7, 26, 20, 0.72)",
  cardBorder: "rgba(52, 211, 153, 0.18)",

  // High contrast fallback (Reduce Transparency)
  solidSurface: "#0C1D17",
  solidSurfaceElevated: "#122B22",
  solidBorder: "#1E4235",

  // Status colors
  acceptedGreen: "#10B981",
  weakGold: "#F59E0B",
  errorRed: "#EF4444",
} as const;

export type ColorToken = keyof typeof colors;

