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
  isSpecialist?: boolean;
  onSwitchToSpecialist?: () => void;
}

export const HadithResultCard: React.FC<HadithResultCardProps> = ({
  hadithText,
  record,
  mixedCategories = false,
  sourceUrl,
  extractedText,
  showContinueAction = false,
  isSpecialist = false,
  onSwitchToSpecialist,
}) => {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showSpecialistDetails, setShowSpecialistDetails] = useState<boolean>(false);

  const isLongText = hadithText.length > 280;
  const effectiveSourceUrl = record?.sourceUrl || sourceUrl;
  const hasSpecialistDetails = Boolean(record?.takhrij || record?.gradeExplanation);

  const handleOpenSource = () => {
    if (effectiveSourceUrl) {
      Linking.openURL(effectiveSourceUrl).catch(() => {});
    }
  };

  const handleContinueSearch = () => {
    const query = extractedText || hadithText.slice(0, 100);
    router.push({
      pathname: "/search",
      params: { q: query, type: "hadith", mode: isSpecialist ? "specialist" : "normal" },
    } as unknown as never);
  };

  return (
    <AdaptiveGlass
      borderRadius={radii.lg}
      style={[
        styles.cardContainer,
        isSpecialist && styles.specialistCardBorder,
      ]}
      highlightBorder
    >
      {/* Header Tag & Pro Badge */}
      <View style={styles.headerRow}>
        <View style={styles.badgeGroup}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>الحديث الشريف</Text>
          </View>
          {isSpecialist && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>وضع المتخصص (Pro)</Text>
            </View>
          )}
        </View>

        {effectiveSourceUrl && (
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

      {/* Category Labels (e.g. أحاديث صحيحة / ضعيفة) */}
      {record?.categoryLabels && record.categoryLabels.length > 0 && (
        <View style={styles.categoryPillsRow}>
          {record.categoryLabels.map((lbl, idx) => {
            const isWeak = lbl.includes("ضعيف") || lbl.includes("باطل") || lbl.includes("موضوع");
            const isSahih = lbl.includes("صحيح") || lbl.includes("حسن");
            return (
              <View
                key={`cat-${idx}`}
                style={[
                  styles.categoryPill,
                  isSahih && styles.categoryPillSahih,
                  isWeak && styles.categoryPillWeak,
                ]}
              >
                <Text
                  style={[
                    styles.categoryPillText,
                    isSahih && styles.categoryPillTextSahih,
                    isWeak && styles.categoryPillTextWeak,
                  ]}
                >
                  {lbl}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Mixed Category Warning Notice if results have mixed classifications */}
      {mixedCategories && !isSpecialist && (
        <View style={styles.mixedNoticeContainer}>
          <Text style={styles.mixedNoticeText}>
            ظهرت في نتائج البحث تصنيفات بالصحة وأخرى بالضعف؛ وقد تختلف ألفاظ الحديث أو أسانيده.
          </Text>
          {onSwitchToSpecialist && (
            <Pressable
              onPress={onSwitchToSpecialist}
              style={styles.switchSpecialistBtn}
              accessibilityRole="button"
            >
              <Text style={styles.switchSpecialistBtnText}>عرض التفاصيل في وضع المتخصص (Pro) ←</Text>
            </Pressable>
          )}
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

          {/* Specialist Expandable Section: Takhrij and Grade Explanation */}
          {hasSpecialistDetails && (
            <View style={styles.specialistSection}>
              <Pressable
                onPress={() => setShowSpecialistDetails((prev) => !prev)}
                style={styles.specialistToggle}
                accessibilityRole="button"
                accessibilityLabel="تبديل عرض تفاصيل التخريج والعلل"
              >
                <Text style={styles.specialistToggleText}>
                  {showSpecialistDetails ? "إخفاء التخريج وشرح العلة ▲" : "عرض التخريج وتفاصيل الحكم ▼"}
                </Text>
              </Pressable>

              {showSpecialistDetails && (
                <View style={styles.specialistDetailsCard}>
                  {record.gradeExplanation ? (
                    <View style={styles.specialistDetailBlock}>
                      <Text style={styles.specialistDetailLabel}>توضيح حكم المحدث / العلة:</Text>
                      <Text style={styles.specialistDetailValue}>{record.gradeExplanation}</Text>
                    </View>
                  ) : null}

                  {record.takhrij ? (
                    <View style={styles.specialistDetailBlock}>
                      <Text style={styles.specialistDetailLabel}>التخريج:</Text>
                      <Text style={styles.specialistDetailValue}>{record.takhrij}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          )}
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
  specialistCardBorder: {
    borderRightColor: colors.emerald,
    borderRightWidth: 4,
  },
  badgeGroup: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
  },
  proBadge: {
    backgroundColor: "rgba(10, 194, 139, 0.18)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(10, 194, 139, 0.4)",
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.emerald,
  },
  categoryPillsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  categoryPill: {
    backgroundColor: "rgba(244, 241, 232, 0.08)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "rgba(244, 241, 232, 0.15)",
  },
  categoryPillSahih: {
    backgroundColor: "rgba(10, 194, 139, 0.15)",
    borderColor: "rgba(10, 194, 139, 0.35)",
  },
  categoryPillWeak: {
    backgroundColor: "rgba(235, 87, 87, 0.15)",
    borderColor: "rgba(235, 87, 87, 0.35)",
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  categoryPillTextSahih: {
    color: colors.emerald,
  },
  categoryPillTextWeak: {
    color: "#ff8080",
  },
  switchSpecialistBtn: {
    marginTop: spacing.xs + 2,
    alignSelf: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    backgroundColor: "rgba(215, 182, 106, 0.2)",
  },
  switchSpecialistBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.warmGold,
  },
  specialistSection: {
    marginTop: spacing.xs + 2,
  },
  specialistToggle: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  specialistToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.spectralMint,
  },
  specialistDetailsCard: {
    marginTop: spacing.xs,
    padding: spacing.sm + 2,
    backgroundColor: "rgba(5, 18, 14, 0.6)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(10, 194, 139, 0.2)",
    gap: spacing.sm,
  },
  specialistDetailBlock: {
    gap: 3,
  },
  specialistDetailLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.warmGold,
    textAlign: "right",
  },
  specialistDetailValue: {
    fontSize: 12,
    lineHeight: 19,
    color: colors.ivory,
    textAlign: "right",
  },
  actionContainer: {
    marginTop: spacing.md,
  },
  continueButton: {
    minHeight: 42,
  },
});

