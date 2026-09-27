# Tabayyan App

تطبيق تبيّن للآيفون (iOS) للتحقق من صحة الآيات القرآنية والأحاديث النبوية. يوفر طريقة بسيطة للتحقق من النصوص المكتوبة، الصور، ومقاطع الفيديو المشتركة من وسائل التواصل.

مستودع الخادم (Backend):
https://github.com/roolxi/tabayyan-server

---

## التشغيل في بيئة التطوير

```bash
# تثبيت الاعتماديات
npm install

# تشغيل خادم التطوير
npx expo start
```

---

## الاتصال بالخادم

يتم تحديد عنوان الخادم في ملف `.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://38.242.147.82:8000
```

---

## بناء ملف IPA

يحتوي المستودع على سير عمل مؤتمت في GitHub Actions:
`.github/workflows/build-ios.yml`

عند دفع التحديثات إلى فرع `main`، يتم بناء ملف التطبيق `Tabayyan.ipa` تلقائياً ويمكن تحميله من تبويب Actions في المستودع.

---

## اختصار المشاركة السريع (iOS Shortcut)

رابط تثبيت الاختصار:
https://www.icloud.com/shortcuts/53bd87b6b17049bd9be64cb4163fee47
