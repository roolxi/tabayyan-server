# Tabayyan Server

خادم تبيّن للتحقق من صحة الآيات القرآنية والأحاديث النبوية. يوفر واجهة برمجية للبحث في نصوص القرآن عبر قاعدة بيانات محلية، والبحث في الأحاديث من الدرر السنية، والتعرف على النصوص من الصور ومقاطع الفيديو عبر الذكاء الاصطناعي.

مستودع تطبيق الجوال (iOS):
https://github.com/roolxi/Tabayyan-app

---

## المتطلبات

- Python 3.10 أو أحدث
- FFmpeg (لمعالجة الصوت والفيديو)
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg`

---

## التشغيل المحلي

```bash
# إنشاء بيئة بايثون وتفعيلها
python -m venv .venv
source .venv/bin/activate  # على ويندوز: .venv\Scripts\activate

# تثبيت الحزم
pip install -r requirements.txt

# إعداد ملف البيئة
cp .env.example .env

# تشغيل الخادم
python server.py
```

يعمل الخادم افتراضياً على: `http://127.0.0.1:8000`

---

## التشغيل على السيرفر (Linux systemd)

الخدمة مهيأة للتشغيل التلقائي عبر systemd:

```bash
sudo systemctl status tabayyan   # فحص الحالة
sudo systemctl restart tabayyan  # إعادة التشغيل
sudo journalctl -u tabayyan -f   # متابعة السجلات
```

---

## ربط دومين عبر Cloudflare Tunnel

للحصول على رابط HTTPS مشفر:

1. في لوحة Cloudflare Zero Trust، توجه إلى Networks ثم Tunnels.
2. في تبويب Public Hostnames، أضف اسماً مستعاراً لدومينك (مثل api.yourdomain.com):
   - Service: HTTP
   - URL: 127.0.0.1:8000
3. احفظ الإعداد ليصبح الخادم متاحاً عبر الرابط المشفر.

---

## واجهات API الأساسية

- `POST /api/quran/search` - فحص وبحث الآيات القرآنية
- `POST /api/hadith/search` - فحص والتحقق من صحة الأحاديث
- `POST /api/search/suggest` - اقتراح النص الفصيح للبحث
- `POST /api/media/extract` - استخراج النصوص من الصور والمقاطع
