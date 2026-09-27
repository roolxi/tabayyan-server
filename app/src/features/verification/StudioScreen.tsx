import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { Backdrop } from "../../components/experience/Backdrop";
import { Glass } from "../../components/experience/Glass";
import { GlassAction } from "../../components/experience/GlassAction";
import { RubberSegment } from "../../components/experience/RubberSegment";
import { AnimatedContent } from "../../components/experience/AnimatedContent";
import { ThoughtLine } from "../../components/experience/ThoughtLine";
import { SourceCard } from "../../components/experience/SourceCard";
import { SwipeToast } from "../../components/experience/SwipeToast";
import { Icon } from "../../components/experience/Icon";
import { flow, palette, timing } from "../../components/experience/theme";
import { getPendingSharedPayload } from "../../native/shareBridge";
import { extractSupportedUrlFromText } from "../../api/urlMedia";
import { perfTracker } from "../../utils/perfTracker";
import { Mode, SourceEntry, Target } from "./model";
import { useVerification } from "./useVerification";
import {
  EmbeddedCameraPanel,
  CapturedPhotoAsset,
} from "../../components/experience/EmbeddedCameraPanel";
import { normalizeMediaAsset } from "../../api/media";
import { TabayyanLogo } from "../../components/brand/TabayyanLogo";

export default function StudioScreen() {
  const v = useVerification(),
    insets = useSafeAreaInsets(),
    router = useRouter(),
    pathname = usePathname();
  const params = useLocalSearchParams<{
    url?: string;
    q?: string;
    type?: string;
    mode?: string;
    id?: string;
    uri?: string;
    name?: string;
    mediaKind?: string;
  }>();
  const input = useRef<TextInput>(null),
    list = useRef<FlatList<SourceEntry>>(null),
    consumed = useRef("");
  const [sources, setSources] = useState(pathname === "/scan"),
    [focused, setFocused] = useState(false),
    [isLinkMode, setIsLinkMode] = useState(false),
    [cameraVisible, setCameraVisible] = useState(params.mode === "camera");
  const savedTextDraft = useRef<{ query: string; target: Target; mode: Mode }>({
    query: "",
    target: "quran",
    mode: "normal",
  });
  const savedLinkDraft = useRef("");
  useEffect(() => {
    const s = Keyboard.addListener("keyboardDidHide", () => setFocused(false));
    return () => s.remove();
  }, []);
  useEffect(() => {
    let active = true;
    // Defer one microtask so StrictMode's cancelled setup never consumes a share or starts a request.
    void Promise.resolve().then(async () => {
      if (!active) return;
      const key = JSON.stringify(params);
      if (consumed.current === key) return;
      if (pathname === "/handle-share" && !params.url) {
        const payload = await getPendingSharedPayload();
        if (!active) return;
        consumed.current = key;
        if (payload?.url) {
          setIsLinkMode(true);
          v.verifyUrl(payload.url, payload.id);
        } else
          v.reportError("لم نجد رابطًا في المشاركة. ألصقه هنا أو ارفع الوسيط.");
      } else {
        consumed.current = key;
        if (params.url) {
          setIsLinkMode(true);
          v.verifyUrl(params.url, params.id);
        } else if (params.q)
          v.search(
            params.q,
            params.mode === "meaning" || params.mode === "specialist"
              ? params.mode
              : "normal",
            params.type === "quran" ? "quran" : "hadith",
          );
        else if (params.uri)
          v.verifyFile({
            uri: params.uri,
            name: params.name || "media",
            type:
              params.type ||
              (params.mediaKind === "video" ? "video/mp4" : "image/jpeg"),
          });
        else if (params.mode === "meaning") v.changeMode("meaning");
      }
    });
    return () => {
      active = false;
    };
  }, [
    params.url,
    params.q,
    params.type,
    params.mode,
    params.id,
    params.uri,
    params.name,
    params.mediaKind,
    pathname,
  ]);
  const [specialistEnabled, setSpecialistEnabled] = useState(
    v.mode === "specialist" || params.mode === "specialist"
  );
  useEffect(() => {
    if (v.mode === "specialist") setSpecialistEnabled(true);
    else if (v.mode === "normal") setSpecialistEnabled(false);
  }, [v.mode]);

  const searchMethods: { value: "normal" | "meaning"; label: string }[] = [
    { value: "meaning", label: "بالمعنى" },
    { value: "normal", label: "بالنص" },
  ];

  const introProgress = useSharedValue(1);
  const linkProgress = useSharedValue(0);
  useEffect(() => {
    introProgress.value = withTiming(v.searched ? 0 : 1, timing);
  }, [v.searched]);
  useEffect(() => {
    linkProgress.value = withTiming(isLinkMode ? 1 : 0, timing);
  }, [isLinkMode]);
  const introStyle = useAnimatedStyle(() => ({
    height: 150 * introProgress.value,
    opacity: introProgress.value,
    transform: [{ translateY: -8 * (1 - introProgress.value) }],
  }));
  const targetCollapseStyle = useAnimatedStyle(() => {
    const p = 1 - linkProgress.value;
    return {
      maxHeight: 64 * p,
      opacity: p,
      marginBottom: 16 * p,
      transform: [{ translateY: -8 * (1 - p) }],
      overflow: "hidden",
    };
  });
  const methodCollapseStyle = useAnimatedStyle(() => {
    const p = 1 - linkProgress.value;
    return {
      maxHeight: 180 * p,
      opacity: p,
      marginBottom: 6 * p,
      transform: [{ translateY: -6 * (1 - p) }],
      overflow: "hidden",
    };
  });
  const showSpecialistToggle =
    v.target === "hadith" &&
    v.mode !== "meaning" &&
    !isLinkMode &&
    !v.attachment;
  const specialistProgress = useSharedValue(showSpecialistToggle ? 1 : 0);
  useEffect(() => {
    specialistProgress.value = withTiming(
      showSpecialistToggle ? 1 : 0,
      timing
    );
  }, [showSpecialistToggle]);
  const specialistToggleStyle = useAnimatedStyle(() => ({
    maxHeight: 64 * specialistProgress.value,
    opacity: specialistProgress.value,
    marginTop: 6 * specialistProgress.value,
    overflow: "hidden",
  }));
  const handleReviewSpecialist = (entry: SourceEntry) => {
    setSpecialistEnabled(true);
    v.reviewSpecialist(entry.text);
  };
  useEffect(() => {
    if (v.perfId && v.searched && !v.busy) {
      perfTracker.recordRender(v.perfId);
    }
  }, [v.perfId, v.searched, v.busy, v.entries]);
  const enterLinkMode = (initialUrl?: string) => {
    if (!isLinkMode) {
      savedTextDraft.current = {
        query: v.query,
        target: v.target,
        mode: v.mode,
      };
      setIsLinkMode(true);
      if (initialUrl !== undefined) {
        savedLinkDraft.current = initialUrl;
        v.setQuery(initialUrl);
      } else {
        v.setQuery(savedLinkDraft.current);
      }
    } else if (initialUrl !== undefined) {
      savedLinkDraft.current = initialUrl;
      v.setQuery(initialUrl);
    }
    if (v.attachment) {
      v.removeAttachment();
    }
    setSources(false);
    setTimeout(() => {
      input.current?.focus();
    }, 100);
  };
  const returnToTextMode = () => {
    savedLinkDraft.current = v.query;
    setIsLinkMode(false);
    v.setQuery(savedTextDraft.current.query);
    v.changeTarget(savedTextDraft.current.target);
    v.changeMode(savedTextDraft.current.mode);
    setTimeout(() => {
      input.current?.focus();
    }, 100);
  };
  const handleQueryChange = (text: string) => {
    if (!isLinkMode) {
      const detected = extractSupportedUrlFromText(text);
      if (detected) {
        enterLinkMode(detected);
        return;
      }
    }
    v.setQuery(text);
  };
  const isUrl = isLinkMode || Boolean(extractSupportedUrlFromText(v.query));
  const placeholder = isLinkMode
    ? "ألصق رابط المقطع هنا…"
    : v.mode === "meaning"
      ? "صف المعنى الذي تتذكّره…"
      : v.target === "hadith"
        ? "اكتب الحديث أو جزءًا منه…"
        : "اكتب الآية أو جزءًا منها…";
  const example =
    v.mode === "meaning"
      ? "حديث عن أثر النية في العمل"
      : v.target === "hadith"
        ? "إنما الأعمال بالنيات"
        : "فإن مع العسر يسرا";
  const confirm = (item: SourceEntry) => {
    v.search(item.text, "normal", item.kind);
    list.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const handleCapturePhoto = (photo: CapturedPhotoAsset) => {
    try {
      const descriptor = normalizeMediaAsset(
        { uri: photo.uri, type: "image", mimeType: "image/jpeg" },
        "camera",
      );
      v.setAttachment(descriptor);
      setCameraVisible(false);
    } catch (e) {
      v.reportError((e as Error).message || "تعذر معالجة الصورة الملتقطة.");
    }
  };
  const submit = () => {
    setSources(false);
    if (isLinkMode) {
      v.verifyUrl(v.query);
    } else {
      v.submit();
    }
  };
  const showEmpty =
    v.searched &&
    !v.busy &&
    !v.error &&
    !v.cancelled &&
    !v.entries.length &&
    !v.suggestions.length;
  return (
    <View style={styles.screen}>
      <Backdrop animated busy={v.busy} context={v.target} />
      <FlatList
        ref={list}
        data={v.entries}
        keyExtractor={(item) =>
          `${item.kind}:${item.id}:${item.text.slice(0, 32)}`
        }
        renderItem={({ item, index }) => (
          <AnimatedContent delay={Math.min(index, 4) * 55}>
            <SourceCard
              item={item}
              onConfirm={confirm}
              onError={v.reportError}
              onReviewSpecialist={handleReviewSpecialist}
            />
          </AnimatedContent>
        )}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
        ListHeaderComponent={
          <View>
            <View style={styles.nav}>
              <View style={styles.brand}>
                <TabayyanLogo width={26} height={22} color="#F4F0E6" />
                <Text style={styles.brandName}>تبيّن</Text>
              </View>
              <View style={styles.navActions}>
                {v.searched && (
                  <GlassAction
                    label="تحقق جديد"
                    icon="plus"
                    iconOnly
                    onPress={() => {
                      v.reset();
                      setIsLinkMode(false);
                      savedLinkDraft.current = "";
                      savedTextDraft.current = { query: "", target: "quran", mode: "normal" };
                      input.current?.focus();
                    }}
                  />
                )}
                {Platform.OS === "ios" && (
                  <GlassAction
                    label="الاختصار"
                    icon="link"
                    onPress={() => router.push("/shortcut-setup")}
                  />
                )}
                <GlassAction
                  label="عن تبيّن والمصادر"
                  icon="info"
                  iconOnly
                  onPress={() => router.push("/about")}
                />
              </View>
            </View>
            <Animated.View
              pointerEvents="none"
              style={[{ overflow: "hidden" }, introStyle]}
            >
              <View style={styles.intro}>

                <Text style={styles.eyebrow}>
                  مِنَ النَّصِّ إِلَى المَصْدَر
                </Text>
                <Text style={styles.title}>كن على بيّنة.</Text>
                <Text style={styles.subtitle}>
                  اكتب، أرفق، أو ألصق رابطًا. ثم تبيّن.
                </Text>
              </View>
            </Animated.View>
            <Animated.View
              pointerEvents={isLinkMode ? "none" : "auto"}
              style={[styles.target, targetCollapseStyle]}
            >
              <RubberSegment
                items={[
                  { value: "quran", label: "القرآن الكريم" },
                  { value: "hadith", label: "الحديث الشريف" },
                ]}
                value={v.target}
                onChange={(t) => {
                  v.changeTarget(t);
                  setSources(false);
                }}
                label="نوع النص"
              />
            </Animated.View>
            <Animated.View layout={flow} style={{ marginBottom: 16 }}>
              <Glass
                strong
                radius={32}
                style={[
                  styles.composer,
                  focused && { borderColor: "rgba(192,255,220,.4)" },
                ]}
              >
                <View style={styles.composerTop}>
                  <View style={styles.caption}>
                    <View style={styles.liveDot} />
                    <Text style={styles.captionText}>
                      {v.attachment
                        ? "مرفق للتحقّق"
                        : isLinkMode
                          ? "رابط مقطع"
                          : "مساحة التحقّق"}
                    </Text>
                  </View>
                  <View style={styles.composerTopActions}>
                    {isLinkMode && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="العودة للنص"
                        hitSlop={8}
                        onPress={returnToTextMode}
                        style={styles.returnButton}
                      >
                        <Text style={styles.returnButtonText}>العودة للنص</Text>
                        <Icon name="arrow" size={11} color={palette.mint} />
                      </Pressable>
                    )}
                    {v.query.length > 0 && !v.busy && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="مسح النص"
                        hitSlop={12}
                        onPress={() => v.setQuery("")}
                        style={styles.clear}
                      >
                        <Icon name="close" size={15} color={palette.muted} />
                      </Pressable>
                    )}
                  </View>
                </View>
                <Animated.View
                  pointerEvents={isLinkMode ? "none" : "auto"}
                  style={methodCollapseStyle}
                >
                  <View style={{ marginBottom: 6 }}>
                    <RubberSegment
                      compact
                      items={searchMethods}
                      value={v.mode === "meaning" ? "meaning" : "normal"}
                      onChange={(m) => {
                        if (m === "meaning") {
                          v.changeMode("meaning");
                        } else {
                          v.changeMode(specialistEnabled ? "specialist" : "normal");
                        }
                      }}
                      label="طريقة البحث"
                    />
                  </View>
                  <Animated.View
                    pointerEvents={showSpecialistToggle ? "auto" : "none"}
                    style={specialistToggleStyle}
                  >
                    <RubberSegment
                      compact
                      label="مستوى تفاصيل الحديث"
                      items={[
                        { value: "specialist", label: "متخصص" },
                        { value: "normal", label: "مبسّط" },
                      ]}
                      value={v.mode === "specialist" ? "specialist" : "normal"}
                      onChange={(mode) => {
                        setSpecialistEnabled(mode === "specialist");
                        v.changeMode(mode);
                      }}
                    />
                  </Animated.View>
                  <AnimatedContent key={`${v.target}:${v.mode}`}>
                    <Text style={styles.modeHint}>
                      {v.mode === "meaning"
                        ? "المعنى يقودنا للعبارة، ثم نتحقّق منها."
                        : v.mode === "specialist"
                          ? "روايات الحديث وتفاصيل التخريج."
                          : "النص كما ورد في مصدره."}
                    </Text>
                  </AnimatedContent>
                </Animated.View>
                {isLinkMode && (
                  <AnimatedContent>
                    <Text style={styles.linkHint}>
                      يوتيوب، تيك توك، أو إنستغرام
                    </Text>
                  </AnimatedContent>
                )}
                {v.attachment ? (
                  <AnimatedContent>
                    <View style={styles.attachment}>
                      {v.attachment.type.startsWith("image/") ? (
                        <Image
                          source={{ uri: v.attachment.uri }}
                          style={styles.thumbnail}
                        />
                      ) : (
                        <Icon name="image" size={32} />
                      )}
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text numberOfLines={2} style={styles.fileName}>
                          {v.attachment.name}
                        </Text>
                        <Text style={styles.captionText}>جاهز للتحقّق</Text>
                      </View>
                      {!v.busy && (
                        <GlassAction
                          label="إزالة المرفق"
                          icon="close"
                          iconOnly
                          onPress={v.removeAttachment}
                        />
                      )}
                    </View>
                  </AnimatedContent>
                ) : (
                  <TextInput
                    ref={input}
                    value={v.query}
                    onChangeText={handleQueryChange}
                    editable={!v.busy}
                    multiline
                    accessibilityLabel={
                      isLinkMode ? "رابط مقطع للتحقق" : "نص أو رابط للتحقق"
                    }
                    placeholder={placeholder}
                    placeholderTextColor="#95B5A4"
                    style={[
                      styles.input,
                      isLinkMode && v.query.length > 0 && styles.linkInput,
                    ]}
                    selectionColor={palette.green}
                    textAlign={
                      isLinkMode && v.query.length > 0 ? "left" : "right"
                    }
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={!isLinkMode && !isUrl}
                    autoComplete={isLinkMode ? "off" : undefined}
                    textContentType={isLinkMode ? "URL" : undefined}
                    keyboardType={isLinkMode ? "url" : "default"}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    scrollEnabled
                    maxLength={20000}
                  />
                )}
                <View style={styles.toolbar}>
                  <View style={styles.attachActions}>
                    <GlassAction
                      label={sources ? "إغلاق المرفقات" : "إضافة صورة أو فيديو"}
                      icon={sources ? "close" : "plus"}
                      iconOnly
                      disabled={v.busy}
                      onPress={() => {
                        Keyboard.dismiss();
                        setSources(!sources);
                      }}
                    />
                    <GlassAction
                      label="التقاط صورة بالكاميرا"
                      icon="camera"
                      iconOnly
                      disabled={v.busy}
                      onPress={() => {
                        Keyboard.dismiss();
                        setSources(false);
                        setCameraVisible(true);
                      }}
                    />
                  </View>
                  <GlassAction
                    primary
                    busy={v.busy}
                    label={v.busy ? "إيقاف" : "تبيّن"}
                    disabled={!v.busy && !v.query.trim() && !v.attachment}
                    onPress={v.busy ? v.cancel : submit}
                    style={{ minWidth: 128 }}
                  />
                </View>
                {sources && (
                  <AnimatedContent>
                    <View style={styles.sourceMenu}>
                      <GlassAction
                        label="صورة أو فيديو"
                        icon="image"
                        onPress={() => {
                          setSources(false);
                          void v.pick("library");
                        }}
                      />
                      <GlassAction
                        label="ألصق رابطًا"
                        icon="link"
                        onPress={() => {
                          enterLinkMode();
                        }}
                      />
                      <Text style={styles.mediaLimit}>
                        صورة حتى 8 MB · فيديو حتى 40 MB / 3 دقائق
                      </Text>
                    </View>
                  </AnimatedContent>
                )}
              </Glass>
            </Animated.View>
            {!v.searched && !focused && !isLinkMode && (
              <AnimatedContent>
                <View style={styles.examples}>
                  <Text style={styles.exampleLabel}>جرّب الآن</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`استخدام المثال: ${example}`}
                    onPress={() => {
                      v.setQuery(example);
                      input.current?.focus();
                    }}
                    style={styles.example}
                  >
                    <Text style={styles.exampleText}>{example}</Text>
                    <Icon name="arrow" size={13} color={palette.muted} />
                  </Pressable>
                </View>
              </AnimatedContent>
            )}
            {v.searched && v.startedAt > 0 && (
              <View style={{ marginBottom: 14 }}>
                <ThoughtLine
                  busy={v.busy}
                  error={!!v.error}
                  cancelled={v.cancelled}
                  message={v.message}
                  steps={v.steps}
                  startedAt={v.startedAt}
                  endedAt={v.endedAt}
                />
              </View>
            )}
            {!!v.error && (
              <AnimatedContent key={v.error}>
                <View style={{ marginBottom: 14 }}>
                  <SwipeToast
                    message={v.error}
                    onClose={v.dismissError}
                    onRetry={v.canRetry ? v.retry : undefined}
                  />
                </View>
              </AnimatedContent>
            )}
            {!!v.message && !v.busy && (
              <AnimatedContent>
                <Text style={styles.message}>{v.message}</Text>
              </AnimatedContent>
            )}
            {!v.busy && v.suggestions.length > 0 && (
              <AnimatedContent>
                <Text style={styles.resultTitle}>هل تقصد هذا المعنى؟</Text>
                <Text style={styles.message}>
                  عبارات مقترحة للبحث، وليست نصوصًا موثّقة بعد.
                </Text>
                {v.suggestions.map((phrase, i) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => v.search(phrase, "normal")}
                    key={`${i}:${phrase}`}
                    style={{ marginBottom: 10 }}
                  >
                    <Glass radius={22} style={{ padding: 18, gap: 12 }}>
                      <Text style={styles.phrase}>{phrase}</Text>
                      <Text style={styles.link}>تحقّق من المصدر ←</Text>
                    </Glass>
                  </Pressable>
                ))}
              </AnimatedContent>
            )}
            {showEmpty && (
              <AnimatedContent>
                <Glass style={styles.empty}>
                  <Icon name="book" size={27} color={palette.muted} />
                  <Text style={styles.emptyTitle}>نحتاج عبارة أخرى</Text>
                  <Text style={styles.emptyBody}>
                    جرّب كلمات أقل، أو صف المعنى الذي تتذكّره.
                  </Text>
                  {v.mode !== "meaning" && (
                    <GlassAction
                      label="البحث بالمعنى"
                      icon="spark"
                      onPress={() => v.search(v.query, "meaning")}
                    />
                  )}
                </Glass>
              </AnimatedContent>
            )}
            {v.entries.length > 0 && (
              <View style={styles.resultsHeading}>
                <Text style={styles.resultTitle}>
                  {v.busy || v.cancelled || v.error || v.query !== v.resultLabel
                    ? "نتائج البحث السابق"
                    : v.resultMode === "specialist"
                      ? "نتائج وضع المتخصص"
                      : v.entries[0].candidate
                        ? "هل هذا النص المقصود؟"
                        : "من المصدر إليك"}
                </Text>
                <Text style={styles.count}>{v.entries.length} نتيجة</Text>
              </View>
            )}
            {v.specialistAvailable && !v.busy && v.mode !== "specialist" && (
              <GlassAction
                label="استكشف الروايات والتخريج"
                icon="book"
                onPress={() =>
                  v.search(v.requestLabel || v.query, "specialist", "hadith")
                }
                style={{ marginBottom: 14 }}
              />
            )}
          </View>
        }
        ListFooterComponent={
          <View style={[styles.footer, !v.searched && { marginTop: 40 }]}>
            <View style={styles.footerRule} />
            <Text style={styles.footerTitle}>المصدر هو المرجع.</Text>
            <Text style={styles.footerBody}>
              الأحكام والنصوص من المصادر،{"\n"}والذكاء الاصطناعي يساعد على
              الوصول إليها.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="منهج التحقق والمصادر"
              onPress={() => router.push("/about")}
              style={styles.footerLink}
            >
              <Text style={styles.link}>كيف يعمل تبيّن</Text>
              <Icon name="source" size={12} color={palette.dim} />
            </Pressable>
          </View>
        }
      />
      <EmbeddedCameraPanel
        visible={cameraVisible}
        onClose={() => setCameraVisible(false)}
        onCapture={handleCapturePhoto}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: {
    paddingHorizontal: 22,
    flexGrow: 1,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  nav: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 46,
  },
  brand: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  brandName: { fontSize: 26, fontWeight: "700", color: palette.text },
  navActions: { flexDirection: "row", gap: 8 },
  intro: { paddingTop: 20, paddingBottom: 18, alignItems: "flex-end", gap: 8 },
  eyebrow: { color: palette.mint, fontSize: 10, letterSpacing: 0.6 },
  title: {
    fontSize: 34,
    lineHeight: 48,
    fontWeight: "500",
    color: palette.text,
    textAlign: "right",
  },
  subtitle: {
    fontSize: 13,
    color: palette.muted,
    lineHeight: 23,
    textAlign: "right",
  },
  target: { marginBottom: 16, alignSelf: "center", width: "100%" },
  composer: { padding: 16 },
  composerTop: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    minHeight: 24,
  },
  caption: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.mint,
  },
  captionText: { color: palette.muted, fontSize: 11, textAlign: "right" },
  clear: { padding: 5 },
  composerTopActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  returnButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(10, 194, 139, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(192, 255, 220, 0.15)",
  },
  returnButtonText: {
    fontSize: 11,
    fontWeight: "500",
    color: palette.mint,
  },
  modeHint: {
    fontSize: 11,
    color: palette.dim,
    textAlign: "right",
    marginTop: 8,
    lineHeight: 19,
  },
  linkHint: {
    fontSize: 11,
    color: palette.dim,
    textAlign: "right",
    marginBottom: 8,
    lineHeight: 18,
  },
  input: {
    minHeight: 118,
    maxHeight: 200,
    paddingTop: 15,
    paddingBottom: 12,
    paddingHorizontal: 3,
    fontSize: 19,
    lineHeight: 32,
    color: palette.text,
    writingDirection: "rtl",
  },
  linkInput: {
    writingDirection: "ltr",
    textAlign: "left",
    fontSize: 16,
    lineHeight: 26,
  },
  toolbar: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: "rgba(192,255,220,.10)",
    gap: 12,
  },
  attachActions: { flexDirection: "row-reverse", gap: 8 },
  sourceMenu: { paddingTop: 16, gap: 10 },
  mediaLimit: {
    color: palette.muted,
    fontSize: 10,
    textAlign: "center",
    lineHeight: 20,
  },
  examples: { alignItems: "flex-end", gap: 10, paddingTop: 4 },
  exampleLabel: { fontSize: 10, color: palette.dim },
  example: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(192,255,220,.09)",
    backgroundColor: "rgba(152,235,177,.035)",
  },
  exampleText: { fontSize: 12, color: palette.muted },
  attachment: {
    minHeight: 120,
    paddingVertical: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  thumbnail: { height: 76, width: 66, borderRadius: 12 },
  fileName: { fontSize: 12, color: palette.text, textAlign: "right" },
  message: {
    fontSize: 12,
    lineHeight: 23,
    color: palette.muted,
    textAlign: "right",
    marginBottom: 16,
  },
  resultsHeading: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 19,
    color: palette.text,
    textAlign: "right",
    fontWeight: "600",
  },
  count: { fontSize: 11, color: palette.dim },
  phrase: {
    fontSize: 17,
    lineHeight: 30,
    color: palette.text,
    textAlign: "right",
  },
  link: { fontSize: 11, color: palette.mint, textAlign: "right" },
  empty: { padding: 24, alignItems: "center", gap: 14, marginBottom: 14 },
  emptyTitle: { fontSize: 19, color: palette.text },
  emptyBody: {
    fontSize: 13,
    lineHeight: 23,
    color: palette.muted,
    textAlign: "center",
  },
  footer: { paddingTop: 26, paddingBottom: 10, alignItems: "center", gap: 8 },
  footerRule: {
    width: 24,
    height: 1,
    backgroundColor: "rgba(192,255,220,.2)",
    marginBottom: 10,
  },
  footerTitle: { fontSize: 12, color: palette.muted },
  footerBody: {
    fontSize: 10,
    lineHeight: 19,
    color: palette.dim,
    textAlign: "center",
  },
  footerLink: {
    flexDirection: "row-reverse",
    gap: 8,
    alignItems: "center",
    minHeight: 44,
  },
});
