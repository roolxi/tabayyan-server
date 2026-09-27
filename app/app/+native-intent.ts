import { shortcutRoute } from "../src/sharing/shortcut";

/**
 * Native intent redirect handler for Expo Router.
 * Directs incoming shares and custom scheme links to the appropriate route.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  if (!path || typeof path !== "string") {
    return "/";
  }

  const shortcut = shortcutRoute(path);
  if (shortcut !== null) return shortcut;

  // Handle full custom scheme URLs, e.g.:
  // tabayyan://handle-share?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FEXAMPLE&source=ios-action
  if (path.startsWith("tabayyan://")) {
    const afterScheme = path.slice("tabayyan://".length);
    const queryIndex = afterScheme.indexOf("?");
    const routeName = queryIndex !== -1 ? afterScheme.slice(0, queryIndex) : afterScheme;
    const queryString = queryIndex !== -1 ? afterScheme.slice(queryIndex) : "";

    // Clean leading or trailing slashes
    const cleanRoute = routeName.replace(/^\/+|\/+$/g, "");

    if (cleanRoute === "handle-share") {
      return `/handle-share${queryString}`;
    }

    if (cleanRoute.length > 0) {
      return `/${cleanRoute}${queryString}`;
    }

    return "/";
  }

  // Handle direct router paths e.g. /handle-share?url=... or handle-share?url=...
  if (path.startsWith("/handle-share") || path.startsWith("handle-share")) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return normalized;
  }

  // If path contains handle-share anywhere in path/query, route cleanly to /handle-share
  // Never reinterpret arbitrary paths merely because their query mentions a route.

  // NOTE: Obsolete routes like /expo-sharing are strictly ignored and never routed.
  return path;
}
