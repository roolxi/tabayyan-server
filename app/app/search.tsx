import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { AmbientBackground } from "../src/components/motion/AmbientBackground";
import { AdaptiveGlass } from "../src/components/glass/AdaptiveGlass";
import { GlassButton } from "../src/components/glass/GlassButton";
import { QuranResultCard } from "../src/components/results/QuranResultCard";
import { HadithResultCard } from "../src/components/results/HadithResultCard";
import { searchQuran, suggestQuranPhrases } from "../src/api/quran";
import {
  searchHadith,
  suggestHadithPhrases,
  searchHadithByMeaning,
} from "../src/api/hadith";
import {
  HadithRecord,
  HadithSearchResponse,
  MeaningCandidate,
  QuranVerseItem,
} from "../src/api/types";
import { colors } from "../src/theme/colors";
import { radii, spacing } from "../src/theme/spacing";
import { typography } from "../src/theme/typography";

type SearchTarget = "quran" | "hadith";
type SearchSubMode = "normal" | "meaning";

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; type?: string; mode?: string }>();

  const [target, setTarget] = useState<SearchTarget>(
    params.type === "hadith" ? "hadith" : "quran"
  );
  const [subMode, setSubMode] = useState<SearchSubMode>(
    params.mode === "meaning" ? "meaning" : "normal"
  );
  const [query, setQuery] = useState<string>(params.q || "");

  // Results state
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quranResults, setQuranResults] = useState<QuranVerseItem[]>([]);
  const [quranApproximateMessage, setQuranApproximateMessage] = useState<string | null>(null);
  const [hadithResponse, setHadithResponse] = useState<HadithSearchResponse | null>(null);
  const [suggestCandidates, setSuggestCandidates] = useState<string[]>([]);
  const [meaningCandidates, setMeaningCandidates] = useState<MeaningCandidate[]>([]);
  const [meaningMessage, setMeaningMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Auto-execute if query passed in route params
  useEffect(() => {
    if (params.q && params.q.trim()) {
      handleExecuteSearch(params.q.trim());
    }
  }, [params.q]);

  const handleExecuteSearch = async (overrideQuery?: string) => {
    const searchText = (overrideQuery ?? query).trim();
    if (!searchText) return;

    Keyboard.dismiss();
    setLoading(true);
    setErrorMessage(null);
    setHasSearched(true);
    setQuranResults([]);
    setQuranApproximateMessage(null);
    setHadithResponse(null);
    setSuggestCandidates([]);
    setMeaningCandidates([]);
    setMeaningMessage(null);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (target === "quran") {
        if (subMode === "normal") {
          const res = await searchQuran(searchText);
          setQuranResults(res.results || []);
          if (res.matchType === "approximate" && res.message) {
            setQuranApproximateMessage(res.message);
          }
        } else {
          // Meaning/suggestion search for Quran
          const res = await suggestQuranPhrases(searchText);
          setSuggestCandidates(res.candidates || []);
          if (res.message) setMeaningMessage(res.message);
        }
      } else {
        // Hadith search
        if (subMode === "normal") {
          const res = await searchHadith(searchText, "simple");
          setHadithResponse(res);
        } else {
          // Meaning search for Hadith
          const res = await searchHadithByMeaning(searchText);
          if (res.status === "candidates" && res.candidates) {
            setMeaningCandidates(res.candidates);
          }
          if (res.message) setMeaningMessage(res.message);
        }
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || "تعذّر إكمال البحث. حاول مرة أخرى.";
      setErrorMessage(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickCandidate = (phrase: string) => {
    setQuery(phrase);
    setSubMode("normal");
    handleExecuteSearch(phrase);
  };

  return (
    <AmbientBackground>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.headerArea, { paddingTop: insets.top + spacing.sm }]}>
          {/* Target Selector Segment (القرآن / الحديث) */}
          <AdaptiveGlass borderRadius={radii.full} style={styles.segmentContainer}>
            <View style={styles.segmentRow}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setTarget("quran");
                  setHasSearched(false);
                }}
                style={[
                  styles.segmentItem,
                  target === "quran" && styles.segmentActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    target === "quran" && styles.segmentTextActive,
                  ]}
                >
                  القرآن الكريم
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setTarget("hadith");
                  setHasSearched(false);
                }}
                style={[
                  styles.segmentItem,
                  target === "hadith" && styles.segmentActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    target === "hadith" && styles.segmentTextActive,
                  ]}
                >
                  الحديث الشريف
                </Text>
              </Pressable>
            </View>
          </AdaptiveGlass>

          {/* Submode Switcher (بحث نصي / بالمعنى) */}
          <View style={styles.modeToggleRow}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setSubMode("normal");
              }}
              style={[
                styles.modeButton,
                subMode === "normal" && styles.modeButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  subMode === "normal" && styles.modeButtonTextActive,
                ]}
              >
                بحث نصي مباشر
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setSubMode("meaning");
              }}
              style={[
                styles.modeButton,
                subMode === "meaning" && styles.modeButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  subMode === "meaning" && styles.modeButtonTextActive,
                ]}
              >
                البحث بالمعنى
              </Text>
            </Pressable>
          </View>

          {/* Search Input Bar */}
          <AdaptiveGlass borderRadius={radii.lg} style={styles.inputContainer} highlightBorder>
            <View style={styles.inputRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => handleExecuteSearch()}
                placeholder={
                  subMode === "meaning"
                    ? "اكتب وصفًا، أو موقفًا، أو كلمات تقريبية..."
                    : target === "quran"
                    ? "ابحث عن آية أو جزء منها..."
                    : "ابحث عن حديث نبوي..."
                }
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                style={styles.textInput}
                textAlign="right"
              />

              {query.length > 0 && (
                <Pressable
                  onPress={() => setQuery("")}
                  hitSlop={8}
                  style={styles.clearButton}
                >
                  <Text style={styles.clearText}>✕</Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => handleExecuteSearch()}
                disabled={loading || !query.trim()}
                style={[
                  styles.searchIconButton,
                  (!query.trim() || loading) && styles.searchIconDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.obsidian} />
                ) : Platform.OS === "ios" ? (
                  <SymbolView
                    name="arrow.left"
                    size={16}
                    tintColor={colors.obsidian}
                  />
                ) : (
                  <Text style={styles.searchArrowText}>←</Text>
                )}
              </Pressable>
            </View>
          </AdaptiveGlass>
        </View>

        {/* Results Stream */}
        <FlatList<QuranVerseItem | HadithRecord>
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + spacing.dockHeight + spacing.xl },
          ]}
          data={
            target === "quran"
              ? quranResults
              : (hadithResponse?.results || [])
          }
          keyExtractor={(item, index) =>
            "verse_key" in item
              ? item.verse_key
              : `hadith-${index}`
          }
          ListHeaderComponent={
            <View>
              {quranApproximateMessage ? (
                <View style={styles.approximateNotice}>
                  <Text style={styles.approximateNoticeText}>
                    {quranApproximateMessage}
                  </Text>
                </View>
              ) : null}

              {/* Suggestions / Meaning candidates */}
              {subMode === "meaning" && (suggestCandidates.length > 0 || meaningCandidates.length > 0) && (
                <View style={styles.candidatesSection}>
                  <Text style={styles.candidatesHeading}>
                    {meaningMessage || "عبارات بحث مقترحة:"}
                  </Text>

                  {suggestCandidates.map((phrase, idx) => (
                    <Pressable
                      key={`cand-${idx}`}
                      onPress={() => handlePickCandidate(phrase)}
                      style={styles.candidateCard}
                    >
                      <Text style={styles.candidateText}>{phrase}</Text>
                      <Text style={styles.candidateAction}>البحث بهذا اللفظ ←</Text>
                    </Pressable>
                  ))}

                  {meaningCandidates.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => handlePickCandidate(item.text)}
                      style={styles.candidateCard}
                    >
                      <Text style={styles.candidateText}>{item.text}</Text>
                      <Text style={styles.candidateAction}>البحث بهذا الحديث ←</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {errorMessage ? (
                <View style={styles.errorNotice}>
                  <Text style={styles.errorNoticeText}>{errorMessage}</Text>
                </View>
              ) : null}

              {hasSearched &&
                !loading &&
                !errorMessage &&
                quranResults.length === 0 &&
                (!hadithResponse || hadithResponse.results.length === 0) &&
                suggestCandidates.length === 0 &&
                meaningCandidates.length === 0 && (
                  <View style={styles.emptyNotice}>
                    <Text style={styles.emptyNoticeTitle}>لم نجد نتائج مطابقة</Text>
                    <Text style={styles.emptyNoticeText}>
                      جرّب تقصير عبارة البحث، أو التأكد من سلامة الكلمات، أو استخدام البحث بالمعنى.
                    </Text>
                  </View>
                )}
            </View>
          }
          renderItem={({ item }) => {
            if ("verse_key" in item) {
              return <QuranResultCard verse={item} />;
            } else {
              return (
                <HadithResultCard
                  hadithText={item.text}
                  record={item}
                  mixedCategories={hadithResponse?.mixedCategories}
                  sourceUrl={hadithResponse?.sourceUrl}
                />
              );
            }
          }}
        />
      </KeyboardAvoidingView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerArea: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  segmentContainer: {
    padding: 3,
    backgroundColor: "rgba(7, 26, 20, 0.7)",
    marginBottom: spacing.sm,
  },
  segmentRow: {
    flexDirection: "row-reverse",
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.full,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.emerald,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  segmentTextActive: {
    color: colors.obsidian,
    fontWeight: "700",
  },
  modeToggleRow: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  modeButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  modeButtonActive: {
    backgroundColor: "rgba(52, 211, 153, 0.12)",
  },
  modeButtonText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "500",
  },
  modeButtonTextActive: {
    color: colors.spectralMint,
    fontWeight: "700",
  },
  inputContainer: {
    padding: spacing.xs,
    backgroundColor: colors.cardBackground,
    marginTop: spacing.xs,
  },
  inputRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.ivory,
  },
  clearButton: {
    padding: spacing.xs,
    marginHorizontal: 4,
  },
  clearText: {
    color: colors.muted,
    fontSize: 14,
  },
  searchIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  searchIconDisabled: {
    opacity: 0.4,
  },
  searchArrowText: {
    fontSize: 16,
    color: colors.obsidian,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  approximateNotice: {
    backgroundColor: "rgba(215, 182, 106, 0.15)",
    borderRightWidth: 3,
    borderRightColor: colors.warmGold,
    padding: spacing.sm + 2,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  approximateNoticeText: {
    fontSize: 13,
    color: colors.ivory,
    textAlign: "right",
  },
  candidatesSection: {
    marginBottom: spacing.lg,
  },
  candidatesHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.spectralMint,
    marginBottom: spacing.sm,
    textAlign: "right",
  },
  candidateCard: {
    backgroundColor: "rgba(7, 26, 20, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.2)",
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  candidateText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ivory,
    textAlign: "right",
    marginBottom: 4,
  },
  candidateAction: {
    fontSize: 12,
    color: colors.emerald,
    textAlign: "left",
  },
  errorNotice: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderRightWidth: 3,
    borderRightColor: colors.danger,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  errorNoticeText: {
    fontSize: 13,
    color: "#FCA5A5",
    textAlign: "right",
  },
  emptyNotice: {
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyNoticeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ivory,
    marginBottom: spacing.xs,
  },
  emptyNoticeText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
});
