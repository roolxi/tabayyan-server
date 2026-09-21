import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useIncomingShare } from "expo-sharing";

import { AmbientBackground } from "../src/components/motion/AmbientBackground";
import { AdaptiveGlass } from "../src/components/glass/AdaptiveGlass";
import { GlassButton } from "../src/components/glass/GlassButton";
import { ScanProgress } from "../src/components/motion/ScanProgress";
import { useScanContext } from "../src/context/ScanContext";
import { normalizeMediaAsset, uploadMedia } from "../src/api/media";
import {
  extractSupportedUrlFromText,
  isSupportedMediaUrl,
  pollUrlJob,
  submitUrlJob,
} from "../src/api/urlMedia";
import { MediaExtractResponse, UrlJobStatusResponse } from "../src/api/types";
import { colors } from "../src/theme/colors";
import { radii, spacing } from "../src/theme/spacing";
import { typography } from "../src/theme/typography";
import { shadows } from "../src/theme/shadows";

export default function HandleShareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setScanResult } = useScanContext();

  const {
    sharedPayloads,
    resolvedSharedPayloads,
    clearSharedPayloads,
    isResolving,
    error: shareError,
  } = useIncomingShare();

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [currentStageMessage, setCurrentStageMessage] = useState<string>("جارٍ استلام المحتوى المشارك...");
  const [mediaKind, setMediaKind] = useState<"image" | "video">("video");
  const [pendingResult, setPendingResult] = useState<MediaExtractResponse | null>(null);

  const hasHandled = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (hasHandled.current || isResolving) return;

    const payloads =
      resolvedSharedPayloads && resolvedSharedPayloads.length > 0
        ? resolvedSharedPayloads
        : sharedPayloads;

    if (!payloads || payloads.length === 0) {
      if (shareError) {
        setIsError(true);
        setErrorMessage("تعذر قراءة المحتوى المشارك. حاول مرة أخرى.");
      }
      return;
    }

    const payload = payloads[0];
    hasHandled.current = true;

    // Consume the payload immediately to avoid repeated processing on rerenders
    clearSharedPayloads();

    processSharedPayload(payload);
  }, [sharedPayloads, resolvedSharedPayloads, isResolving, shareError]);

  const processSharedPayload = async (payload: any) => {
    setIsProcessing(true);
    setIsError(false);
    setIsComplete(false);
    setErrorMessage("");

    const shareType = payload.shareType || "";
    const contentType = payload.contentType || "";
    const rawVal = payload.value || "";
    const contentUri = payload.contentUri || rawVal;

    // 1. Check if it's a local media file (image or video)
    const isLocalFile =
      shareType === "image" ||
      shareType === "video" ||
      shareType === "file" ||
      contentType === "image" ||
      contentType === "video" ||
      contentType === "file" ||
      contentUri.startsWith("file://") ||
      contentUri.startsWith("content://") ||
      contentUri.startsWith("ph://");

    if (isLocalFile && !isSupportedMediaUrl(rawVal)) {
      const isVideo =
        shareType === "video" ||
        contentType === "video" ||
        /\.(mp4|mov|webm)$/i.test(contentUri);

      setMediaKind(isVideo ? "video" : "image");
      setCurrentStageMessage(isVideo ? "جارٍ رفع مقطع الفيديو..." : "جارٍ رفع الصورة...");

      try {
        const descriptor = normalizeMediaAsset(
          {
            uri: contentUri,
            fileName: payload.originalName || undefined,
            mimeType: payload.contentMimeType || payload.mimeType || undefined,
            fileSize: payload.contentSize || undefined,
            type: isVideo ? "video" : "image",
          },
          isVideo ? "video" : "image"
        );

        abortControllerRef.current = new AbortController();
        const res = await uploadMedia(descriptor, abortControllerRef.current.signal);

        if (res.status === "candidates" && res.results && res.results.length > 0) {
          setPendingResult(res);
          setIsComplete(true);
        } else {
          setIsProcessing(false);
          setIsError(true);
          setErrorMessage("لم نتمكن من العثور على آية أو حديث موثّق يطابق المحتوى.");
        }
      } catch (err: any) {
        setIsProcessing(false);
        setIsError(true);
        setErrorMessage(err.message || "تعذر معالجة الملف المشارك.");
      }
      return;
    }

    // 2. Otherwise treat as URL or text containing URL
    const textToInspect = `${rawVal} ${contentUri}`;
    const extractedUrl = extractSupportedUrlFromText(textToInspect);

    if (!extractedUrl) {
      setIsProcessing(false);
      setIsError(true);
      setErrorMessage(
        "المحتوى المشارك لا يحتوي على رابط صالح من يوتيوب أو تيك توك أو إنستغرام."
      );
      return;
    }

    setMediaKind("video");
    setCurrentStageMessage("جارٍ التحقق من الرابط المشارك...");

    try {
      abortControllerRef.current = new AbortController();
      const submitRes = await submitUrlJob(extractedUrl, abortControllerRef.current.signal);

      const jobResult: UrlJobStatusResponse = await pollUrlJob(submitRes.jobId, {
        signal: abortControllerRef.current.signal,
        onProgress: (status) => {
          if (status.message) {
            setCurrentStageMessage(status.message);
          }
        },
      });

      if (
        jobResult.result &&
        jobResult.result.status === "candidates" &&
        jobResult.result.results.length > 0
      ) {
        setPendingResult(jobResult.result);
        setIsComplete(true);
      } else if (jobResult.result && jobResult.result.status === "not_found") {
        setIsProcessing(false);
        setIsError(true);
        setErrorMessage("لم نتمكن من العثور على آية أو حديث موثّق يطابق المحتوى.");
      } else {
        setIsProcessing(false);
        setIsError(true);
        setErrorMessage(jobResult.result?.message || "تعذر العثور على نتائج للمقطع.");
      }
    } catch (err: any) {
      setIsProcessing(false);
      setIsError(true);
      setErrorMessage(err.message || "تعذر إكمال فحص الرابط المشارك.");
    }
  };

  const handleIrisOpened = () => {
    if (pendingResult) {
      try {
        setScanResult(pendingResult);
        router.replace("/result" as unknown as never);
      } catch (navErr) {
        console.error("Navigation error from handle-share to result:", navErr);
      }
    }
  };

  const handleGoHome = () => {
    Haptics.selectionAsync();
    router.replace("/" as unknown as never);
  };

  const handleGoScan = () => {
    Haptics.selectionAsync();
    router.replace("/scan" as unknown as never);
  };

  return (
    <AmbientBackground>
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: insets.bottom + spacing.md,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleGoHome}
            accessible
            accessibilityRole="button"
            accessibilityLabel="العودة إلى الرئيسية"
            hitSlop={12}
            style={styles.navButton}
          >
            <AdaptiveGlass borderRadius={radii.full} style={styles.navGlassCircle}>
              {Platform.OS === "ios" ? (
                <SymbolView name="chevron.backward" size={16} tintColor={colors.ivory} />
              ) : (
                <Text style={styles.navFallbackText}>←</Text>
              )}
            </AdaptiveGlass>
          </Pressable>

          <Text style={styles.screenHeaderTitle}>فحص المحتوى المشارك</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Content */}
        <View style={styles.contentArea}>
          {isProcessing || isComplete ? (
            <View style={styles.centerContainer}>
              <ScanProgress
                mediaType={mediaKind}
                isComplete={isComplete}
                isError={isError}
                errorMessage={errorMessage}
                onIrisOpened={handleIrisOpened}
              />
              <Text style={styles.stageMessageText}>{currentStageMessage}</Text>
            </View>
          ) : isError ? (
            <AdaptiveGlass
              borderRadius={radii.xl}
              style={[styles.statusCard, shadows.glassCard]}
              highlightBorder
            >
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorTitle}>تعذر إكمال الفحص</Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>

              <View style={styles.actionButtons}>
                <GlassButton
                  label="الانتقال إلى الفحص اليدوي"
                  variant="primary"
                  onPress={handleGoScan}
                  style={styles.fullButton}
                />
                <GlassButton
                  label="الرئيسية"
                  variant="secondary"
                  onPress={handleGoHome}
                  style={styles.fullButton}
                />
              </View>
            </AdaptiveGlass>
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.warmGold} />
              <Text style={styles.loadingText}>جارٍ قراءة المشاركة...</Text>
            </View>
          )}
        </View>
      </View>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  headerRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  navButton: {
    width: 36,
    height: 36,
  },
  navGlassCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 26, 20, 0.5)",
  },
  navFallbackText: {
    color: colors.ivory,
    fontSize: 16,
  },
  screenHeaderTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ivory,
  },
  headerSpacer: {
    width: 36,
  },
  contentArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  stageMessageText: {
    marginTop: spacing.xl,
    fontSize: 15,
    color: colors.warmGold,
    fontWeight: "600",
    textAlign: "center",
  },
  statusCard: {
    width: "100%",
    padding: spacing.xl,
    alignItems: "center",
  },
  errorIcon: {
    fontSize: 38,
    marginBottom: spacing.sm,
  },
  errorTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: colors.ivory,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  actionButtons: {
    width: "100%",
    gap: spacing.sm,
  },
  fullButton: {
    width: "100%",
  },
  loadingContainer: {
    alignItems: "center",
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: colors.muted,
  },
});
