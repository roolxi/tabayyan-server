import React from "react";
import {
  FlatList,
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
import { AmbientBackground } from "../src/components/motion/AmbientBackground";
import { AdaptiveGlass } from "../src/components/glass/AdaptiveGlass";
import { GlassButton } from "../src/components/glass/GlassButton";
import { QuranResultCard } from "../src/components/results/QuranResultCard";
import { HadithResultCard } from "../src/components/results/HadithResultCard";
import { SourceDisclaimer } from "../src/components/results/SourceDisclaimer";
import { useScanContext } from "../src/context/ScanContext";
import { useTabNavigation } from "../src/hooks/useTabNavigation";
import {
  MediaHadithResult,
  MediaQuranResult,
  MediaResultItem,
  QuranVerseItem,
} from "../src/api/types";
import { colors } from "../src/theme/colors";
import { radii, spacing } from "../src/theme/spacing";
import { typography } from "../src/theme/typography";
import { shadows } from "../src/theme/shadows";

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanResult, clearScanResult } = useScanContext();
  const { navigateToTab } = useTabNavigation();

  const handleScanNewMedia = () => {
    Haptics.selectionAsync();
    clearScanResult();
    navigateToTab("/scan", { force: true });
  };

  const handleManualSearch = () => {
    Haptics.selectionAsync();
    navigateToTab("/search");
  };

  const handleGoHome = () => {
    Haptics.selectionAsync();
    navigateToTab("/");
  };

  const renderCandidateItem = ({ item }: { item: MediaResultItem }) => {
    if (item.type === "quran") {
      const quranItem = item as MediaQuranResult;
      const verse: QuranVerseItem = {
        verse_key: quranItem.source?.verseKey || "",
        surah: 0,
        ayah: quranItem.source?.ayah || 0,
        surah_name: quranItem.source?.surahName || "",
        text_uthmani: quranItem.displayText || "",
      };

      return (
        <QuranResultCard
          verse={verse}
          extractedText={quranItem.extractedText || ""}
          sourceName={quranItem.source?.name || "المصحف الشريف (Tanzil)"}
          showContinueAction
        />
      );
    }

    if (item.type === "hadith") {
      const hadithItem = item as MediaHadithResult;
      const record = hadithItem.records && hadithItem.records.length > 0 ? hadithItem.records[0] : undefined;

      return (
        <HadithResultCard
          hadithText={hadithItem.displayText || ""}
          record={record}
          mixedCategories={hadithItem.mixedCategories || false}
          sourceUrl={hadithItem.source?.url}
          extractedText={hadithItem.extractedText || ""}
          showContinueAction
        />
      );
    }

    return null;
  };

  const results = scanResult?.results || [];

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
        {/* Top Header */}
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

          <Text style={styles.screenHeaderTitle}>نتيجة الفحص</Text>

          <View style={styles.headerSpacer} />
        </View>

        {results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={(_, index) => `scan-result-${index}`}
            renderItem={renderCandidateItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                {/* Authoritative Question Header */}
                <Text style={styles.intentQuestion}>هل تقصد هذا النص؟</Text>
                <Text style={styles.intentSub}>
                  تمت مطابقة النص المستخرج مع المصادر المعتمدة مباشرة؛ اختر الآية أو الحديث للتحقق الكامل.
                </Text>
              </View>
            }
            ListFooterComponent={
              <View style={styles.listFooter}>
                {/* Strict Source & AI Boundary Disclaimer */}
                <SourceDisclaimer />

                {/* Next Steps Buttons */}
                <View style={styles.bottomActions}>
                  <GlassButton
                    label="فحص وسيط جديد"
                    variant="primary"
                    onPress={handleScanNewMedia}
                    style={styles.fullButton}
                  />
                  <GlassButton
                    label="البحث النصي المباشر"
                    variant="secondary"
                    onPress={handleManualSearch}
                    style={styles.fullButton}
                  />
                </View>
              </View>
            }
          />
        ) : (
          <View style={styles.emptyContainer}>
            <AdaptiveGlass
              borderRadius={radii.xl}
              style={[styles.emptyCard, shadows.glassCard]}
              highlightBorder
            >
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>لا توجد نتائج فحص حالية</Text>
              <Text style={styles.emptyMessage}>
                يمكنك التقاط صورة، أو اختيار صورة أو فيديو من المعرض لبدء الفحص والمطابقة.
              </Text>
              <GlassButton
                label="بدء فحص وسائط"
                variant="primary"
                onPress={handleScanNewMedia}
                style={styles.emptyButton}
              />
            </AdaptiveGlass>
          </View>
        )}
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
  listContent: {
    paddingBottom: spacing.xl,
  },
  listHeader: {
    marginBottom: spacing.lg,
  },
  intentQuestion: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.ivory,
    lineHeight: 30,
    textAlign: "right",
    marginBottom: spacing.xs,
  },
  intentSub: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    textAlign: "right",
  },
  listFooter: {
    marginTop: spacing.md,
  },
  bottomActions: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  fullButton: {
    width: "100%",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  emptyCard: {
    padding: spacing.xl,
    backgroundColor: colors.cardBackground,
    alignItems: "center",
    width: "100%",
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ivory,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  emptyButton: {
    width: "100%",
  },
});

