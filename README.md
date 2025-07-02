# 🎮 Minecraft Telegram Bot

بوت تيليجرام متطور لإدارة سيرفرات Minecraft مع دعم شامل لـ Bedrock & Java Edition

## ✨ المميزات

### 🎯 للمستخدمين العاديين
- 🎮 **إضافة سيرفرات متعددة**: حتى 10 سيرفرات لكل مستخدم
- 📱 **دعم Bedrock Edition**: للهواتف والتابلت
- ☕ **دعم Java Edition**: للكمبيوتر
- 🤖 **Anti-AFK ذكي**: حركة طبيعية + قفز + دوران
- 💬 **رسائل دردشة تلقائية**: رسائل قابلة للتخصيص
- 🔄 **إعادة اتصال تلقائي**: عند انقطاع الشبكة
- 📊 **مراقبة مباشرة**: لحالة كل سيرفر

### 🛡️ للأدمن
- 📊 **إحصائيات شاملة**: تحليل مفصل للنشاط
- 👥 **إدارة المستخدمين**: بحث وإحصائيات
- 🎮 **إدارة السيرفرات**: مراقبة وتنظيف
- 📢 **رسائل جماعية**: للتواصل مع المستخدمين
- ⚙️ **إعدادات قابلة للتعديل**: تحكم كامل في البوت
- 💾 **نسخ احتياطية**: للبيانات والإعدادات

## 🚀 التثبيت والإعداد

### المتطلبات
- Node.js (إصدار 18 أو أحدث)
- npm أو yarn
- توكن بوت تيليجرام

### خطوات التثبيت

1. **استنساخ المشروع**
```bash
git clone https://github.com/ahmedhssn19/minecraft-telegram-bot.git
cd minecraft-telegram-bot
```

2. **تثبيت التبعيات**
```bash
npm install
```

3. **إعداد البوت**
- أنشئ بوت جديد عبر [@BotFather](https://t.me/BotFather)
- احصل على التوكن
- عدّل ملف `telegram-config.json`

4. **تشغيل البوت**
```bash
npm start
```

## 🚂 الاستضافة على Railway

### نشر سريع على Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/minecraft-telegram-bot)

### خطوات النشر اليدوي

1. **إنشاء حساب على Railway**
   - اذهب إلى [railway.app](https://railway.app)
   - سجل دخول بـ GitHub

2. **إنشاء مشروع جديد**
   - اضغط "New Project"
   - اختر "Deploy from GitHub repo"
   - حدد هذا المستودع

3. **إعداد متغيرات البيئة**
   ```
   BOT_TOKEN=your_telegram_bot_token
   ADMIN_ID=your_telegram_user_id
   CHANNEL_USERNAME=@your_channel
   ```

4. **النشر التلقائي**
   - Railway سيقوم بالنشر تلقائياً
   - ستحصل على رابط للتطبيق

### ✅ ميزات Railway
- ✅ **نشر تلقائي** من GitHub
- ✅ **SSL مجاني** وشهادات
- ✅ **مراقبة صحة التطبيق** عبر `/health`
- ✅ **إعادة تشغيل تلقائي** عند الأخطاء
- ✅ **سجلات مباشرة** للتطبيق

## ⚙️ الإعدادات

عدّل ملف `telegram-config.json`:

```json
{
  "telegram": {
    "bot_token": "YOUR_BOT_TOKEN",
    "admin_id": "YOUR_TELEGRAM_ID",
    "channel_username": "@YourChannel"
  },
  "security": {
    "max_servers_per_user": 10,
    "require_subscription": true
  }
}
```

## 📂 هيكل المشروع

```
📦 minecraft-telegram-bot/
├── 📄 telegram-bot.js          # الملف الرئيسي للبوت
├── 📄 bedrock-bot.js          # بوت Bedrock Edition
├── 📄 bot.js                  # بوت Java Edition
├── 📄 logging.js              # نظام السجلات
├── 📄 package.json            # تبعيات المشروع
├── 📄 telegram-config.json    # إعدادات البوت
├── 📄 users.json              # بيانات المستخدمين
├── 📄 servers.json            # بيانات السيرفرات
├── 📄 bot-image.html          # مولد صورة البوت
└── 📄 SETUP.txt              # دليل الإعداد
```

## 🎮 كيفية الاستخدام

### للمستخدمين
1. ابدأ محادثة مع البوت `/start`
2. اشترك في القنوات المطلوبة
3. اختر "إضافة سيرفر"
4. حدد نوع السيرفر (Bedrock/Java)
5. أدخل عنوان السيرفر
6. شغّل البوت

### للأدمن
- استخدم `/start` ثم اضغط "لوحة الأدمن"
- أدر المستخدمين والسيرفرات
- أرسل رسائل جماعية
- راقب الإحصائيات

## 🔧 المتطلبات التقنية

### إصدارات Bedrock المدعومة
- من v1.0.0 إلى v1.21.90

### إصدارات Java المدعومة
- 1.8.x إلى 1.21.x

### البورتات الافتراضية
- **Bedrock**: 19132
- **Java**: 25565

## 🛡️ الأمان

- ✅ **اشتراك إجباري** في القنوات
- ✅ **حد أقصى للسيرفرات** لكل مستخدم
- ✅ **صلاحيات أدمن** محمية
- ✅ **تشفير البيانات** الحساسة
- ✅ **معالجة أخطاء شاملة**

## 📱 الدعم

### المطور
- **الاسم**: سافيور | SAFIOUR
- **التيليجرام**: [@c_ega](https://t.me/c_ega)
- **القناة**: [@TEAMASH12](https://t.me/TEAMASH12)

### الإبلاغ عن مشاكل
استخدم [Issues](https://github.com/ahmedhssn19/minecraft/issues) لتبليغ المشاكل أو طلب ميزات جديدة.

## 📄 الترخيص

هذا المشروع مُرخص تحت [MIT License](LICENSE).

## 🙏 الشكر والتقدير

- **مجتمع Minecraft** للإلهام
- **Telegram Bot API** للمنصة الرائعة
- **مكتبة mineflayer** لدعم Java Edition
- **مكتبة bedrock-protocol** لدعم Bedrock Edition

---

⭐ **إذا أعجبك المشروع، لا تنس إعطاءه نجمة!** ⭐ 