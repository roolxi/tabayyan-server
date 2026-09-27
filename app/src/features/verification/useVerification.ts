import { useEffect, useReducer, useRef, useState } from "react";
import { Keyboard } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { searchHadith, searchHadithByMeaning } from "../../api/hadith";
import { searchQuran, suggestQuranPhrases } from "../../api/quran";
import {
  extractSupportedUrlFromText,
  submitUrlJob,
  pollUrlJob,
} from "../../api/urlMedia";
import {
  normalizeMediaAsset,
  uploadMedia,
  UploadDescriptor,
} from "../../api/media";
import { clearPendingSharedPayload } from "../../native/shareBridge";
import { LatestRequest } from "../../utils/latestRequest";
import { perfTracker } from "../../utils/perfTracker";
import {
  initialState,
  reducer,
  Mode,
  Target,
  Presentation,
  presentHadith,
  presentQuran,
  presentMedia,
} from "./model";

export function useVerification() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const requests = useRef(new LatestRequest()),
    alive = useRef(true),
    last = useRef<(() => void) | null>(null),
    picking = useRef(false);
  const [attachment, setAttachment] = useState<UploadDescriptor | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requests.current.cancel();
    };
  }, []);

  const run = async (
    label: string,
    work: (
      signal: AbortSignal,
      stage: (message: string) => void,
      perfId: string,
    ) => Promise<Presentation>,
    options: {
      mode?: Mode;
      requestLabel?: string;
      resultMode?: Mode;
      perfKind?: string;
    } = {},
  ) => {
    const request = requests.current.begin();
    const current = () => alive.current && requests.current.isCurrent(request);
    const perfId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    perfTracker.recordTap(perfId, options.perfKind || `${options.mode || state.mode}`);
    Keyboard.dismiss();
    dispatch({
      type: "begin",
      label,
      time: Date.now(),
      perfId,
      mode: options.mode,
      requestLabel: options.requestLabel,
    });
    try {
      const result = await work(
        request.signal,
        (message) => {
          if (current()) dispatch({ type: "stage", label: message });
        },
        perfId,
      );
      perfTracker.recordStateCommit(perfId);
      if (current())
        dispatch({
          type: "done",
          result,
          time: Date.now(),
          resultMode: options.resultMode || options.mode || state.mode,
        });
    } catch (e) {
      if (current())
        dispatch({
          type: "error",
          error: (e as Error).message || "تعذّر إكمال الطلب. حاول مرة أخرى.",
          time: Date.now(),
        });
    }
  };

  const verifyUrl = (text: string, pendingId?: string) => {
    const url = extractSupportedUrlFromText(text);
    if (!url) {
      dispatch({
        type: "error",
        error: "ألصق رابطًا مدعومًا من يوتيوب أو تيك توك أو إنستغرام.",
        time: Date.now(),
      });
      return;
    }
    setAttachment(null);
    dispatch({ type: "query", query: url });
    last.current = () => verifyUrl(url, pendingId);
    void run(
      "نقرأ المقطع…",
      async (signal, stage, perfId) => {
        const job = await submitUrlJob(url, signal, perfId);
        if (signal.aborted) throw Error("cancelled");
        // Same consumption boundary as the original: only acknowledge after server accepts the job.
        if (pendingId) await clearPendingSharedPayload(pendingId);
        const result = await pollUrlJob(job.jobId, {
          signal,
          perfId,
          onProgress: (status) => {
            if (status.message) stage(status.message);
          },
        });
        if (!result.result) throw Error("اكتمل الطلب دون نتيجة قابلة للعرض.");
        return presentMedia(result.result);
      },
      { perfKind: "url_job" },
    );
  };

  const search = (
    text = state.query,
    mode: Mode = state.mode,
    target: Target = state.target,
  ) => {
    if (!text.trim()) return;
    if (extractSupportedUrlFromText(text)) {
      verifyUrl(text);
      return;
    }
    if (/^https?:\/\//i.test(text.trim())) {
      dispatch({
        type: "error",
        error:
          "هذا الرابط غير مدعوم. جرّب رابط يوتيوب أو تيك توك أو إنستغرام، أو ارفع الوسيط.",
        time: Date.now(),
      });
      return;
    }
    setAttachment(null);
    if (target !== state.target) dispatch({ type: "context", target });
    if (mode !== state.mode) dispatch({ type: "mode", mode });
    dispatch({ type: "query", query: text });
    last.current = () => search(text, mode, target);
    void run(
      mode === "meaning" ? "نبحث عن العبارة الأقرب…" : "نطابق النص مع المصدر…",
      async (signal, _stage, perfId) => {
        if (mode === "meaning") {
          if (target === "quran") {
            const res = await suggestQuranPhrases(text, signal, perfId);
            return {
              entries: [],
              suggestions: res.candidates || [],
              message: res.message || "",
              specialistAvailable: false,
            };
          }
          const res = await searchHadithByMeaning(text, [], signal, perfId);
          if (res.status === "temporarily_unavailable")
            throw Error(res.message || "البحث بالمعنى غير متاح مؤقتًا.");
          return {
            entries: [],
            suggestions: (res.candidates || []).map((c) => c.text),
            message: res.message || "",
            specialistAvailable: false,
          };
        }
        return target === "quran"
          ? presentQuran(await searchQuran(text, signal, perfId))
          : presentHadith(
              await searchHadith(
                text,
                mode === "specialist" ? "specialist" : "simple",
                signal,
                perfId,
              ),
              mode,
            );
      },
      {
        mode,
        requestLabel: text,
        resultMode: mode,
        perfKind: `${target}:${mode}`,
      },
    );
  };

  const reviewSpecialist = (text: string) => {
    if (!text.trim()) return;
    setAttachment(null);
    last.current = () => reviewSpecialist(text);
    void run(
      "نجلب تفاصيل الروايات والتخريج للمتخصص…",
      async (signal, _stage, perfId) => {
        const res = await searchHadith(text, "specialist", signal, perfId);
        return presentHadith(res, "specialist");
      },
      {
        mode: "specialist",
        requestLabel: text,
        resultMode: "specialist",
        perfKind: "hadith:specialist_review",
      },
    );
  };

  const verifyFile = (file: UploadDescriptor) => {
    setAttachment(file);
    last.current = () => verifyFile(file);
    void run(
      file.type.startsWith("video/")
        ? "نقرأ الصوت من المقطع…"
        : "نقرأ النص في الصورة…",
      async (signal, _stage, perfId) =>
        presentMedia(await uploadMedia(file, signal, perfId)),
      { perfKind: "media_file" },
    );
  };

  const pick = async (source: "camera" | "library") => {
    if (picking.current || state.busy) return;
    picking.current = true;
    try {
      if (
        source === "camera" &&
        !(await ImagePicker.requestCameraPermissionsAsync()).granted
      )
        throw Error("اسمح باستخدام الكاميرا من إعدادات الجهاز.");
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images", "videos"],
              quality: 0.9,
            });
      if (!alive.current || result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0],
        video = asset.type === "video";
      if (asset.fileSize && asset.fileSize > (video ? 40 : 8) * 1024 * 1024)
        throw Error(
          video
            ? "الحد الأقصى للفيديو 40 ميجابايت."
            : "الحد الأقصى للصورة 8 ميجابايت.",
        );
      if (video && asset.duration && asset.duration > 180000)
        throw Error("الحد الأقصى للفيديو المرفوع 3 دقائق.");
      setAttachment(
        normalizeMediaAsset(
          asset,
          source === "camera" ? "camera" : video ? "video" : "image",
        ),
      );
    } catch (e) {
      if (alive.current)
        dispatch({
          type: "error",
          error: (e as Error).message || "تعذّر اختيار الوسيط.",
          time: Date.now(),
        });
    } finally {
      picking.current = false;
    }
  };

  const cancel = () => {
    requests.current.cancel();
    dispatch({ type: "cancel", time: Date.now() });
  };

  return {
    ...state,
    attachment,
    setAttachment,
    search,
    reviewSpecialist,
    verifyUrl,
    verifyFile,
    pick,
    cancel,
    submit: () => (attachment ? verifyFile(attachment) : search()),
    changeTarget: (target: Target) => {
      if (target === state.target) return;
      requests.current.cancel();
      last.current = null;
      setAttachment(null);
      dispatch({ type: "context", target });
    },
    changeMode: (mode: Mode) => {
      if (mode === state.mode) return;
      requests.current.cancel();
      last.current = null;
      dispatch({ type: "mode", mode });
    },
    setQuery: (query: string) => dispatch({ type: "query", query }),
    reset: () => {
      requests.current.cancel();
      last.current = null;
      setAttachment(null);
      dispatch({ type: "reset" });
    },
    removeAttachment: () => setAttachment(null),
    dismissError: () => dispatch({ type: "dismissError" }),
    reportError: (error: string) =>
      dispatch({ type: "error", error, time: Date.now() }),
    canRetry: !!last.current,
    retry: () => last.current?.(),
  };
}
