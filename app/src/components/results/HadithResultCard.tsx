import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { AdaptiveGlass } from "../glass/AdaptiveGlass";
import { GlassButton } from "../glass/GlassButton";
import { colors } from "../../theme/colors";
import { radii, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { HadithRecord } from "../../api/types";

export interface HadithResultCardProps {
  hadithText: string;
  record?: HadithRecord;
  mixedCategories?: boolean;
  sourceUrl?: string | null;
  extractedText?: string;
  showContinueAction?: boolean;
}

export const HadithResultCard: React.FC<HadithResultCardProps> = ({
  hadithText,
  record,
  mixedCategories = false,
  sourceUrl,
  extractedText,
  showContinueAction = false,
}) => {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const isLongText = hadithText.length > 280;

  const handleOpenSource = () => {
    if (sourceUrl) {
      Linking.openURL(sourceUrl).catch(() => {});
    }
  };

  const handleContinueSearch = () => {
    const query = extractedText || hadithText.slice(0, 100);
    router.push({
      pathname: "/search",
      params: { q: query, type: "hadith" },
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
          <Text style={styles.badgeText}>الحديث الشريف</Text>
        </View>

        {sourceUrl && (
          <Pressable
            onPress={handleOpenSource}
            accessible
            accessibilityRole="link"
            accessibilityLabel="فتح الحديث في موقع الدرر السنية"
            hitSlop={8}
          >
            <Text style={styles.sourceLinkText}>المصدر: الدرر السنية ↗</Text>
          </Pressable>
        )}
      </View>

      {/* Mixed Category Warning Notice if results have mixed classifications */}
      {mixedCategories && (
        <View style={styles.mixedNoticeContainer}>
          <Text style={styles.mixedNoticeText}>
            ظهرت في نتائج البحث تصنيفات بالصحة وأخرى بالضعف؛ وقد تختلف ألفاظ الحديث أو أسانيده. يرجى الاطلاع على التفاصيل في الوضع المتخصص.
          </Text>
        </View>
      )}

      {/* Hadith Text */}
      <Text
        style={[
          typography.hadithText,
          styles.hadithText,
          isLongText && !isExpanded && styles.collapsedText,
        ]}
        numberOfLines={isLongText && !isExpanded ? 5 : undefined}
        selectable
      >
        {hadithText}
      </Text>

      {isLongText && (
        <Pressable
          onPress={() => setIsExpanded((prev) => !prev)}
          accessible
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? "إخفاء التفاصيل" : "عرض النص كاملًا"}
          style={styles.toggleTextButton}
        >
          <Text style={styles.toggleButtonText}>
            {isExpanded ? "إخفاء التفاصيل" : "عرض النص كاملًا"}
          </Text>
        </Pressable>
      )}

      {/* Scholar & Chain Details from Dorar */}
      {record && (
        <View style={styles.fieldsContainer}>
          {record.narrator ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>الراوي:</Text>
              <Text style={styles.fieldValue}>{record.narrator}</Text>
            </View>
          ) : null}

          {record.scholar ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>المحدث:</Text>
              <Text style={styles.fieldValue}>{record.scholar}</Text>
            </View>
          ) : null}

          {record.grade ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>حكم المحدث:</Text>
              <Text style={[styles.fieldValue, styles.gradeText]}>{record.grade}</Text>
            </View>
          ) : null}

          {record.book ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>المصدر:</Text>
              <Text style={styles.fieldValue}>
                {record.book} {record.reference ? `(${record.reference})` : ""}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {showContinueAction && (
        <View style={styles.actionContainer}>
          <GlassButton
            label="متابعة البحث في الحديث الشريف"
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
    borderRightColor: colors.warmGold,
  },
  headerRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  badge: {
    backgroundColor: "rgba(215, 182, 106, 0.15)",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(215, 182, 106, 0.3)",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.warmGold,
  },
  sourceLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.spectralMint,
  },
  mixedNoticeContainer: {
    backgroundColor: "rgba(215, 182, 106, 0.12)",
    borderRightWidth: 3,
    borderRightColor: colors.warmGold,
    padding: spacing.sm + 2,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  mixedNoticeText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.ivory,
    textAlign: "right",
  },
  hadithText: {
    color: colors.ivory,
    marginVertical: spacing.xs,
  },
  collapsedText: {
    maxHeight: 160,
  },
  toggleTextButton: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.spectralMint,
  },
  fieldsContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: "rgba(244, 241, 232, 0.08)",
    gap: spacing.xs + 2,
  },
  fieldRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: spacing.xs + 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.spectralMint,
  },
  fieldValue: {
    fontSize: 13,
    color: colors.ivory,
    flex: 1,
    textAlign: "right",
  },
  gradeText: {
    color: colors.warmGold,
    fontWeight: "700",
  },
  actionContainer: {
    marginTop: spacing.md,
  },
  continueButton: {
    minHeight: 42,
  },
});

