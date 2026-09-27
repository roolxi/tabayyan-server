import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { SourceEntry } from "../../features/verification/model";
import { Glass } from "./Glass";
import { GlassAction } from "./GlassAction";
import { AnimatedContent } from "./AnimatedContent";
import { Icon } from "./Icon";
import { flow, palette } from "./theme";
export function SourceCard({
  item,
  onConfirm,
  onError,
  onReviewSpecialist,
}: {
  item: SourceEntry;
  onConfirm: (item: SourceEntry) => void;
  onError: (message: string) => void;
  onReviewSpecialist?: (item: SourceEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const grades = [...new Set(item.records.map((r) => r.grade).filter(Boolean))];
  const open = async () => {
    try {
      if (!item.sourceUrl) return;
      const url = new URL(item.sourceUrl);
      if (!["https:", "http:"].includes(url.protocol)) throw Error();
      await Linking.openURL(url.toString());
    } catch {
      onError("تعذّر فتح المصدر. حاول مرة أخرى.");
    }
  };
  return (
    <Animated.View layout={flow}>
      <Glass strong radius={28} style={styles.card}>
        <View style={styles.header}>
          <View style={styles.kind}>
            <Icon name="book" size={15} color={palette.mint} />
            <Text style={styles.kindText}>
              {item.kind === "quran" ? "القرآن الكريم" : "الحديث الشريف"}
            </Text>
            {item.kind === "hadith" && item.mode === "specialist" && (
              <View style={styles.specialistBadge}>
                <Text style={styles.specialistBadgeText}>وضع المتخصص</Text>
              </View>
            )}
          </View>
          <Text style={styles.verse}>{item.verse || "النص من المصدر"}</Text>
        </View>
        <Text
          selectable
          style={[
            styles.text,
            item.kind === "quran" && { fontSize: 23, lineHeight: 45 },
          ]}
        >
          {item.text}
        </Text>
        {grades.length > 0 && (
          <View style={styles.grade}>
            <View style={styles.gradeLabel}>
              <View style={styles.smallDot} />
              <Text style={styles.muted}>حكم المصدر</Text>
            </View>
            {grades.map((grade) => (
              <Text key={grade} selectable style={styles.gradeText}>
                {grade}
              </Text>
            ))}
            {item.records[0]?.scholar && (
              <Text style={styles.scholar}>{item.records[0].scholar}</Text>
            )}
          </View>
        )}
        {item.mixed && (
          <View style={styles.disputeNotice}>
            <View style={styles.disputeHeader}>
              <Icon name="info" size={14} color={palette.gold} />
              <Text style={styles.disputeTitle}>وردت أحكام مختلفة</Text>
            </View>
            <Text style={styles.disputeBody}>
              قد يختلف الحكم باختلاف اللفظ أو الإسناد. ننصح بمراجعة الروايات والتخريج في وضع المتخصص.
            </Text>
            {item.mode !== "specialist" && Boolean(onReviewSpecialist) && (
              <GlassAction
                label="مراجعة في وضع المتخصص"
                icon="book"
                onPress={() => onReviewSpecialist?.(item)}
                style={styles.reviewButton}
              />
            )}
          </View>
        )}
        <View style={styles.footer}>
          <Text style={styles.source}>{item.source}</Text>
          {item.sourceUrl && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="فتح المصدر الأصلي"
              onPress={open}
              style={styles.sourceLink}
            >
              <Text style={styles.link}>المصدر</Text>
              <Icon name="source" size={14} color={palette.mint} />
            </Pressable>
          )}
        </View>
        {item.records.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            style={styles.expand}
          >
            <Text style={styles.link}>
              {expanded ? "إخفاء التفاصيل" : "الراوي والتخريج"}
            </Text>
            <Icon
              name={expanded ? "close" : "plus"}
              size={16}
              color={palette.muted}
            />
          </Pressable>
        )}
        {expanded && (
          <AnimatedContent>
            <View style={styles.details}>
              {item.records.map((r, i) => (
                <View key={i} style={styles.record}>
                  {item.records.length > 1 && (
                    <Text style={styles.kindText}>الرواية {i + 1}</Text>
                  )}
                  {[
                    ["الراوي", r.narrator],
                    ["المحدّث", r.scholar],
                    ["الحكم", r.grade],
                    ["الكتاب", r.book],
                    ["الصفحة أو الرقم", r.reference],
                    ["التخريج", r.takhrij],
                    ["توضيح الحكم", r.gradeExplanation],
                  ].map(([label, value]) =>
                    value ? (
                      <View key={label} style={{ gap: 4 }}>
                        <Text style={styles.muted}>{label}</Text>
                        <Text selectable style={styles.detailValue}>
                          {value}
                        </Text>
                      </View>
                    ) : null,
                  )}
                </View>
              ))}
            </View>
          </AnimatedContent>
        )}
        {item.candidate && (
          <GlassAction
            label="هذا النص، تحقّق منه"
            icon="check"
            onPress={() => onConfirm(item)}
            style={{ marginTop: 14 }}
          />
        )}
      </Glass>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 22, marginBottom: 14 },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  kind: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  kindText: {
    color: palette.mint,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },
  verse: { color: palette.dim, fontSize: 10 },
  text: {
    color: palette.text,
    fontSize: 21,
    lineHeight: 38,
    textAlign: "right",
    writingDirection: "rtl",
    marginVertical: 24,
  },
  grade: {
    borderTopWidth: 1,
    borderColor: palette.edge,
    paddingTop: 17,
    gap: 7,
  },
  gradeLabel: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  smallDot: {
    height: 4,
    width: 4,
    borderRadius: 2,
    backgroundColor: palette.mint,
  },
  muted: { fontSize: 11, color: palette.muted, textAlign: "right" },
  gradeText: {
    color: palette.text,
    fontSize: 20,
    lineHeight: 31,
    textAlign: "right",
    fontWeight: "600",
  },
  scholar: { fontSize: 12, color: palette.muted, textAlign: "right" },
  specialistBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "rgba(10, 194, 139, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(192, 255, 220, 0.25)",
  },
  specialistBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: palette.mint,
  },
  disputeNotice: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(234, 179, 8, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.2)",
    gap: 8,
  },
  disputeHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  disputeTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.gold,
    textAlign: "right",
  },
  disputeBody: {
    fontSize: 12,
    lineHeight: 21,
    color: palette.muted,
    textAlign: "right",
  },
  reviewButton: {
    marginTop: 4,
    alignSelf: "flex-start",
  },
  notice: {
    color: palette.gold,
    fontSize: 12,
    lineHeight: 22,
    textAlign: "right",
    marginTop: 12,
  },
  footer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  source: {
    flex: 1,
    fontSize: 12,
    color: palette.muted,
    textAlign: "right",
    lineHeight: 21,
  },
  sourceLink: {
    flexDirection: "row-reverse",
    gap: 8,
    alignItems: "center",
    minHeight: 44,
  },
  link: { color: palette.mint, fontSize: 12 },
  expand: {
    borderTopWidth: 1,
    borderColor: palette.edge,
    minHeight: 48,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  details: { gap: 16, paddingTop: 10 },
  record: {
    gap: 14,
    borderTopWidth: 1,
    borderColor: palette.edge,
    paddingTop: 14,
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 25,
    color: palette.text,
    textAlign: "right",
  },
});
