import React from "react";
import {
  AccessibilityInfo,
  AccessibilityRole,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { AdaptiveGlass } from "./AdaptiveGlass";
import { useTabNavigation, TabRoute } from "../../hooks/useTabNavigation";
import { colors } from "../../theme/colors";
import { springConfigs } from "../../theme/motion";
import { radii, spacing } from "../../theme/spacing";
import { shadows } from "../../theme/shadows";

interface DockTab {
  key: string;
  route: TabRoute;
  label: string;
  symbol: "house.fill" | "magnifyingglass" | "viewfinder";
  accessibilityLabel: string;
}

const TABS: DockTab[] = [
  {
    key: "home",
    route: "/",
    label: "الرئيسية",
    symbol: "house.fill",
    accessibilityLabel: "الذهاب إلى الشاشة الرئيسية",
  },
  {
    key: "search",
    route: "/search",
    label: "البحث",
    symbol: "magnifyingglass",
    accessibilityLabel: "الذهاب إلى شاشة البحث في القرآن والحديث",
  },
  {
    key: "scan",
    route: "/scan",
    label: "الفحص",
    symbol: "viewfinder",
    accessibilityLabel: "الذهاب إلى شاشة فحص واستخراج الوسائط",
  },
];

const DOCK_WIDTH = Math.min(Dimensions.get("window").width - 48, 360);
const TAB_WIDTH = (DOCK_WIDTH - 12) / TABS.length;

export const GlassDock: React.FC = () => {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { navigateToTab } = useTabNavigation();
  const [reduceMotion, setReduceMotion] = React.useState<boolean>(false);

  React.useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setReduceMotion(enabled);
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  // Determine active tab index from visual left-to-right dock order
  let activeIndex = 0;
  if (pathname === "/search") activeIndex = 1;
  else if (pathname === "/scan" || pathname === "/result") activeIndex = 2;

  const handleTabPress = (tab: DockTab, index: number) => {
    if (index !== activeIndex) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      navigateToTab(tab.route);
    }
  };

  // Reanimated style for the sliding indicator capsule across physical dock order (Left to Right)
  const capsuleStyle = useAnimatedStyle(() => {
    const offset = activeIndex * TAB_WIDTH;
    return {
      transform: [
        {
          translateX: reduceMotion
            ? offset
            : withSpring(offset, springConfigs.dockCapsule),
        },
      ],
    };
  }, [activeIndex, reduceMotion]);

  return (
    <View
      style={[
        styles.dockContainer,
        { bottom: Math.max(insets.bottom, 14) + 6 },
      ]}
      pointerEvents="box-none"
    >
      <AdaptiveGlass
        borderRadius={radii.full}
        style={[styles.glassDock, shadows.dock]}
        highlightBorder
      >
        <View style={styles.tabsRow}>
          {/* Animated physical glass selection capsule */}
          <Animated.View
            style={[
              styles.selectionCapsule,
              { width: TAB_WIDTH },
              capsuleStyle,
            ]}
          />

          {TABS.map((tab, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleTabPress(tab, idx)}
                accessible
                accessibilityRole="tab"
                accessibilityLabel={tab.accessibilityLabel}
                accessibilityState={{ selected: isSelected }}
                style={[styles.tabItem, { width: TAB_WIDTH }]}
              >
                <View style={styles.iconContainer}>
                  {Platform.OS === "ios" ? (
                    <SymbolView
                      name={tab.symbol}
                      size={20}
                      tintColor={isSelected ? colors.emerald : colors.muted}
                      style={styles.symbol}
                    />
                  ) : (
                    <View
                      style={[
                        styles.dotIndicator,
                        {
                          backgroundColor: isSelected
                            ? colors.emerald
                            : colors.muted,
                        },
                      ]}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: isSelected ? colors.emerald : colors.muted,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </AdaptiveGlass>
    </View>
  );
};

const styles = StyleSheet.create({
  dockContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  glassDock: {
    width: DOCK_WIDTH,
    height: spacing.dockHeight,
    padding: 6,
    backgroundColor: colors.glassDock,
  },
  tabsRow: {
    flex: 1,
    flexDirection: "row", // Physical left-to-right dock layout: Home (0), Search (1), Scan (2)
    alignItems: "center",
    position: "relative",
  },
  selectionCapsule: {
    position: "absolute",
    top: 2,
    bottom: 2,
    borderRadius: radii.full,
    backgroundColor: "rgba(52, 211, 153, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(167, 243, 208, 0.3)",
  },
  tabItem: {
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  iconContainer: {
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  symbol: {
    width: 20,
    height: 20,
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tabLabel: {
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
});
