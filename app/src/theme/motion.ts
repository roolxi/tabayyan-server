export const durations = {
  instant: 120,
  quick: 220,
  standard: 360,
  ceremonial: 750,
} as const;

export const springConfigs = {
  soft: {
    damping: 24,
    stiffness: 160,
    mass: 1,
  },
  snappy: {
    damping: 18,
    stiffness: 260,
    mass: 0.8,
  },
  fluid: {
    damping: 20,
    stiffness: 180,
    mass: 0.9,
  },
  dockCapsule: {
    damping: 22,
    stiffness: 240,
    mass: 0.8,
  },
} as const;

