import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { getPendingSharedPayload } from "../native/shareBridge";
import { isSupportedMediaUrl } from "../api/urlMedia";

/** Check on cold start AND return from a host app. Reading does not discard the payload. */
export function PendingShareListener() {
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const routedId = useRef<string | null>(null);
  useEffect(() => {
    if (!navigation?.key) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || pathname === "/handle-share") return;
      checking = true;
      try {
        const payload = await getPendingSharedPayload();
        if (!active || !payload?.id || routedId.current === payload.id ||
            !isSupportedMediaUrl(payload.url)) return;
        routedId.current = payload.id;
        router.push({ pathname: "/handle-share", params: {
          url: payload.url, id: payload.id, source: "ios-action",
        } });
      } finally { checking = false; }
    };
    void check();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") void check();
    });
    return () => { active = false; subscription.remove(); };
  }, [navigation?.key, pathname, router]);
  return null;
}
