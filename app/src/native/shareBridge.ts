export interface PendingSharedPayload {
  url: string;
  source: string;
  timestamp: number;
  id: string;
}

function getNativeBridge(): any {
  try {
    const RN = require("react-native");
    if (RN?.Platform?.OS !== "ios") {
      return null;
    }
    return RN?.NativeModules?.TabayyanShareBridge ?? null;
  } catch {
    return (globalThis as any)?.NativeModules?.TabayyanShareBridge ?? null;
  }
}

/**
 * Reads any pending shared payload persisted by the native Action Extension in the App Group.
 * Returns null if no payload exists or if not on iOS.
 */
export async function getPendingSharedPayload(): Promise<PendingSharedPayload | null> {
  const bridge = getNativeBridge();
  if (!bridge || typeof bridge.getPendingSharedPayload !== "function") {
    return null;
  }
  try {
    const payload = await bridge.getPendingSharedPayload();
    if (payload && typeof payload === "object" && typeof payload.url === "string") {
      return payload as PendingSharedPayload;
    }
    return null;
  } catch (err) {
    console.warn("[TabayyanShareBridge] Error reading pending payload:", err);
    return null;
  }
}

/**
 * Clears the pending shared payload in the App Group once consumed.
 */
export async function clearPendingSharedPayload(expectedId = ""): Promise<boolean> {
  const bridge = getNativeBridge();
  if (!bridge || typeof bridge.clearPendingSharedPayload !== "function") {
    return false;
  }
  try {
    return Boolean(await bridge.clearPendingSharedPayload(expectedId));
  } catch (err) {
    console.warn("[TabayyanShareBridge] Error clearing pending payload:", err);
    return false;
  }
}
