import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { SymbolView } from "expo-symbols";
import { AmbientBackground } from "../src/components/motion/AmbientBackground";
import { AdaptiveGlass } from "../src/components/glass/AdaptiveGlass";
import { colors } from "../src/theme/colors";
import { radii, spacing } from "../src/theme/spacing";
import { typography } from "../src/theme/typography";
import { shadows } from "../src/theme/shadows";

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    Haptics.selectionAsync();
    router.back();
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <AmbientBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: insets.bottom + spacing.dockHeight + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Bar */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBack}
            accessible
            accessibilityRole="button"
            accessibilityLabel="العودة"
            hitSlop={12}
            style={styles.backButton}
          >
            <AdaptiveGlass borderRadius={radii.full} style={styles.backGlassCircle}>
              {Platform.OS === "ios" ? (
                <SymbolView name="chevron.backward" size={16} tintColor={colors.ivory} />
              ) : (
                <Text style={styles.backFallbackText}>←</Text>
              )}
            </AdaptiveGlass>
          </Pressable>

          <Text style={styles.headerTitle}>حول تبيّن</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Hero Card */}
        <AdaptiveGlass
          borderRadius={radii.xl}
          style={[styles.heroCard, shadows.glassCard]}
          highlightBorder
        >
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroDot} />
            <Text style={styles.heroAppName}>تبيّن</Text>
          </View>
          <Text style={styles.heroTagline}>تحقّق من الآية أو الحديث، من مصدره.</Text>
          <Text style={styles.heroDescription}>
            تطبيق عربي مُصمم للآيفون يهدف إلى تمكين المستخدم من التحقق الفوري والموثّق من النصوص الدينية المتداولة عبر شبكات التواصل، الكتب، أو المقاطع المرئية والصوتية، بالرجوع الحصري إلى الأصول المعتمدة.
          </Text>
        </AdaptiveGlass>

        {/* Section 1: Strict AI Boundary */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>الحدود الصارمة للذكاء الاصطناعي</Text>
        </View>

        <AdaptiveGlass
          borderRadius={radii.lg}
          style={styles.ruleCard}
          highlightBorder
        >
          <Text style={styles.ruleNotice}>
            الذكاء الاصطناعي وسيلة استخراج واسترجاع فقط، ولا يملك أي سلطة شرعية أو توثيقية:
          </Text>

          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletIcon}>⛔</Text>
              <Text style={styles.bulletText}>
                <Text style={styles.bulletBold}>لا يحكم على الأحاديث:</Text> لا يصنف الذكاء الاصطناعي أي حديث بالصحة أو الضعف، ولا يرجّح قول محدث على آخر.
              </Text>
            </View>

            <View style={styles.bulletItem}>
              <Text style={styles.bulletIcon}>⛔</Text>
              <Text style={styles.bulletText}>
                <Text style={styles.bulletBold}>لا يولّد النصوص المقدسة:</Text> كل نص قرآني أو حديث معروض مأخوذ حرفيًا من المصدر المعتمد، ولا يُسمح للنموذج بإعادة كتابته أو تعديله.
              </Text>
            </View>

            <View style={styles.bulletItem}>
              <Text style={styles.bulletIcon}>✅</Text>
              <Text style={styles.bulletText}>
                <Text style={styles.bulletBold}>دوره المحصور:</Text> استخراج الكلمات من الصور، وتفريغ الصوت من مقاطع الفيديو، واقتراح عبارات بحثية لمساعدة المستخدم في الوصول إلى المصدر.
              </Text>
            </View>
          </View>
        </AdaptiveGlass>

        {/* Section 2: Authoritative Sources */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>المصادر المعتمدة</Text>
        </View>

        <Pressable
          onPress={() => handleOpenLink("https://tanzil.net")}
          accessible
          accessibilityRole="link"
          accessibilityLabel="موقع مشروع تنزيل للقرآن الكريم"
          style={styles.sourcePressable}
        >
          <AdaptiveGlass
            borderRadius={radii.lg}
            style={styles.sourceCard}
            highlightBorder
          >
            <View style={styles.sourceTopRow}>
              <View style={styles.sourceBadgeQuran}>
                <Text style={styles.sourceBadgeQuranText}>القرآن الكريم</Text>
              </View>
              <Text style={styles.sourceLinkHint}>tanzil.net ↗</Text>
            </View>
            <Text style={styles.sourceName}>مشروع تنزيل (Tanzil Project)</Text>
            <Text style={styles.sourceDetails}>
              قاعدة بيانات محلية موثوقة للقرآن الكريم بالرسم العثماني. البحث يتم محليًا بالكامل لضمان الدقة والتطابق التام مع المصحف الشريف.
            </Text>
          </AdaptiveGlass>
        </Pressable>

        <Pressable
          onPress={() => handleOpenLink("https://dorar.net")}
          accessible
          accessibilityRole="link"
          accessibilityLabel="موقع الدرر السنية للحديث الشريف"
          style={styles.sourcePressable}
        >
          <AdaptiveGlass
            borderRadius={radii.lg}
            style={styles.sourceCard}
            highlightBorder
          >
            <View style={styles.sourceTopRow}>
              <View style={styles.sourceBadgeHadith}>
                <Text style={styles.sourceBadgeHadithText}>الحديث الشريف</Text>
              </View>
              <Text style={styles.sourceLinkHint}>dorar.net ↗</Text>
            </View>
            <Text style={styles.sourceName}>موسوعة الدرر السنية</Text>
            <Text style={styles.sourceDetails}>
              الموسوعة الحديثية الكبرى. تُعرض الأحاديث وأحكام كبار المحدثين وأسانيدها مباشرة من الموقع الرسمي مع حفظ أمانة النقل والاختلافات العلمية.
            </Text>
          </AdaptiveGlass>
        </Pressable>

        {/* Section 3: Scholarly Differences */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>منهجية اختلاف أحكام العلماء</Text>
        </View>

        <AdaptiveGlass
          borderRadius={radii.lg}
          style={styles.methodologyCard}
          highlightBorder
        >
          <Text style={styles.methodologyText}>
            قد تجد في نتائج البحث الحديث نفسه مروياً بعدة أسانيد أو ألفاظ، وقد يختلف حكم عالم عن آخر بالصحة أو الضعف تبعًا للطريق والرواة.
            يلتزم التطبيق بعرض هذه الاختلافات بحيادية علمية كما وردت في الموسوعة، ويُنبّه المستخدم عند وجود تباين في النتائج للاطلاع على التفاصيل في الوضع المتخصص.
          </Text>
        </AdaptiveGlass>

        {/* Footer info */}
        <View style={styles.footerSection}>
          <Text style={styles.footerText}>
            تبيّن — نسخة تجريبية أولى (iOS)
          </Text>
          <Text style={styles.footerSubText}>
            تم التصميم والتطوير وفق أعلى معايير الخصوصية والأمانة العلمية.
          </Text>
        </View>
      </ScrollView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
  },
  backGlassCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 26, 20, 0.5)",
  },
  backFallbackText: {
    color: colors.ivory,
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ivory,
  },
  headerSpacer: {
    width: 36,
  },
  heroCard: {
    padding: spacing.lg,
    backgroundColor: colors.cardBackground,
    marginBottom: spacing.lg,
  },
  heroBadgeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.xs,
  },
  heroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emerald,
  },
  heroAppName: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.ivory,
  },
  heroTagline: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.spectralMint,
    marginBottom: spacing.md,
    textAlign: "right",
  },
  heroDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 22,
    textAlign: "right",
  },
  sectionHeader: {
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ivory,
    textAlign: "right",
  },
  ruleCard: {
    padding: spacing.md + 4,
    backgroundColor: colors.cardBackground,
    borderRightWidth: 4,
    borderRightColor: colors.emerald,
  },
  ruleNotice: {
    fontSize: 13,
    color: colors.ivory,
    lineHeight: 20,
    marginBottom: spacing.md,
    textAlign: "right",
  },
  bulletList: {
    gap: spacing.md,
  },
  bulletItem: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bulletIcon: {
    fontSize: 15,
    marginTop: 2,
  },
  bulletText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    flex: 1,
    textAlign: "right",
  },
  bulletBold: {
    color: colors.ivory,
    fontWeight: "700",
  },
  sourcePressable: {
    marginBottom: spacing.md,
  },
  sourceCard: {
    padding: spacing.md + 4,
    backgroundColor: colors.cardBackground,
  },
  sourceTopRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  sourceBadgeQuran: {
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
  },
  sourceBadgeQuranText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.emerald,
  },
  sourceBadgeHadith: {
    backgroundColor: "rgba(215, 182, 106, 0.15)",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
  },
  sourceBadgeHadithText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.warmGold,
  },
  sourceLinkHint: {
    fontSize: 12,
    color: colors.spectralMint,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ivory,
    marginBottom: spacing.xs,
    textAlign: "right",
  },
  sourceDetails: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    textAlign: "right",
  },
  methodologyCard: {
    padding: spacing.md + 4,
    backgroundColor: colors.cardBackground,
    borderRightWidth: 4,
    borderRightColor: colors.warmGold,
  },
  methodologyText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 22,
    textAlign: "right",
  },
  footerSection: {
    marginTop: spacing.xl,
    alignItems: "center",
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(244, 241, 232, 0.06)",
  },
  footerText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ivory,
    marginBottom: 4,
  },
  footerSubText: {
    fontSize: 11,
    color: colors.muted,
    textAlign: "center",
  },
});

