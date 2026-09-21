import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { AmbientBackground } from "../src/components/motion/AmbientBackground";
import { AdaptiveGlass } from "../src/components/glass/AdaptiveGlass";
import { GlassButton } from "../src/components/glass/GlassButton";
import { ScanProgress } from "../src/components/motion/ScanProgress";
import { useScanContext } from "../src/context/ScanContext";
import { normalizeMediaAsset, uploadMedia } from "../src/api/media";
import { MediaExtractResponse } from "../src/api/types";
import { colors } from "../src/theme/colors";
import { radii, spacing } from "../src/theme/spacing";
import { typography } from "../src/theme/typography";
import { shadows } from "../src/theme/shadows";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MiB
const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40 MiB
const MAX_VIDEO_DURATION_SEC = 180; // 3 minutes

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    uri?: string;
    name?: string;
    type?: string;
    mediaKind?: "image" | "video";
  }>();

  const { setScanResult } = useScanContext();

  // Active file state
  const [activeUri, setActiveUri] = useState<string | null>(params.uri || null);
  const [activeName, setActiveName] = useState<string>(params.name || "media");
  const [activeType, setActiveType] = useState<string>(
    params.type || (params.mediaKind === "video" ? "video/mp4" : "image/jpeg")
  );
  const [mediaKind, setMediaKind] = useState<"image" | "video">(
    params.mediaKind === "video" ? "video" : "image"
  );

  // Scan state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [notFound, setNotFound] = useState<boolean>(false);
  const [pendingResult, setPendingResult] = useState<MediaExtractResponse | null>(null);

  // Trigger scan when file params change or are provided initially
  useEffect(() => {
    if (params.uri && params.uri !== activeUri) {
      try {
        const descriptor = normalizeMediaAsset(
          {
            uri: params.uri,
            fileName: params.name,
            mimeType: params.type,
          },
          params.mediaKind === "video" ? "video" : "image"
        );
        setActiveUri(descriptor.uri);
        setActiveName(descriptor.name);
        setActiveType(descriptor.type);
        const kind = descriptor.type.startsWith("video/") ? "video" : "image";
        setMediaKind(kind);
        startScan(descriptor.uri, descriptor.name, descriptor.type, kind);
      } catch (normErr: unknown) {
        const apiErr = normErr as { message?: string };
        setIsError(true);
        setErrorMessage(apiErr.message || "صيغة الملف غير مدعومة.");
      }
    } else if (params.uri && !isScanning && !isComplete && !isError && !notFound) {
      startScan(params.uri, activeName, activeType, mediaKind);
    }
  }, [params.uri]);

  const validateAndSelectFile = (
    uri: string,
    fileName: string,
    mimeType: string,
    kind: "image" | "video",
    fileSize?: number | null,
    durationMs?: number | null
  ) => {
    // Validate file size if available from picker
    if (fileSize) {
      if (kind === "image" && fileSize > MAX_IMAGE_BYTES) {
        Alert.alert(
          "حجم الصورة كبير",
          "الحد الأقصى لحجم الصورة هو 8 ميجابايت. يرجى اختيار صورة أصغر حجمًا."
        );
        return false;
      }
      if (kind === "video" && fileSize > MAX_VIDEO_BYTES) {
        Alert.alert(
          "حجم الفيديو كبير",
          "الحد الأقصى لحجم الفيديو هو 40 ميجابايت. يرجى اختيار مقطع أقصر أو أصغر حجمًا."
        );
        return false;
      }
    }

    // Validate video duration if available
    if (kind === "video" && durationMs) {
      const durationSeconds = durationMs > 1000 ? durationMs / 1000 : durationMs;
      if (durationSeconds > MAX_VIDEO_DURATION_SEC) {
        Alert.alert(
          "مدة الفيديو طويلة",
          "الحد الأقصى لمدة الفيديو هو 3 دقائق (180 ثانية). يرجى اختيار مقطع أقصر."
        );
        return false;
      }
    }

    setActiveUri(uri);
    setActiveName(fileName);
    setActiveType(mimeType);
    setMediaKind(kind);
    startScan(uri, fileName, mimeType, kind);
    return true;
  };

  const startScan = async (
    uri: string,
    name: string,
    type: string,
    kind: "image" | "video"
  ) => {
    setIsScanning(true);
    setIsComplete(false);
    setIsError(false);
    setErrorMessage("");
    setNotFound(false);
    setPendingResult(null);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await uploadMedia({
        uri,
        name,
        type,
      });

      if (response.status === "candidates" && response.results && response.results.length > 0) {
        setPendingResult(response);
        setIsComplete(true);
      } else {
        setIsScanning(false);
        setNotFound(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (err: unknown) {
      setIsScanning(false);
      setIsError(true);
      const apiErr = err as { code?: string; message?: string; statusCode?: number };

      if (apiErr.code === "unsupported_media_type" || apiErr.statusCode === 415) {
        setErrorMessage(
          apiErr.message || "صيغة الملف غير مدعومة. الصيغ المقبولة: JPG, PNG, WebP, MP4, MOV, WebM."
        );
      } else if (apiErr.code === "media_too_large" || apiErr.statusCode === 413) {
        setErrorMessage("حجم الملف يتجاوز الحد المسموح (8 ميجابايت للصور، 40 ميجابايت للفيديو).");
      } else if (apiErr.code === "video_too_long") {
        setErrorMessage("مدة مقطع الفيديو أطول من الحد المسموح (3 دقائق كحد أقصى).");
      } else if (apiErr.code === "video_has_no_audio") {
        setErrorMessage("لم نتمكن من العثور على مسار صوتي واضح في مقطع الفيديو لاستخراج النص منه.");
      } else if (apiErr.code === "ai_timeout" || apiErr.statusCode === 504) {
        setErrorMessage("استغرقت معالجة الذكاء الاصطناعي وقتاً أطول من المعتاد. يرجى إعادة المحاولة.");
      } else if (apiErr.code === "ai_unavailable" || apiErr.code === "rate_limited" || apiErr.statusCode === 429) {
        setErrorMessage("خدمة الذكاء الاصطناعي غير متاحة مؤقتًا أو تم تجاوز الحد المسموح. يرجى الانتظار والمحاولة لاحقًا.");
      } else {
        let displayMsg = apiErr.message || "تعذّر الاتصال بخادم الفحص. يرجى التأكد من تشغيل الخادم والاتصال بالشبكة.";
        // Ensure user never sees internal implementation errors
        if (/formdata/i.test(displayMsg) || /implementation/i.test(displayMsg) || /blob/i.test(displayMsg)) {
          displayMsg = "حدث خطأ أثناء معالجة الوسيط ورفعه. يرجى المحاولة مرة أخرى.";
        }
        setErrorMessage(displayMsg);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleIrisOpened = () => {
    if (pendingResult) {
      try {
        setScanResult(pendingResult);
        router.replace("/result" as unknown as never);
      } catch (navErr) {
        console.error("Navigation to /result failed:", navErr);
      }
    }
  };

  const handleCapturePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("الإذن مطلوب", "يرجى منح إذن الكاميرا لالتقاط صورة للفحص.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        try {
          const descriptor = normalizeMediaAsset(asset, "camera");
          validateAndSelectFile(
            descriptor.uri,
            descriptor.name,
            descriptor.type,
            "image",
            asset.fileSize
          );
        } catch (normErr: unknown) {
          const apiErr = normErr as { message?: string };
          Alert.alert("صيغة غير مدعومة", apiErr.message || "تعذّر معالجة الصورة الملتقطة.");
        }
      }
    } catch (err) {
      console.warn("Camera capture error:", err);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        try {
          const descriptor = normalizeMediaAsset(asset, "image");
          validateAndSelectFile(
            descriptor.uri,
            descriptor.name,
            descriptor.type,
            "image",
            asset.fileSize
          );
        } catch (normErr: unknown) {
          const apiErr = normErr as { message?: string };
          Alert.alert("صيغة غير مدعومة", apiErr.message || "تعذّر معالجة الصورة المختارة.");
        }
      }
    } catch (err) {
      console.warn("Pick image error:", err);
    }
  };

  const handlePickVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        try {
          const descriptor = normalizeMediaAsset(asset, "video");
          validateAndSelectFile(
            descriptor.uri,
            descriptor.name,
            descriptor.type,
            "video",
            asset.fileSize,
            asset.duration
          );
        } catch (normErr: unknown) {
          const apiErr = normErr as { message?: string };
          Alert.alert("صيغة غير مدعومة", apiErr.message || "تعذّر معالجة مقطع الفيديو.");
        }
      }
    } catch (err) {
      console.warn("Pick video error:", err);
    }
  };

  const handleReset = () => {
    Haptics.selectionAsync();
    setActiveUri(null);
    setIsScanning(false);
    setIsComplete(false);
    setIsError(false);
    setNotFound(false);
    setPendingResult(null);
  };

  const handleGoToSearch = () => {
    Haptics.selectionAsync();
    router.push("/search" as unknown as never);
  };

  return (
    <AmbientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom + spacing.dockHeight + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Bar */}
        <View style={styles.topBar}>
          <Text style={styles.screenTitle}>فحص الوسائط</Text>

          {activeUri && !isScanning && (
            <Pressable
              onPress={handleReset}
              accessible
              accessibilityRole="button"
              accessibilityLabel="إعادة اختيار وسيط"
              hitSlop={8}
            >
              <Text style={styles.changeFileButtonText}>تغيير الملف</Text>
            </Pressable>
          )}
        </View>

        {/* State 1: Active Scanning In-Progress or Iris Transitioning */}
        {(isScanning || isComplete) && (
          <View style={styles.scanningSection}>
            <ScanProgress
              mediaType={mediaKind}
              isComplete={isComplete}
              isError={isError}
              errorMessage={errorMessage}
              onIrisOpened={handleIrisOpened}
            />

            <View style={styles.fileInfoBadge}>
              <Text style={styles.fileInfoText} numberOfLines={1}>
                {mediaKind === "image" ? "صورة:" : "فيديو:"} {activeName}
              </Text>
            </View>

            <Text style={styles.scanNotice}>
              يتم استخراج النص للبحث فقط؛ النص المعتمد يطابق دائمًا المصحف أو موسوعة الدرر السنية.
            </Text>
          </View>
        )}

        {/* State 2: Error State */}
        {isError && !isScanning && (
          <AdaptiveGlass
            borderRadius={radii.lg}
            style={styles.errorCard}
            highlightBorder
          >
            <Text style={styles.errorCardIcon}>⚠️</Text>
            <Text style={styles.errorCardTitle}>تعذّر استخراج النص</Text>
            <Text style={styles.errorCardMessage}>{errorMessage}</Text>

            <View style={styles.errorActions}>
              <GlassButton
                label="إعادة المحاولة"
                variant="primary"
                onPress={() => {
                  if (activeUri) {
                    startScan(activeUri, activeName, activeType, mediaKind);
                  }
                }}
                style={styles.actionBtn}
              />
              <GlassButton
                label="اختيار ملف آخر"
                variant="secondary"
                onPress={handleReset}
                style={styles.actionBtn}
              />
            </View>
          </AdaptiveGlass>
        )}

        {/* State 3: Not Found State */}
        {notFound && !isScanning && (
          <AdaptiveGlass
            borderRadius={radii.lg}
            style={styles.notFoundCard}
            highlightBorder
          >
            <View style={styles.notFoundIconContainer}>
              {Platform.OS === "ios" ? (
                <SymbolView
                  name="text.magnifyingglass"
                  size={42}
                  tintColor={colors.warmGold}
                />
              ) : (
                <Text style={styles.notFoundFallbackIcon}>🔍</Text>
              )}
            </View>

            <Text style={styles.notFoundTitle}>لم نتمكن من مطابقة النص</Text>
            <Text style={styles.notFoundMessage}>
              لم نجد آية قرآنية أو حديثًا نبويًا مطابقًا في النص المستخرج من هذا الوسيط.
              يمكنك تجربة وسيط آخر أو البحث يدويًا.
            </Text>

            <View style={styles.notFoundActions}>
              <GlassButton
                label="اختيار وسيط آخر"
                variant="primary"
                onPress={handleReset}
                style={styles.actionBtn}
              />
              <GlassButton
                label="البحث النصي المباشر"
                variant="secondary"
                onPress={handleGoToSearch}
                style={styles.actionBtn}
              />
            </View>
          </AdaptiveGlass>
        )}

        {/* State 4: Default Media Picker UI (No file selected or reset) */}
        {!activeUri && !isScanning && (
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerHeadline}>
              اختر صورة أو مقطع فيديو للتحقق من النص الوارد فيه
            </Text>
            <Text style={styles.pickerSubline}>
              يقوم التطبيق بالتعرّف على النص ومطابقته مباشرة مع المصادر المعتمدة دون أي تدخّل في ألفاظها.
            </Text>

            {/* Picker Option 1: Camera */}
            <Pressable
              onPress={handleCapturePhoto}
              accessible
              accessibilityRole="button"
              accessibilityLabel="التقاط صورة عبر الكاميرا"
              style={styles.pickerOption}
            >
              <AdaptiveGlass
                borderRadius={radii.xl}
                style={[styles.pickerCard, shadows.glassCard]}
                highlightBorder
              >
                <View style={styles.pickerRow}>
                  <View style={styles.pickerIconWrapper}>
                    {Platform.OS === "ios" ? (
                      <SymbolView name="camera.fill" size={26} tintColor={colors.emerald} />
                    ) : (
                      <Text style={styles.pickerEmoji}>📷</Text>
                    )}
                  </View>
                  <View style={styles.pickerInfo}>
                    <Text style={styles.pickerOptionTitle}>التقاط صورة</Text>
                    <Text style={styles.pickerOptionSubtitle}>
                      تصوير كتاب، لوحة، أو شاشة للتحقق فورًا
                    </Text>
                  </View>
                </View>
              </AdaptiveGlass>
            </Pressable>

            {/* Picker Option 2: Image Gallery */}
            <Pressable
              onPress={handlePickImage}
              accessible
              accessibilityRole="button"
              accessibilityLabel="اختيار صورة من مكتبة الصور"
              style={styles.pickerOption}
            >
              <AdaptiveGlass
                borderRadius={radii.xl}
                style={[styles.pickerCard, shadows.glassCard]}
                highlightBorder
              >
                <View style={styles.pickerRow}>
                  <View style={styles.pickerIconWrapper}>
                    {Platform.OS === "ios" ? (
                      <SymbolView name="photo.fill" size={26} tintColor={colors.emerald} />
                    ) : (
                      <Text style={styles.pickerEmoji}>🖼️</Text>
                    )}
                  </View>
                  <View style={styles.pickerInfo}>
                    <Text style={styles.pickerOptionTitle}>اختيار صورة من المعرض</Text>
                    <Text style={styles.pickerOptionSubtitle}>
                      لقطات شاشة، منشورات شبكات التواصل، أو صور محفوظات (JPG, PNG, WebP حتى 8 MiB)
                    </Text>
                  </View>
                </View>
              </AdaptiveGlass>
            </Pressable>

            {/* Picker Option 3: Video Gallery */}
            <Pressable
              onPress={handlePickVideo}
              accessible
              accessibilityRole="button"
              accessibilityLabel="اختيار مقطع فيديو"
              style={styles.pickerOption}
            >
              <AdaptiveGlass
                borderRadius={radii.xl}
                style={[styles.pickerCard, shadows.glassCard]}
                highlightBorder
              >
                <View style={styles.pickerRow}>
                  <View style={styles.pickerIconWrapper}>
                    {Platform.OS === "ios" ? (
                      <SymbolView name="video.fill" size={26} tintColor={colors.warmGold} />
                    ) : (
                      <Text style={styles.pickerEmoji}>🎬</Text>
                    )}
                  </View>
                  <View style={styles.pickerInfo}>
                    <Text style={styles.pickerOptionTitle}>اختيار مقطع فيديو</Text>
                    <Text style={styles.pickerOptionSubtitle}>
                      استخراج الكلام المنطوق والتحقق من أصله (MP4, MOV حتى 40 MiB و 3 دقائق)
                    </Text>
                  </View>
                </View>
              </AdaptiveGlass>
            </Pressable>

            {/* Guardrail and Source Notice */}
            <View style={styles.guardrailCard}>
              <Text style={styles.guardrailText}>
                🛡️ لا يقوم الذكاء الاصطناعي بتصحيح الحديث أو تضعيفه أو توليد النص؛ دوره مقصور على استخراج الكلمات للبحث في المصدر الأصيل.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    flexGrow: 1,
  },
  topBar: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ivory,
    textAlign: "right",
  },
  changeFileButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.spectralMint,
  },
  scanningSection: {
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfoBadge: {
    backgroundColor: "rgba(7, 26, 20, 0.7)",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.2)",
    marginBottom: spacing.md,
    maxWidth: 280,
  },
  fileInfoText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
  },
  scanNotice: {
    fontSize: 12,
    color: "rgba(167, 180, 174, 0.7)",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
  pickerContainer: {
    gap: spacing.md,
  },
  pickerHeadline: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ivory,
    lineHeight: 26,
    textAlign: "right",
  },
  pickerSubline: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    textAlign: "right",
    marginBottom: spacing.sm,
  },
  pickerOption: {
    marginBottom: spacing.xs,
  },
  pickerCard: {
    padding: spacing.md,
    backgroundColor: colors.cardBackground,
  },
  pickerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.md,
  },
  pickerIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: "rgba(5, 9, 7, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.15)",
  },
  pickerEmoji: {
    fontSize: 22,
  },
  pickerInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  pickerOptionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ivory,
    marginBottom: 4,
    textAlign: "right",
  },
  pickerOptionSubtitle: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    textAlign: "right",
  },
  guardrailCard: {
    backgroundColor: "rgba(7, 26, 20, 0.5)",
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.15)",
    marginTop: spacing.sm,
  },
  guardrailText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.spectralMint,
    textAlign: "right",
  },
  errorCard: {
    padding: spacing.xl,
    backgroundColor: colors.cardBackground,
    alignItems: "center",
    borderRightWidth: 4,
    borderRightColor: colors.danger,
    marginTop: spacing.lg,
  },
  errorCardIcon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  errorCardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.danger,
    marginBottom: spacing.xs,
  },
  errorCardMessage: {
    fontSize: 14,
    color: colors.ivory,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  errorActions: {
    width: "100%",
    gap: spacing.sm,
  },
  notFoundCard: {
    padding: spacing.xl,
    backgroundColor: colors.cardBackground,
    alignItems: "center",
    borderRightWidth: 4,
    borderRightColor: colors.warmGold,
    marginTop: spacing.lg,
  },
  notFoundIconContainer: {
    marginBottom: spacing.sm,
  },
  notFoundFallbackIcon: {
    fontSize: 36,
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ivory,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  notFoundMessage: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  notFoundActions: {
    width: "100%",
    gap: spacing.sm,
  },
  actionBtn: {
    width: "100%",
  },
});
