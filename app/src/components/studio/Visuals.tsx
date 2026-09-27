import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSceneMotion } from '../../hooks/useSceneMotion';

export const ink = { bg: '#090C13', panel: '#121722', edge: '#252D3D', text: '#F4F1EA', muted: '#97A3B8', blue: '#94CBFF', peach: '#EFC7AF', danger: '#FFB2B2' };
export function Button({ title, onPress, secondary = false, disabled = false, style }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => { void Haptics.selectionAsync().catch(() => {}); onPress(); }} style={({ pressed }) => [s.button, secondary && s.secondary, { opacity: disabled ? .4 : pressed ? .72 : 1, transform: [{ scale: pressed ? .98 : 1 }] }, style]}><Text style={[s.buttonText, secondary && { color: ink.text }]}>{title}</Text></Pressable>;
}

/** Three animated layers only. The point cloud is static and rasterized as one layer. */
export function Signal({ busy = false, compact = false }: { busy?: boolean; compact?: boolean }) {
  const active = useSceneMotion();
  const turn = useSharedValue(0);
  const breath = useSharedValue(0);
  useEffect(() => {
    if (active && busy) {
      turn.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.linear }), -1, false);
      breath.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }), -1, true);
    } else { cancelAnimation(turn); cancelAnimation(breath); turn.value = 0; breath.value = 0; }
    return () => { cancelAnimation(turn); cancelAnimation(breath); };
  }, [active, busy]);
  const orbit = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const bloom = useAnimatedStyle(() => ({ opacity: .5 + breath.value * .4, transform: [{ scale: 1 + breath.value * .055 }] }));
  return <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[s.signal, compact && { height: 170, marginVertical: 0 }]}>
    <Animated.View style={[s.core, bloom]}><LinearGradient colors={['#304565', '#152039', '#10151F']} style={StyleSheet.absoluteFill} /><Text style={s.coreGlyph}>ت</Text></Animated.View>
    <Animated.View renderToHardwareTextureAndroid shouldRasterizeIOS style={[s.constellation, orbit]}>
      {Array.from({ length: 48 }, (_, i) => { const a = i * Math.PI / 24; const r = i % 3 === 0 ? 107 : 93; return <View key={i} style={{ position: 'absolute', width: i % 6 === 0 ? 4 : 2, height: i % 6 === 0 ? 4 : 2, borderRadius: 3, backgroundColor: i % 3 === 0 ? ink.peach : ink.blue, opacity: i % 3 === 0 ? .8 : .3, left: 120 + Math.cos(a) * r, top: 120 + Math.sin(a) * r }} />; })}
      <View style={[s.orbit, { transform: [{ rotate: '-28deg' }, { scaleY: .58 }] }]} />
      <View style={[s.orbit, { transform: [{ rotate: '40deg' }, { scaleY: .58 }], borderColor: '#6C635F' }]} />
    </Animated.View>
    <View style={s.cross}><Text style={s.crossText}>+</Text></View>
  </View>;
}

export function Processing({ message, onCancel }: { message: string; onCancel: () => void }) {
  return <View style={s.processing} accessibilityLiveRegion="polite">
    <Text style={s.eyebrow}>مِن الأثر إلى المصدر</Text><Signal busy />
    <Text style={s.processingTitle}>تتّضح الحكاية.</Text><Text style={s.message}>{message || 'نبحث في المصادر…'}</Text>
    <View style={s.track}><View style={s.trackDot} /><Text style={s.trackText}>استخراج العبارة · البحث · عرض المصدر</Text></View>
    <Text style={s.note}>النص المستخرج وسيلة للبحث، وليس حكمًا على صحته.</Text>
    <Button title="إلغاء" secondary onPress={onCancel} style={{ marginTop: 20, alignSelf: 'center', minWidth: 120 }} />
  </View>;
}
export const s = StyleSheet.create({
  button: { minHeight: 52, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 18, backgroundColor: ink.blue, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: ink.panel, borderWidth: 1, borderColor: ink.edge }, buttonText: { fontSize: 15, fontWeight: '700', color: ink.bg },
  signal: { height: 248, alignItems: 'center', justifyContent: 'center', marginVertical: 8, overflow: 'hidden' },
  core: { width: 108, height: 108, borderRadius: 54, overflow: 'hidden', borderWidth: 1, borderColor: '#4A6481', alignItems: 'center', justifyContent: 'center' },
  coreGlyph: { fontSize: 61, color: ink.text, marginTop: -12, fontWeight: '300' },
  constellation: { width: 240, height: 240, position: 'absolute' }, orbit: { position: 'absolute', width: 230, height: 230, left: 5, top: 5, borderWidth: 1, borderColor: '#425873', borderRadius: 115 },
  cross: { position: 'absolute', right: 30, top: 30 }, crossText: { color: '#657182', fontSize: 18, fontWeight: '200' },
  processing: { paddingVertical: 30 }, eyebrow: { color: ink.peach, letterSpacing: 2, textAlign: 'center', fontSize: 12 },
  processingTitle: { fontSize: 34, fontWeight: '600', color: ink.text, textAlign: 'center' }, message: { color: ink.blue, fontSize: 15, textAlign: 'center', marginTop: 14, lineHeight: 24 },
  track: { flexDirection: 'row-reverse', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 30 }, trackDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ink.blue }, trackText: { fontSize: 11, color: ink.muted }, note: { fontSize: 12, lineHeight: 20, textAlign: 'center', color: ink.muted, marginTop: 18 },
});
