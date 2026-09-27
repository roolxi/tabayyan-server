# تبيّن | Tabayyan 🌿

مشروع للتحقق من صحة الآيات القرآنية والأحاديث النبوية، سواء من نص مكتوب، صورة، أو رابط مقطع (يوتيوب شورتس، تيك توك، إنستغرام ريلز).

المشروع مقسوم لجزأين رئيسيين:
1. **الخادم (Backend)**: مبني بـ Python و FastAPI، للبحث في القرآن (محلياً عبر Tanzil) والحديث (مباشرة من الدرر السنية) واستخراج النصوص من الوسائط بالذكاء الاصطناعي (Gemini عبر OpenRouter).
2. **تطبيق الآيفون (Mobile App)**: تطبيق React Native / Expo، بتصميم زجاجي زمردي (Emerald Glass)، يدعم الكاميرا المدمجة، واختصار iOS السريع للمشاركة من أي تطبيق.

---

## 📁 هيكلة المشروع (Project Structure)

```text
├── server.py              # ملف تشغيل خادم FastAPI
├── services/              # خدمات البحث في الدرر، القرآن، والوسائط
├── source/                # نصوص القرآن من مشروع تنزيل (Uthmani + Clean)
├── quran.sqlite           # قاعدة بيانات الآيات القرآنية
├── requirements.txt       # مكتبات بايثون المطلوبة للخادم
├── .env                   # مفاتيح API الخادم (OpenRouter)
│
└── app/                   # تطبيق الهاتف (React Native / Expo 57)
    ├── app/               # صفحات التطبيق ومسارات Expo Router
    ├── src/               # واجهات الزجاج، الكاميرا، وخدمات الاتصال
    ├── assets/brand/      # الشعار المتجهي والأيقونة الأصلية
    └── package.json       # حزم ومكتبات التطبيق
```

---

## 🚀 تشغيل الخادم (Server Setup)

### 1. المتطلبات:
* **Python 3.10** أو أحدث.
* **FFmpeg**: ضروري جداً لاستخراج الصوت من مقاطع الفيديو لمعالجتها.
  * على ويندوز: `winget install Gyan.FFmpeg`
  * على لينكس (Ubuntu/Debian): `sudo apt install ffmpeg`

### 2. التثبيت والتشغيل المحلي:
```bash
# إنشاء بيئة افتراضية وتفعيلها
python -m venv .venv
source .venv/bin/activate    # على لينكس/ماك
# أو على ويندوز: .venv\Scripts\activate

# تثبيت المكتبات
pip install -r requirements.txt

# إنشاء ملف .env وضبط مفتاح OpenRouter
cp .env.example .env
# افتح ملف .env وضع مفتاحك: OPENROUTER_API_KEY=sk-or-v1-...

# تشغيل الخادم
python server.py
# سيعمل الخادم محلياً على: http://127.0.0.1:8000
```

### 3. تشغيل الخادم على سيرفرك (VPS) كخدمة دائمة 24/7:
تم تجهيز الخادم وتشغيله على الـ VPS كخدمة `systemd`:
```bash
# أوامر التحكم بالخدمة على السيرفر
sudo systemctl status tabayyan   # فحص الحالة
sudo systemctl restart tabayyan  # إعادة التشغيل
sudo journalctl -u tabayyan -f   # متابعة السجلات الحية
```

---

## ☁️ ربط Cloudflare Tunnel (للحصول على HTTPS مجاني)

تطبيق iOS يشترط وجود اتصال مشفر `https://` عند استدعاء الخادم عبر الإنترنت. أسهل طريقة هي استخدام نفق كلودفلير (Cloudflare Tunnel):

1. في لوحة تحكم **Cloudflare Zero Trust** -> توجه إلى **Networks** -> **Tunnels**.
2. اختر النفق المربوط بسيرفرك، ثم اضغط على **Public Hostnames**.
3. أضف اسماً مستعاراً (مثال: `api.yourdomain.com`):
   * **Service**: `HTTP`
   * **URL**: `127.0.0.1:8000`
4. احفظ الإعداد، وسيصبح خادمك متاحاً فورياً برابط مشفر: `https://api.yourdomain.com`.

*(ملاحظة: السيرفر يعمل حالياً ومتاح أيضاً عبر الـ IP المباشر `http://38.242.147.82:8000`)*.

---

## 📱 تشغيل تطبيق الآيفون (App Setup)

التطبيق موجود بالكامل داخل مجلد `app/`.

### 1. التشغيل في بيئة التطوير:
```bash
cd app

# تثبيت مكتبات Node.js
npm install

# ضبط عنوان الخادم في ملف app/.env
# EXPO_PUBLIC_API_BASE_URL=http://38.242.147.82:8000 (أو رابط دومين كلودفلير)

# بدء تشغيل التطبيق
npx expo start
```

### 2. بناء ملف IPA وتثبيته على الآيفون:
المشروع مجهز بسير عمل جاهز في GitHub Actions (`.github/workflows/build-ios.yml`).
كل ما عليك هو دفع الكود إلى فرع `main`:
```bash
git push origin main
```
وسيقوم GitHub Actions ببناء ملف `Tabayyan.ipa` تلقائياً بدون توقيع (Unsigned)، ويمكنك تحميله وتثبيته عبر TrollStore أو AltStore أو SideStore.

---

## 🔗 اختصار المشاركة السريعة في iOS (Shortcuts)

لإرسال المقاطع مباشرة من يوتيوب، تيك توك، أو إنستغرام إلى التطبيق بلمسة واحدة:
* رابط تثبيت الاختصار الجاهز: [تحقّق عبر تبيّن](https://www.icloud.com/shortcuts/53bd87b6b17049bd9be64cb4163fee47)
* عند تثبيته، كل ما عليك هو فتح زر المشاركة (Share Sheet) في أي مقطع واختيار «تحقّق عبر تبيّن»، وسيفتح التطبيق فوراً ويبدأ الفحص.

---

## 🧪 فحص واختبار المشروع

* لاختبار كود التطبيق ووحدات التحقق (81 اختبار وحدة):
  ```bash
  cd app && npm test
  ```
* للتحقق من سلامة الأنواع برمجياً:
  ```bash
  cd app && npx tsc --noEmit
  ```
