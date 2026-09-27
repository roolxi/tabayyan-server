import React, { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop } from "../src/components/experience/Backdrop";
import { Glass } from "../src/components/experience/Glass";
import { GlassAction } from "../src/components/experience/GlassAction";
import { AnimatedContent } from "../src/components/experience/AnimatedContent";
import { SwipeToast } from "../src/components/experience/SwipeToast";
import { palette } from "../src/components/experience/theme";
export default function About() {
  const router = useRouter(),
    insets = useSafeAreaInsets(),
    [error, setError] = useState("");
  const open = (url: string) =>
    void Linking.openURL(url).catch(() =>
      setError("تعذّر فتح الرابط. حاول مرة أخرى."),
    );
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 30,
          maxWidth: 640,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <View style={s.header}>
          <Text style={s.title}>عن تبيّن</Text>
          <GlassAction
            label="إغلاق"
            icon="close"
            iconOnly
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/")
            }
          />
        </View>
        <AnimatedContent>
          <Text style={s.lead}>كن على بيّنة.</Text>
          <Text style={s.body}>
            نساعدك على الوصول إلى أصل الآية أو الحديث من نص، صورة، أو مقطع.
          </Text>
        </AnimatedContent>
        <AnimatedContent delay={70}>
          <Glass style={s.card}>
            <Text style={s.subtitle}>كيف يعمل؟</Text>
            {[
              [
                "01",
                "اكتب أو أرفق",
                "نستخرج عبارة البحث من المحتوى الذي تختاره.",
              ],
              [
                "02",
                "نبحث في المصادر",
                "نطابق العبارة مع مصدر القرآن أو الموسوعة الحديثية.",
              ],
              [
                "03",
                "اقرأ الأصل",
                "النص والحكم والتخريج مع رابط المصدر للاطلاع.",
              ],
            ].map(([n, title, body]) => (
              <View key={n} style={s.step}>
                <Text style={s.number}>{n}</Text>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={s.subtitle}>{title}</Text>
                  <Text style={s.body}>{body}</Text>
                </View>
              </View>
            ))}
          </Glass>
        </AnimatedContent>
        <AnimatedContent delay={120}>
          <Glass style={s.card}>
            <Text style={s.subtitle}>المصادر</Text>
            <Text style={s.body}>
              القرآن الكريم من قاعدة القرآن المعتمدة في الخادم. والأحاديث وأحكام
              المحدّثين من الدرر السنية.
            </Text>
            <GlassAction
              label="الدرر السنية"
              icon="source"
              onPress={() => open("https://dorar.net")}
            />
            <GlassAction
              label="مشروع تنزيل للقرآن الكريم"
              icon="source"
              onPress={() => open("https://tanzil.net")}
            />
          </Glass>
        </AnimatedContent>
        <AnimatedContent delay={160}>
          <Glass style={s.card}>
            <Text style={s.subtitle}>الكلمة لأهل الاختصاص</Text>
            <Text style={s.body}>
              يساعد الذكاء الاصطناعي في استخراج النص واقتراح عبارات البحث.
              الأحكام والنصوص المعروضة تأتي من المصادر، ولا تُنشأ لتعبئة نتيجة
              فارغة.
            </Text>
            <Text style={s.body}>
              قد تختلف أحكام الروايات باختلاف الألفاظ والأسانيد؛ تتيح التفاصيل
              مراجعة ما نقله كل مصدر.
            </Text>
          </Glass>
        </AnimatedContent>
        {!!error && <SwipeToast message={error} onClose={() => setError("")} />}
        <Text style={[s.body, { textAlign: "center", marginTop: 16 }]}>
          تبيّن · من النص إلى المصدر
        </Text>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
  },
  title: { fontSize: 20, color: palette.text, fontWeight: "600" },
  lead: {
    fontSize: 28,
    lineHeight: 44,
    color: palette.mint,
    textAlign: "right",
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 25,
    color: palette.muted,
    textAlign: "right",
  },
  subtitle: {
    fontSize: 16,
    color: palette.text,
    textAlign: "right",
    fontWeight: "600",
  },
  card: { padding: 22, gap: 16, marginTop: 20 },
  step: { flexDirection: "row-reverse", gap: 16, marginTop: 8 },
  number: {
    fontSize: 12,
    color: palette.dim,
    fontVariant: ["tabular-nums"],
    marginTop: 4,
  },
});
