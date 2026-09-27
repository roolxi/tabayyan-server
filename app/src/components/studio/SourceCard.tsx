import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { HadithRecord } from '../../api/types';
import { ink, Button } from './Visuals';
export interface SourceEntry { id: string; kind: 'quran' | 'hadith'; text: string; source: string; sourceUrl?: string | null; verse?: string; record?: HadithRecord; mixed?: boolean; candidate?: boolean; searchText?: string; }
export function SourceCard({ item, onConfirm }: { item: SourceEntry; onConfirm: (item: SourceEntry) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const r = item.record;
  const open = async () => {
    if (!item.sourceUrl) return;
    try { const u = new URL(item.sourceUrl); if (u.protocol !== 'https:' && u.protocol !== 'http:') throw Error(); await Linking.openURL(u.toString()); }
    catch { setLinkError(true); }
  };
  return <View style={styles.card}>
    <View style={styles.top}><Text style={styles.kind}>{item.kind === 'quran' ? 'القرآن الكريم' : 'الحديث الشريف'}</Text><Text style={styles.number}>{item.verse || 'المصدر أولًا'}</Text></View>
    <Text selectable style={[styles.text, item.kind === 'quran' && { lineHeight: 43 }]}>{item.text}</Text>
    {r?.grade && <View style={styles.grade}><Text style={styles.gradeLabel}>حكم {r.scholar || 'المحدّث'}</Text><Text selectable style={styles.gradeText}>{r.grade}</Text></View>}
    {r?.categoryLabels?.length ? <Text style={styles.meta}>{r.categoryLabels.join(' · ')}</Text> : null}
    {item.mixed && <Text style={styles.notice}>وردت أحكام مختلفة ضمن النتائج؛ قد تختلف الألفاظ أو الأسانيد. راجع تفاصيل كل رواية.</Text>}
    <View style={styles.footer}><Text style={styles.source}>{item.source}</Text>{item.sourceUrl && <Pressable accessibilityRole="link" onPress={open} style={styles.link}><Text style={styles.linkText}>المصدر ↗</Text></Pressable>}</View>
    {linkError && <Text style={styles.notice}>تعذّر فتح الرابط. حاول مرة أخرى.</Text>}
    {r && <><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.details}><Text style={styles.linkText}>{expanded ? 'إخفاء التفاصيل −' : 'الراوي والتخريج والتفاصيل +'}</Text></Pressable>{expanded && <View style={styles.detailBody}>{[['الراوي', r.narrator], ['المحدّث', r.scholar], ['الكتاب', r.book], ['الصفحة أو الرقم', r.reference], ['التخريج', r.takhrij], ['توضيح الحكم', r.gradeExplanation]].map(([label, value]) => value ? <View key={label}><Text style={styles.meta}>{label}</Text><Text selectable style={styles.detailText}>{value}</Text></View> : null)}</View>}</>}
    {item.candidate && <Button title="نعم، هذا النص · متابعة التحقق" onPress={() => onConfirm(item)} style={{ marginTop: 18 }} />}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#121722', borderWidth: 1, borderColor: ink.edge, borderRadius: 26, padding: 22, marginBottom: 16 },
  top: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 12, alignItems: 'center' }, kind: { color: ink.blue, fontSize: 12, fontWeight: '600' }, number: { color: ink.muted, fontSize: 11 },
  text: { color: ink.text, fontSize: 22, lineHeight: 36, textAlign: 'right', writingDirection: 'rtl', marginVertical: 25 },
  grade: { borderTopWidth: 1, borderTopColor: ink.edge, paddingTop: 17, gap: 8 }, gradeLabel: { color: ink.muted, textAlign: 'right', fontSize: 12 }, gradeText: { color: ink.peach, fontSize: 17, lineHeight: 26, textAlign: 'right' },
  meta: { color: ink.muted, fontSize: 12, textAlign: 'right', marginTop: 10 }, notice: { color: ink.peach, textAlign: 'right', fontSize: 12, lineHeight: 21, marginTop: 14 },
  footer: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 20 }, source: { color: ink.muted, fontSize: 12, flex: 1, textAlign: 'right' }, link: { minHeight: 44, justifyContent: 'center' }, linkText: { color: ink.blue, fontSize: 12, textAlign: 'right' }, details: { minHeight: 44, justifyContent: 'center' }, detailBody: { borderTopWidth: 1, borderTopColor: ink.edge, gap: 8, paddingTop: 10 }, detailText: { color: ink.text, lineHeight: 25, fontSize: 14, textAlign: 'right' },
});
