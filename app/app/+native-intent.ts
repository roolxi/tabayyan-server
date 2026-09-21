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
}) {
  // If opening via a share scheme or intent, route to handle-share
  if (path.includes("share") || path.includes("intent")) {
    return "/handle-share";
  }
  return path;
}

