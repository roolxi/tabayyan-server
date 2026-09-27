// Shortcuts owns launching the app; the app owns extraction and verification.
// URLSearchParams performs the ONE outer query decode. Never decode the video URL again.
import { extractSupportedUrlFromText } from '../api/urlMedia';

export const SHORTCUT_NAME = 'تحقّق عبر تبيّن';
export const SHORTCUT_PREFIX = 'tabayyan://handle-share?source=shortcuts&url=';
export const SHORTCUT_STEPS = [
  ['١ · اختصار جديد', 'أنشئ اختصارًا باسم «تحقّق عبر تبيّن». من تفاصيله فعّل Show in Share Sheet / إظهار في ورقة المشاركة، واجعل الإدخال URLs وText. عند عدم وجود إدخال اختر Stop and Respond.'],
  ['٢ · ترميز الإدخال', 'أضف URL Encode، واختر Encode، واجعل مدخله Shortcut Input / إدخال الاختصار. يُرمّز النص أو الرابط كاملًا مرة واحدة.'],
  ['٣ · تكوين الرابط', 'أضف Text / نص. اكتب البادئة أدناه، ثم أدرج متغيّر URL Encoded Text الناتج من الخطوة السابقة مباشرة بعد علامة =. لا تكتب اسم المتغيّر كنص عادي.'],
  ['٤ · فتح تبيّن', 'أضف Open URLs / فتح عناوين URL، واجعل مدخله ناتج إجراء Text السابق. احفظ الاختصار.'],
  ['٥ · المشاركة', 'من المقطع افتح قائمة مشاركة iOS ثم اختر «تحقّق عبر تبيّن». يفتح التطبيق ويبدأ فحص الرابط بنفس الخادم. إذا لم يظهر الاختصار، افتح المزيد أو عدّل الإجراءات في قائمة المشاركة.'],
] as const;

export function buildShortcutDeepLink(text: string): string {
  const url = extractSupportedUrlFromText(text);
  if (!url) throw new Error('ألصق رابط مقطع من إنستغرام أو تيك توك أو يوتيوب.');
  return SHORTCUT_PREFIX + encodeURIComponent(url);
}

/** null means this is not a Shortcut delivery; leave other navigation untouched. */
export function shortcutRoute(path: string, deliveryId: () => string = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`): string | null {
  try {
    const full = /^tabayyan:\/\//i.test(path);
    const parsed = new URL(full ? path : path.startsWith('/') ? `tabayyan://app${path}` : `tabayyan://app/${path}`);
    const route = full ? `${parsed.hostname}${parsed.pathname}`.replace(/^\/+|\/+$/g, '') : parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (parsed.searchParams.get('source') !== 'shortcuts' || route !== 'handle-share') return null;
    const raw = parsed.searchParams.get('url') || parsed.searchParams.get('text') || '';
    const url = extractSupportedUrlFromText(raw);
    if (!url) return '/shortcut-setup?error=invalid-share';
    const query = new URLSearchParams({ url, source: 'shortcuts', id: deliveryId() });
    return `/handle-share?${query.toString()}`;
  } catch { return null; }
}

export const DEFAULT_SHORTCUT_INSTALL_URL =
  'https://www.icloud.com/shortcuts/53bd87b6b17049bd9be64cb4163fee47';

export function isValidICloudShortcutURL(raw: string | undefined): boolean {
  try {
    if (!raw) return false;
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.icloud.com' &&
      /^\/shortcuts\/[a-z\d]+\/?$/i.test(url.pathname) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}

export function shortcutInstallURL(raw: string | undefined = process.env.EXPO_PUBLIC_SHORTCUT_INSTALL_URL): string {
  if (raw && isValidICloudShortcutURL(raw)) {
    return raw.trim();
  }
  return DEFAULT_SHORTCUT_INSTALL_URL;
}

