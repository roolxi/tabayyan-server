export const TAB_ROUTES = ["/", "/search", "/scan"] as const;
export type TabRoute = (typeof TAB_ROUTES)[number];
export type TabDirection = "left" | "right";

/**
 * Returns the 0-indexed position of a route in the visual dock order (LEFT to RIGHT):
 * 0: Home ("/")
 * 1: Search ("/search")
 * 2: Scan ("/scan")
 *
 * For sub-routes / detail pages, maps to their parent/related tab where appropriate.
 */
export function getTabIndex(pathname: string): number {
  if (!pathname || typeof pathname !== "string") return -1;
  const clean = pathname.split("?")[0].replace(/\/$/, "") || "/";
  if (clean === "/" || clean === "/index") return 0;
  if (clean === "/search") return 1;
  if (clean === "/scan" || clean === "/result") return 2;
  return -1;
}

/**
 * Calculates transition direction based on actual physical dock layout (LEFT to RIGHT):
 * - destinationIndex > currentIndex -> "right" (enters from RIGHT, exits LEFT)
 * - destinationIndex < currentIndex -> "left"  (enters from LEFT, exits RIGHT)
 * - destinationIndex === currentIndex -> undefined
 */
export function calculateTabDirection(
  fromPath: string,
  toRoute: TabRoute
): TabDirection | undefined {
  const currentIndex = getTabIndex(fromPath);
  const destIndex = getTabIndex(toRoute);

  if (currentIndex === -1 || destIndex === -1 || currentIndex === destIndex) {
    return undefined;
  }

  return destIndex > currentIndex ? "right" : "left";
}

