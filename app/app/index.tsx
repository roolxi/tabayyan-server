import React, { useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight, useSharedValue, useAnimatedStyle, withTiming, runOnJS, ReduceMotion, Easing } from 'react-native-reanimated';
import StudioScreen from '../src/features/verification/StudioScreen';
import { Backdrop } from '../src/components/experience/Backdrop';
import { GlassAction } from '../src/components/experience/GlassAction';
import { Glass } from '../src/components/experience/Glass';
import { TabayyanLogo } from '../src/components/brand/TabayyanLogo';
import { palette } from '../src/components/experience/theme';
import { shortcutInstallURL } from '../src/sharing/shortcut';

let enteredStudio = false;
const pages = [
  { label: 'كيف تستخدم تبيّن', title: 'ابدأ بما لديك.', body: 'اكتب آية أو حديثًا، أرفق صورة أو مقطعًا، أو ألصق رابطًا. تبيّن يساعدك على الوصول إلى النص ومصدره.' },
  { label: 'اختصار المشاركة', title: 'من المقطع، إلى المصدر.', body: 'أضف «تحقّق عبر تبيّن» مرة واحدة. بعدها شارك المقطع من إنستغرام أو تيك توك أو يوتيوب، واختر الاختصار لبدء التحقّق.' },
  { label: 'أهلًا بك في تبيّن', title: 'كن على بيّنة.', body: 'خذ لحظة للتبيّن. ابحث، واقرأ النتيجة، وارجع إلى المصدر.' },
];

export default function Home() {
  const params = useLocalSearchParams();
  const scroll = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const [entered, setEntered] = useState(enteredStudio);
  const [page, setPage] = useState(0);
  const [backward, setBackward] = useState(false);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const incoming = ['url', 'q', 'uri', 'mode', 'id'].some(key => !!params[key]);
  const progress = useSharedValue(0);
  const welcomeStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value, transform: [{ translateX: -28 * progress.value }] }));
  const studioStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateX: 28 * (1 - progress.value) }] }));
  const finish = () => { enteredStudio = true; setEntered(true); setTransitioning(false); };
  const animateEntry = () => {
    if (!transitioning) return;
    progress.value = withTiming(1, { duration: 460, easing: Easing.bezier(0.22, 1, 0.36, 1), reduceMotion: ReduceMotion.System }, done => {
      if (done) runOnJS(finish)();
    });
  };
  const changePage = (next: number) => { scroll.current?.scrollTo({ y: 0, animated: false }); setBackward(next < page); setError(''); setPage(Math.max(0, Math.min(2, next))); };
  const install = async () => {
    setError('');
    try { await Linking.openURL(shortcutInstallURL()); }
    catch { setError('تعذّر فتح الاختصار. حاول مرة أخرى وتأكد من اتصال الإنترنت.'); }
  };
  const content = pages[page];
  return (
    <View style={s.root}>
      <Backdrop />
      {(entered || transitioning || incoming) && (
        <Animated.View onLayout={animateEntry} pointerEvents={transitioning ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, entered || incoming ? { opacity: 1 } : studioStyle]}>
          <StudioScreen />
        </Animated.View>
      )}
      {!entered && !incoming && (
        <Animated.View pointerEvents={transitioning ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, welcomeStyle]}>
          <ScrollView ref={scroll} contentContainerStyle={[s.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
            <View style={s.dots} accessibilityLabel={`الخطوة ${page + 1} من 3`}>
              {pages.map((_, i) => <View key={i} style={[s.dot, i === page && s.activeDot]} />)}
            </View>
            <Animated.View key={page} style={s.hero}
              entering={(backward ? FadeInRight : FadeInLeft).duration(380).reduceMotion(ReduceMotion.System)}
              exiting={(backward ? FadeOutLeft : FadeOutRight).duration(200).reduceMotion(ReduceMotion.System)}>
              <View style={s.logo}><TabayyanLogo width={page === 2 ? 120 : 86} height={page === 2 ? 100 : 72} color={palette.mint} /></View>
              <Text style={s.eyebrow}>{content.label}</Text>
              <Text accessibilityRole="header" style={s.title}>{content.title}</Text>
              <Text style={s.description}>{content.body}</Text>
              {page === 0 && <Glass radius={24} style={s.card}>
                <Text style={s.cardText}>١  اختر القرآن الكريم أو الحديث الشريف.</Text>
                <Text style={s.cardText}>٢  أدخل النص أو أضف الوسيط، ثم ابدأ التحقّق.</Text>
                <Text style={s.cardText}>٣  راجع النص والنتائج، وافتح المصدر للتفاصيل.</Text>
              </Glass>}
              {page === 1 && <View style={s.shortcut}>
                <GlassAction primary label="إضافة اختصار تبيّن" icon="link" disabled={Platform.OS !== 'ios'} onPress={() => void install()} />
                <Text style={s.note}>{Platform.OS === 'ios' ? 'سيفتح تطبيق «الاختصارات». وافق على الإضافة ثم ارجع هنا واضغط «التالي». إذا سبق وأضفته، أكمل مباشرة.' : 'اختصار المشاركة متاح على الآيفون. يمكنك المتابعة والتحقّق بلصق رابط المقطع.'}</Text>
                {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
              </View>}
              {page === 2 && <Text style={s.note}>النصوص والأحكام من مصادرها.{'\n'}والذكاء الصناعي يساعدك على الوصول إليها.</Text>}
            </Animated.View>
            <View style={s.bottom}>
              <GlassAction primary label={page === 2 ? 'ابدأ التحقّق' : 'التالي'} icon="check" disabled={transitioning}
                onPress={() => page === 2 ? setTransitioning(true) : changePage(page + 1)} style={{ width: '100%', minHeight: 58 }} />
              {page > 0 && <GlassAction label="السابق" disabled={transitioning} onPress={() => changePage(page - 1)} />}
            </View>
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { flexGrow: 1, paddingHorizontal: 26, gap: 24 },
  dots: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 4, backgroundColor: palette.edge },
  activeDot: { width: 26, backgroundColor: palette.mint },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 20 },
  logo: { padding: 12 },
  eyebrow: { color: palette.mint, fontSize: 13, textAlign: 'center' },
  title: { color: palette.text, fontSize: 32, fontWeight: '600', lineHeight: 48, textAlign: 'center' },
  description: { color: palette.muted, fontSize: 15, lineHeight: 28, textAlign: 'center', maxWidth: 380 },
  card: { width: '100%', maxWidth: 400, padding: 20, gap: 16 },
  cardText: { color: palette.text, fontSize: 13, lineHeight: 24, textAlign: 'right', writingDirection: 'rtl' },
  shortcut: { width: '100%', maxWidth: 380, gap: 16 },
  note: { color: palette.muted, fontSize: 12, lineHeight: 23, textAlign: 'center' },
  error: { color: palette.danger, fontSize: 13, lineHeight: 23, textAlign: 'center' },
  bottom: { alignItems: 'center', gap: 12, width: '100%', maxWidth: 400, alignSelf: 'center' },
});
