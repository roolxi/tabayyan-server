import React, { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassAction } from '../src/components/experience/GlassAction';
import { Glass } from '../src/components/experience/Glass';
import { palette } from '../src/components/experience/theme';
import { shortcutInstallURL } from '../src/sharing/shortcut';

export default function ShortcutSetup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ error?: string }>();
  const [error, setError] = useState(
    params.error
      ? 'المشاركة لا تحتوي رابط مقطع مدعومًا. تأكد من مشاركة رابط عام من إنستغرام أو تيك توك أو يوتيوب.'
      : ''
  );

  // Defaults to the official iCloud shortcut link in source, overridable via EXPO_PUBLIC_SHORTCUT_INSTALL_URL
  const installURL = shortcutInstallURL();

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setError('تعذّر فتح الرابط. تأكد أن تطبيق «الاختصارات» مثبت على الآيفون.');
    }
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      <GlassAction
        label="رجوع"
        icon="close"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ alignSelf: 'flex-start' }}
      />

      <Text style={s.title}>تبيّن من قائمة المشاركة</Text>
      <Text style={s.body}>
        تحقّق من مقاطع إنستغرام وتيك توك ويوتيوب مباشرة من قائمة المشاركة في iOS بنفس المصادر والنتائج.
      </Text>

      {/* Main Ready-to-Install Shortcut Card */}
      <Glass radius={24} style={s.card}>
        <Text style={s.heading}>إضافة الاختصار إلى الآيفون</Text>
        <Text style={s.body}>
          ١. اضغط الزر أدناه لإضافة الاختصار الجاهز «تحقّق عبر تبيّن» إلى جهازك مرة واحدة.
        </Text>
        <Text style={s.body}>
          ٢. من أي مقطع في إنستغرام، تيك توك، أو يوتيوب؛ افتح قائمة المشاركة في iOS واختر «تحقّق عبر تبيّن» ليبدأ التحقق فوراً.
        </Text>
        <Text style={s.hint}>
          قد يطلب تطبيق «الاختصارات» (Apple Shortcuts) تأكيد إضافة الاختصار (Add Shortcut)، كما قد يطلب نظام iOS الإذن لفتح تطبيق «تبيّن» في المرة الأولى.
        </Text>

        <GlassAction
          primary
          label="إضافة اختصار تبيّن"
          icon="link"
          disabled={Platform.OS !== 'ios'}
          onPress={() => void open(installURL)}
        />
      </Glass>

      <Text style={s.hint}>
        إذا لم يظهر الاختصار، افتح تطبيق «الاختصارات» وتأكد من إضافته، ثم افتح قائمة مشاركة المقطع مرة أخرى.
      </Text>

      {!!error && (
        <Text accessibilityRole="alert" style={[s.body, { color: palette.danger }]}>
          {error}
        </Text>
      )}

      <Text style={s.hint}>
        تأكد من استخدام قائمة مشاركة نظام iOS وليس قائمة الرسائل الخاصة داخل التطبيق. يتطلب التحقق اتصالاً نشطاً بخادم تبيّن.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: 22, gap: 18 },
  title: { color: palette.text, fontSize: 25, fontWeight: '700', textAlign: 'right', marginTop: 14 },
  heading: { color: palette.mint, fontSize: 16, fontWeight: '600', textAlign: 'right' },
  body: { color: palette.muted, fontSize: 14, textAlign: 'right', lineHeight: 25 },
  hint: { color: palette.dim, fontSize: 12, textAlign: 'right', lineHeight: 22 },
  card: { padding: 20, gap: 14 },
});
