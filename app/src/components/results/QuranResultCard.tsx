import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AdaptiveGlass } from "../glass/AdaptiveGlass";
import { GlassButton } from "../glass/GlassButton";
import { colors } from "../../theme/colors";
import { radii, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { QuranVerseItem } from "../../api/types";

export interface QuranResultCardProps {
  verse: QuranVerseItem;
  extractedText?: string;
  sourceName?: string;
  showContinueAction?: boolean;
}

export const QuranResultCard: React.FC<QuranResultCardProps> = ({
  verse,
  extractedText,
  sourceName = "Tanzil Project",
  showContinueAction = false,
}) => {
  const router = useRouter();

  const handleContinueSearch = () => {
    const query = extractedText || verse.text_uthmani;
    router.push({
      pathname: "/search",
      params: { q: query, type: "quran" },
    } as unknown as never);
  };

  return (
    <AdaptiveGlass
      borderRadius={radii.lg}
      style={styles.cardContainer}
      highlightBorder
    >
      {/* Header Tag */}
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>القرآن الكريم</Text>
        </View>
        <Text style={styles.verseKey}>{verse.verse_key}</Text>
      </View>

      {/* Canonical Quran Uthmani Text */}
      <Text
        style={[typography.quranText, styles.quranText]}
        selectable
      >
        {verse.text_uthmani}
      </Text>

      {/* Verse Meta */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {verse.surah_name}، الآية {verse.ayah}
        </Text>
        <Text style={styles.sourceText}>المصدر: {sourceName}</Text>
      </View>

      {showContinueAction && (
        <View style={styles.actionContainer}>
          <GlassButton
            label="متابعة البحث في القرآن الكريم"
            variant="primary"
            onPress={handleContinueSearch}
            style={styles.continueButton}
          />
        </View>
      )}
    </AdaptiveGlass>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    padding: spacing.md + 4,
    marginBottom: spacing.md,
    backgroundColor: colors.cardBackground,
    borderRightWidth: 4,
    borderRightColor: colors.emerald,
  },
  headerRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  badge: {
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.3)",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.emerald,
  },
  verseKey: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  quranText: {
    color: colors.ivory,
    marginVertical: spacing.sm,
  },
  metaRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(244, 241, 232, 0.08)",
  },
  metaText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.spectralMint,
  },
  sourceText: {
    fontSize: 12,
    color: colors.muted,
  },
  actionContainer: {
    marginTop: spacing.md,
  },
  continueButton: {
    minHeight: 42,
  },
});

