import { useCallback, useRef } from "react";
import { usePathname, useRouter } from "expo-router";
import {
  TAB_ROUTES,
  TabRoute,
  calculateTabDirection,
  getTabIndex,
} from "../navigation/tabNavigation";

export interface NavigateToTabOptions {
  params?: Record<string, any>;
  force?: boolean;
}

/**
 * Hook providing directional, history-free replacement navigation between primary tabs.
 */
export function useTabNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const lastNavTimeRef = useRef<number>(0);

  const navigateToTab = useCallback(
    (toRoute: TabRoute, options?: Record<string, any> | NavigateToTabOptions) => {
      const now = Date.now();
      // Debounce rapid repeated taps (250ms guard)
      if (now - lastNavTimeRef.current < 250) {
        return;
      }

      let routeParams: Record<string, any> = {};
      let force = false;

      if (options) {
        if ("params" in options || "force" in options) {
          const opt = options as NavigateToTabOptions;
          routeParams = opt.params ?? {};
          force = opt.force ?? false;
        } else {
          routeParams = options as Record<string, any>;
        }
      }

      const currentIndex = getTabIndex(pathname);
      const destIndex = getTabIndex(toRoute);

      // Prevent redundant navigation if already on destination tab and no special params
      const hasSpecificParams = Object.keys(routeParams).length > 0;
      if (!force && currentIndex === destIndex && !hasSpecificParams) {
        return;
      }

      lastNavTimeRef.current = now;

      const direction = calculateTabDirection(pathname, toRoute);

      const finalParams: Record<string, any> = {
        ...routeParams,
      };

      if (direction) {
        finalParams.__tabDirection = direction;
      }

      // Always use replace() for bottom-tab navigation to avoid accumulating history stack
      router.replace({
        pathname: toRoute as any,
        params: finalParams,
      });
    },
    [pathname, router]
  );

  return {
    navigateToTab,
    currentTabIndex: getTabIndex(pathname),
    tabRoutes: TAB_ROUTES,
  };
}

export type { TabRoute, TabDirection } from "../navigation/tabNavigation";
export { TAB_ROUTES, calculateTabDirection, getTabIndex } from "../navigation/tabNavigation";

