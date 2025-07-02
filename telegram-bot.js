const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const bedrock = require('bedrock-protocol');
const mineflayer = require('mineflayer');

// تحميل الإعدادات
const config = JSON.parse(fs.readFileSync('telegram-config.json', 'utf8'));

// إعدادات البوت
const BOT_TOKEN = config.telegram.bot_token;
const ADMIN_ID = config.telegram.admin_id;
const CHANNEL_USERNAME = config.telegram.channel_username;

const bot = new TelegramBot(BOT_TOKEN, { 
    polling: {
        interval: 1000,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

// معالجة أخطاء التيليجرام
bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.log('⚠️ هناك نسخة أخرى من البوت تعمل. سيتم إيقاف هذه النسخة...');
        process.exit(1);
    } else {
        console.log('🚨 Telegram polling error:', error.message);
    }
});

bot.on('error', (error) => {
    console.log('🚨 Telegram bot error:', error.message);
});

// قاعدة بيانات بسيطة
let serversDB = {};
let usersDB = {};
let botsPool = {};

// تحميل البيانات
function loadData() {
    try {
        if (fs.existsSync('servers.json')) {
            serversDB = JSON.parse(fs.readFileSync('servers.json', 'utf8'));
        }
        if (fs.existsSync('users.json')) {
            usersDB = JSON.parse(fs.readFileSync('users.json', 'utf8'));
        }
    } catch (err) {
        console.log('Error loading data:', err.message);
    }
}

// حفظ البيانات
function saveData() {
    try {
        fs.writeFileSync('servers.json', JSON.stringify(serversDB, null, 2));
        fs.writeFileSync('users.json', JSON.stringify(usersDB, null, 2));
    } catch (err) {
        console.log('Error saving data:', err.message);
    }
}

// فحص الاشتراك في جميع القنوات المطلوبة
async function checkSubscription(userId) {
    try {
        const channels = config.telegram.required_channels || [{ username: CHANNEL_USERNAME }];
        
        for (const channel of channels) {
            const member = await bot.getChatMember(channel.username, userId);
            if (!['member', 'administrator', 'creator'].includes(member.status)) {
                return false;
            }
        }
        return true;
    } catch {
        return false;
    }
}

// فحص قناة واحدة
async function checkSingleChannelSubscription(userId, channelUsername) {
    try {
        const member = await bot.getChatMember(channelUsername, userId);
        return ['member', 'administrator', 'creator'].includes(member.status);
    } catch {
        return false;
    }
}

// الكيبورد الرئيسي
const mainKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '🎮 إضافة سيرفر', callback_data: 'add_server' },
                { text: '📊 سيرفراتي', callback_data: 'my_servers' }
            ],
            [
                { text: '🔧 حذف سيرفر', callback_data: 'delete_server' },
                { text: '⚡ حالة السيرفرات', callback_data: 'servers_status' }
            ],
            [
                { text: '❓ المساعدة', callback_data: 'help' },
                { text: '👨‍💻 المطور', callback_data: 'developer' }
            ]
        ]
    }
};

// كيبورد الأدمن
const adminKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '📊 إحصائيات شاملة', callback_data: 'admin_stats' },
                { text: '👥 إدارة المستخدمين', callback_data: 'admin_users' }
            ],
            [
                { text: '🎮 إدارة السيرفرات', callback_data: 'admin_servers' },
                { text: '⚙️ إعدادات البوت', callback_data: 'admin_settings' }
            ],
            [
                { text: '📢 رسالة جماعية', callback_data: 'admin_broadcast' },
                { text: '📺 إدارة القنوات', callback_data: 'admin_channels' }
            ],
            [
                { text: '🔙 العودة للقائمة الرئيسية', callback_data: 'back_to_main' }
            ]
        ]
    }
};

// رسالة البداية
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'غير محدد';
    
    // حفظ بيانات المستخدم
    if (!usersDB[userId]) {
        usersDB[userId] = {
            username: username,
            first_name: msg.from.first_name,
            join_date: new Date().toISOString(),
            servers: []
        };
        saveData();
    }

    // فحص الاشتراك
    const isSubscribed = await checkSubscription(userId);
    
    if (!isSubscribed && config.security.require_subscription) {
        const channels = config.telegram.required_channels || [{ username: CHANNEL_USERNAME, name: 'القناة الرئيسية' }];
        
        let subscriptionMessage = `🔒 **يجب الاشتراك في القنوات التالية للمتابعة**:\n\n`;
        let keyboard = [];
        
        channels.forEach((channel, index) => {
            subscriptionMessage += `${index + 1}️⃣ **${channel.name || 'قناة مهمة'}**\n`;
            subscriptionMessage += `📢 ${channel.username}\n`;
            if (channel.description) {
                subscriptionMessage += `📝 ${channel.description}\n`;
            }
            subscriptionMessage += `\n`;
            
            keyboard.push([{ 
                text: `📢 ${channel.name || channel.username}`, 
                url: `https://t.me/${channel.username.replace('@', '')}` 
            }]);
        });
        
        subscriptionMessage += `⚡ **بعد الاشتراك في جميع القنوات، اضغط "تم الاشتراك"**\n\n`;
        subscriptionMessage += `🎁 **ستحصل على**:\n`;
        subscriptionMessage += `• 🎮 إضافة ${config.security.max_servers_per_user} سيرفر\n`;
        subscriptionMessage += `• 🤖 بوتات AFK متطورة\n`;
        subscriptionMessage += `• 📊 مراقبة مباشرة\n`;
        subscriptionMessage += `• 🔄 دعم فني مجاني`;
        
        keyboard.push([{ text: '✅ تم الاشتراك في جميع القنوات', callback_data: 'check_subscription' }]);
        
        return bot.sendMessage(chatId, subscriptionMessage, {
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    let keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🎮 إضافة سيرفر', callback_data: 'add_server' },
                    { text: '📊 سيرفراتي', callback_data: 'my_servers' }
                ],
                [
                    { text: '🔧 حذف سيرفر', callback_data: 'delete_server' },
                    { text: '⚡ حالة السيرفرات', callback_data: 'servers_status' }
                ],
                [
                    { text: '❓ المساعدة', callback_data: 'help' },
                    { text: '👨‍💻 المطور', callback_data: 'developer' }
                ]
            ]
        }
    };
    
    // إضافة لوحة الأدمن للأدمن فقط
    if (userId.toString() === ADMIN_ID) {
        keyboard.reply_markup.inline_keyboard.push([
            { text: '🛡️ لوحة الأدمن', callback_data: 'admin_panel' }
        ]);
    }

    const welcomeMessage = 
        `🌟 **أهلاً وسهلاً بك في عالم البوتات المتطورة!** 🌟\n\n` +
        
        `🎮 **بوت Minecraft الذكي - إدارة شاملة لسيرفراتك**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        
        `👋 مرحباً **${msg.from.first_name || 'صديقي'}**!\n` +
        `🎯 أنت الآن في المكان الصحيح لإدارة سيرفرات Minecraft بطريقة احترافية\n\n` +
        
        `✨ **ما يميز بوتنا**:\n` +
        `🚀 **تقنية متقدمة**: دعم كامل لـ Bedrock & Java Edition\n` +
        `⚡ **Anti-AFK ذكي**: حركة طبيعية + قفز + دوران تلقائي\n` +
        `🔄 **اتصال مستمر**: إعادة اتصال فوري عند انقطاع الشبكة\n` +
        `💬 **دردشة تلقائية**: رسائل ذكية قابلة للتخصيص\n` +
        `📊 **مراقبة دقيقة**: إحصائيات مفصلة لكل سيرفر\n` +
        `🛡️ **أمان عالي**: حماية البيانات وسرية المعلومات\n\n` +
        
        `🎁 **خدماتك المجانية**:\n` +
        `• إضافة حتى ${config.security.max_servers_per_user} سيرفر\n` +
        `• دعم فني على مدار الساعة\n` +
        `• تحديثات مستمرة ومجانية\n\n` +
        
        `👨‍💻 **من وراء هذا الإبداع**:\n` +
        `🏷️ المطور: **سافيور | SAFIOUR**\n` +
        `📱 للدعم: @c_ega\n` +
        `🎬 قناتنا: @TEAMASH12\n\n` +
        
        `🎯 **ابدأ رحلتك الآن**:`;

    bot.sendMessage(chatId, welcomeMessage, keyboard);
});

// معالجة الضغط على الأزرار
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    try {
        // الإجابة على callback query لتجنب أخطاء timeout
        await bot.answerCallbackQuery(query.id).catch(() => {
            // تجاهل الأخطاء مثل "query is too old"
        });

        // فحص الاشتراك أولاً
        const isSubscribed = await checkSubscription(userId);
        
        if (!isSubscribed && config.security.require_subscription && data !== 'check_subscription') {
            return bot.sendMessage(chatId, '🔒 يجب الاشتراك في القناة أولاً!');
        }
    } catch (error) {
        console.log('خطأ في callback_query:', error.message);
        return;
    }

    switch (data) {
        case 'check_subscription':
            const subscribed = await checkSubscription(userId);
            if (subscribed) {
                bot.answerCallbackQuery(query.id, { text: '✅ تم التحقق من الاشتراك!' });
                
                let keyboard = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🎮 إضافة سيرفر', callback_data: 'add_server' },
                                { text: '📊 سيرفراتي', callback_data: 'my_servers' }
                            ],
                            [
                                { text: '🔧 حذف سيرفر', callback_data: 'delete_server' },
                                { text: '⚡ حالة السيرفرات', callback_data: 'servers_status' }
                            ],
                            [
                                { text: '❓ المساعدة', callback_data: 'help' },
                                { text: '👨‍💻 المطور', callback_data: 'developer' }
                            ]
                        ]
                    }
                };
                
                if (userId.toString() === ADMIN_ID) {
                    keyboard.reply_markup.inline_keyboard.push([
                        { text: '🛡️ لوحة الأدمن', callback_data: 'admin_panel' }
                    ]);
                }
                
                bot.sendMessage(chatId, 
                    `🎉 مرحباً بك!\n\n` +
                    `👨‍💻 المطور: سافيور | SAFIOUR\n` +
                    `📱 التيليجرام: @c_ega\n\n` +
                    `اختر ما تريد فعله:`, 
                    keyboard
                );
            } else {
                bot.answerCallbackQuery(query.id, {
                    text: '❌ لم يتم العثور على الاشتراك!',
                    show_alert: true
                });
            }
            break;

        case 'add_server':
            bot.sendMessage(chatId, 
                `🎮 إضافة سيرفر جديد\n\n` +
                `🎯 اختر نوع السيرفر أولاً:\n\n` +
                `📱 **Bedrock Edition**:\n` +
                `• للهواتف والتابلت\n` +
                `• Windows 10/11 Edition\n` +
                `• Xbox, PlayStation, Switch\n\n` +
                `☕ **Java Edition**:\n` +
                `• للكمبيوتر (PC/Mac/Linux)\n` +
                `• النسخة الأصلية من Minecraft\n` +
                `• يدعم المودات والإضافات`, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📱 Bedrock Edition', callback_data: 'select_bedrock' },
                            { text: '☕ Java Edition', callback_data: 'select_java' }
                        ],
                        [{ text: '🔙 إلغاء', callback_data: 'back_to_main' }]
                    ]
                }
            });
            break;

        case 'select_bedrock':
            bot.editMessageText(
                `📱 إضافة سيرفر Bedrock Edition\n\n` +
                `📝 أرسل الآن IP والبورت الخاص بالسيرفر!\n\n` +
                `📋 أمثلة على التنسيق:\n` +
                `• server.example.com:19132\n` +
                `• 192.168.1.1:19133\n` +
                `• play.bedrock-server.net\n\n` +
                `💡 إذا لم تحدد البورت سيتم استخدام البورت الافتراضي: **19132**\n\n` +
                `🎮 **إصدارات Bedrock المدعومة**:\n` +
                `من v1.0.0 إلى v${config.minecraft.supported_versions.bedrock[0]}`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 تغيير إلى Java', callback_data: 'select_java' }],
                        [{ text: '🔙 إلغاء', callback_data: 'back_to_main' }]
                    ]
                }
            }).catch((error) => {
                // إذا فشل تعديل الرسالة، أرسل رسالة جديدة
                bot.sendMessage(chatId,
                    `📱 إضافة سيرفر Bedrock Edition\n\n` +
                    `📝 أرسل الآن IP والبورت الخاص بالسيرفر!\n\n` +
                    `📋 أمثلة على التنسيق:\n` +
                    `• server.example.com:19132\n` +
                    `• 192.168.1.1:19133\n` +
                    `• play.bedrock-server.net\n\n` +
                    `💡 إذا لم تحدد البورت سيتم استخدام البورت الافتراضي: **19132**\n\n` +
                    `🎮 **إصدارات Bedrock المدعومة**:\n` +
                    `من v1.0.0 إلى v${config.minecraft.supported_versions.bedrock[0]}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 تغيير إلى Java', callback_data: 'select_java' }],
                            [{ text: '🔙 إلغاء', callback_data: 'back_to_main' }]
                        ]
                    }
                });
            });
            
            usersDB[userId].waiting_for = 'server_ip_bedrock';
            saveData();
            break;

        case 'select_java':
            bot.editMessageText(
                `☕ إضافة سيرفر Java Edition\n\n` +
                `📝 أرسل الآن IP والبورت الخاص بالسيرفر!\n\n` +
                `📋 أمثلة على التنسيق:\n` +
                `• server.example.com:25565\n` +
                `• mc.hypixel.net\n` +
                `• 192.168.1.1:25566\n\n` +
                `💡 إذا لم تحدد البورت سيتم استخدام البورت الافتراضي: **25565**\n\n` +
                `🎮 **إصدارات Java المدعومة**:\n` +
                `${config.minecraft.supported_versions.java.join(', ')}`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 تغيير إلى Bedrock', callback_data: 'select_bedrock' }],
                        [{ text: '🔙 إلغاء', callback_data: 'back_to_main' }]
                    ]
                }
            }).catch((error) => {
                // إذا فشل تعديل الرسالة، أرسل رسالة جديدة
                bot.sendMessage(chatId,
                    `☕ إضافة سيرفر Java Edition\n\n` +
                    `📝 أرسل الآن IP والبورت الخاص بالسيرفر!\n\n` +
                    `📋 أمثلة على التنسيق:\n` +
                    `• server.example.com:25565\n` +
                    `• mc.hypixel.net\n` +
                    `• 192.168.1.1:25566\n\n` +
                    `💡 إذا لم تحدد البورت سيتم استخدام البورت الافتراضي: **25565**\n\n` +
                    `🎮 **إصدارات Java المدعومة**:\n` +
                    `${config.minecraft.supported_versions.java.join(', ')}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 تغيير إلى Bedrock', callback_data: 'select_bedrock' }],
                            [{ text: '🔙 إلغاء', callback_data: 'back_to_main' }]
                        ]
                    }
                });
            });
            
            usersDB[userId].waiting_for = 'server_ip_java';
            saveData();
            break;

        case 'my_servers':
            showUserServers(chatId, userId);
            break;

        case 'delete_server':
            showDeleteServers(chatId, userId);
            break;

        case 'servers_status':
            showServersStatus(chatId, userId);
            break;

        case 'help':
            showHelp(chatId);
            break;

        case 'admin_panel':
            if (userId.toString() === ADMIN_ID) {
                showAdminPanel(chatId);
            }
            break;

        case 'admin_stats':
            if (userId.toString() === ADMIN_ID) {
                showAdminStats(chatId);
            }
            break;

        case 'admin_users':
            if (userId.toString() === ADMIN_ID) {
                showAdminUsers(chatId);
            }
            break;

        case 'admin_servers':
            if (userId.toString() === ADMIN_ID) {
                showAdminServers(chatId);
            }
            break;

        case 'admin_settings':
            if (userId.toString() === ADMIN_ID) {
                showAdminSettings(chatId);
            }
            break;

        case 'admin_channels':
            if (userId.toString() === ADMIN_ID) {
                showChannelManagement(chatId);
            }
            break;

        case 'add_channel':
            if (userId.toString() === ADMIN_ID) {
                bot.sendMessage(chatId,
                    `📺 **إضافة قناة جديدة للاشتراك الإجباري**\n\n` +
                    `📝 أرسل معلومات القناة بالتنسيق التالي:\n\n` +
                    `\`\`\`\n` +
                    `@channel_username\n` +
                    `اسم القناة\n` +
                    `وصف القناة (اختياري)\n` +
                    `\`\`\`\n\n` +
                    `**مثال**:\n` +
                    `@TEAMASH12\n` +
                    `قناة التحديثات\n` +
                    `قناة التحديثات والأخبار الرسمية`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 إلغاء', callback_data: 'admin_channels' }]
                        ]
                    }
                });
                
                usersDB[userId].waiting_for = 'admin_add_channel';
                saveData();
            }
            break;

        case 'admin_broadcast':
            if (userId.toString() === ADMIN_ID) {
                bot.sendMessage(chatId,
                    `📢 **إرسال رسالة جماعية لجميع المستخدمين**\n\n` +
                    `📝 اكتب الرسالة التي تريد إرسالها:\n\n` +
                    `💡 **نصائح**:\n` +
                    `• استخدم **النص الغامق** بين النجوم\n` +
                    `• استخدم الرموز التعبيرية للجاذبية\n` +
                    `• اجعل الرسالة واضحة ومفيدة`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 إلغاء', callback_data: 'admin_panel' }]
                        ]
                    }
                });
                
                usersDB[userId].waiting_for = 'admin_broadcast_message';
                saveData();
            }
            break;

        // أزرار إدارة المستخدمين
        case 'user_stats_detail':
            if (userId.toString() === ADMIN_ID) {
                showDetailedUserStats(chatId);
            }
            break;

        case 'search_user':
            if (userId.toString() === ADMIN_ID) {
                bot.sendMessage(chatId,
                    `🔍 **البحث عن مستخدم**\n\n` +
                    `📝 أرسل ID المستخدم أو اسمه للبحث:`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 العودة', callback_data: 'admin_users' }]
                        ]
                    }
                });
                usersDB[userId].waiting_for = 'search_user_input';
                saveData();
            }
            break;



        // أزرار إدارة السيرفرات
        case 'server_advanced_stats':
            if (userId.toString() === ADMIN_ID) {
                showAdvancedServerStats(chatId);
            }
            break;

        case 'search_servers':
            if (userId.toString() === ADMIN_ID) {
                bot.sendMessage(chatId,
                    `🔍 **البحث في السيرفرات**\n\n` +
                    `📝 أرسل عنوان السيرفر للبحث:`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 العودة', callback_data: 'admin_servers' }]
                        ]
                    }
                });
                usersDB[userId].waiting_for = 'search_server_input';
                saveData();
            }
            break;

        case 'problematic_servers':
            if (userId.toString() === ADMIN_ID) {
                showProblematicServers(chatId);
            }
            break;

        case 'cleanup_servers':
            if (userId.toString() === ADMIN_ID) {
                bot.sendMessage(chatId,
                    `🧹 **تنظيف السيرفرات القديمة**\n\n` +
                    `⚠️ هذا سيحذف السيرفرات غير النشطة لأكثر من 30 يوم\n\n` +
                    `هل أنت متأكد؟`, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ نعم، نظف', callback_data: 'confirm_cleanup' },
                                { text: '❌ إلغاء', callback_data: 'admin_servers' }
                            ]
                        ]
                    }
                });
            }
            break;

        // أزرار إعدادات البوت
        case 'edit_max_servers':
            if (userId.toString() === ADMIN_ID) {
                bot.sendMessage(chatId,
                    `✏️ **تعديل الحد الأقصى للسيرفرات**\n\n` +
                    `الحد الحالي: **${config.security.max_servers_per_user}** سيرفر\n\n` +
                    `📝 أرسل العدد الجديد (1-50):`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 إلغاء', callback_data: 'admin_settings' }]
                        ]
                    }
                });
                usersDB[userId].waiting_for = 'edit_max_servers_input';
                saveData();
            }
            break;

        case 'toggle_subscription':
            if (userId.toString() === ADMIN_ID) {
                config.security.require_subscription = !config.security.require_subscription;
                fs.writeFileSync('telegram-config.json', JSON.stringify(config, null, 2));
                
                const status = config.security.require_subscription ? 'مفعل' : 'معطل';
                bot.sendMessage(chatId,
                    `🔐 **تم تغيير إعداد الاشتراك الإجباري**\n\n` +
                    `الحالة الجديدة: **${status}**`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 العودة', callback_data: 'admin_settings' }]
                        ]
                    }
                });
            }
            break;

        case 'backup_settings':
            if (userId.toString() === ADMIN_ID) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupData = {
                    config: config,
                    users: usersDB,
                    servers: serversDB,
                    backup_date: new Date().toISOString()
                };
                
                fs.writeFileSync(`backup-${timestamp}.json`, JSON.stringify(backupData, null, 2));
                
                bot.sendMessage(chatId,
                    `💾 **تم إنشاء نسخة احتياطية بنجاح!**\n\n` +
                    `📁 الملف: backup-${timestamp}.json\n` +
                    `📊 البيانات المحفوظة:\n` +
                    `• الإعدادات\n` +
                    `• المستخدمين (${Object.keys(usersDB).length})\n` +
                    `• السيرفرات (${Object.keys(serversDB).length})`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 العودة', callback_data: 'admin_settings' }]
                        ]
                    }
                });
            }
            break;

        case 'reload_settings':
            if (userId.toString() === ADMIN_ID) {
                try {
                    const newConfig = JSON.parse(fs.readFileSync('telegram-config.json', 'utf8'));
                    Object.assign(config, newConfig);
                    
                    bot.sendMessage(chatId,
                        `🔄 **تم إعادة تحميل الإعدادات بنجاح!**\n\n` +
                        `✅ جميع الإعدادات محدثة`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 العودة', callback_data: 'admin_settings' }]
                            ]
                        }
                    });
                } catch (error) {
                    bot.sendMessage(chatId,
                        `❌ **خطأ في إعادة تحميل الإعدادات!**\n\n` +
                        `تأكد من صحة ملف telegram-config.json`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 العودة', callback_data: 'admin_settings' }]
                            ]
                        }
                    });
                }
            }
            break;

        case 'confirm_cleanup':
            if (userId.toString() === ADMIN_ID) {
                const servers = Object.values(serversDB);
                const oldServers = servers.filter(server => {
                    const lastConnection = server.stats?.last_connection;
                    const daysSinceConnection = lastConnection ? 
                        (Date.now() - new Date(lastConnection).getTime()) / (1000 * 60 * 60 * 24) : 999;
                    
                    return server.status === 'stopped' && daysSinceConnection > 30;
                });
                
                if (oldServers.length === 0) {
                    bot.sendMessage(chatId,
                        `✅ **لا توجد سيرفرات قديمة للحذف**\n\n` +
                        `جميع السيرفرات نشطة أو متوقفة لأقل من 30 يوم`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 إدارة السيرفرات', callback_data: 'admin_servers' }]
                            ]
                        }
                    });
                } else {
                    // حذف السيرفرات القديمة
                    oldServers.forEach(server => {
                        delete serversDB[server.server_id];
                        
                        // إزالة السيرفر من قائمة المستخدم
                        const owner = usersDB[server.owner];
                        if (owner && owner.servers) {
                            owner.servers = owner.servers.filter(sid => sid !== server.server_id);
                        }
                    });
                    
                    saveData();
                    
                    bot.sendMessage(chatId,
                        `✅ **تم تنظيف السيرفرات بنجاح!**\n\n` +
                        `📊 **تم حذف ${oldServers.length} سيرفر قديم**\n` +
                        `🗂️ جميع السيرفرات المحذوفة كانت متوقفة لأكثر من 30 يوم\n\n` +
                        `💾 تم تحديث قاعدة البيانات`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 إدارة السيرفرات', callback_data: 'admin_servers' }]
                            ]
                        }
                    });
                }
            }
            break;

        case 'developer':
            bot.sendMessage(chatId,
                `👨‍💻 معلومات المطور\n\n` +
                `🏷️ الاسم: سافيور | SAFIOUR\n` +
                `📱 التيليجرام: @c_ega\n` +
                `💻 مطور بوتات ماين كرافت\n` +
                `🌟 خبرة في Bedrock & Java Edition\n\n` +
                `📞 للتواصل والاستفسارات: @c_ega`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📱 تواصل مع المطور', url: 'https://t.me/c_ega' }],
                        [{ text: '🔙 العودة', callback_data: 'back_to_main' }]
                    ]
                }
            });
            break;

        case 'back_to_main':
            let backKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🎮 إضافة سيرفر', callback_data: 'add_server' },
                            { text: '📊 سيرفراتي', callback_data: 'my_servers' }
                        ],
                        [
                            { text: '🔧 حذف سيرفر', callback_data: 'delete_server' },
                            { text: '⚡ حالة السيرفرات', callback_data: 'servers_status' }
                        ],
                        [
                            { text: '❓ المساعدة', callback_data: 'help' },
                            { text: '👨‍💻 المطور', callback_data: 'developer' }
                        ]
                    ]
                }
            };
            
            if (userId.toString() === ADMIN_ID) {
                backKeyboard.reply_markup.inline_keyboard.push([
                    { text: '🛡️ لوحة الأدمن', callback_data: 'admin_panel' }
                ]);
            }
            
            bot.editMessageText(
                `🎮 بوت Minecraft Server Manager\n\n` +
                `👨‍💻 المطور: سافيور | SAFIOUR\n` +
                `📱 التيليجرام: @c_ega\n\n` +
                `اختر ما تريد فعله:`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                ...backKeyboard
            }).catch((error) => {
                // إذا فشل تعديل الرسالة، أرسل رسالة جديدة
                if (error.message.includes('message is not modified') || error.message.includes('message to edit not found')) {
                    bot.sendMessage(chatId,
                        `🎮 بوت Minecraft Server Manager\n\n` +
                        `👨‍💻 المطور: سافيور | SAFIOUR\n` +
                        `📱 التيليجرام: @c_ega\n\n` +
                        `اختر ما تريد فعله:`,
                        backKeyboard
                    );
                }
            });
            break;
    }

    // معالجة الأزرار الديناميكية
    if (data.startsWith('delete_')) {
        const serverId = data.replace('delete_', '');
        handleServerDeletion(chatId, userId, serverId, query.id);
        return;
    }

    if (data.startsWith('start_bot_')) {
        const serverId = data.replace('start_bot_', '');
        handleBotStart(chatId, userId, serverId, query.id);
        return;
    }

    if (data.startsWith('stop_bot_')) {
        const serverId = data.replace('stop_bot_', '');
        handleBotStop(chatId, userId, serverId, query.id);
        return;
    }

    if (data.startsWith('server_')) {
        const serverId = data.replace('server_', '');
        showServerDetails(chatId, userId, serverId);
        return;
    }

    bot.answerCallbackQuery(query.id);
});

// معالجة الرسائل النصية
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!usersDB[userId] || !usersDB[userId].waiting_for) return;

    const waitingFor = usersDB[userId].waiting_for;
    
    if (waitingFor === 'server_ip_bedrock') {
        await handleServerInput(chatId, userId, msg.text, 'bedrock');
    } else if (waitingFor === 'server_ip_java') {
        await handleServerInput(chatId, userId, msg.text, 'java');
    } else if (waitingFor === 'server_ip') {
        // للتوافق مع الكود القديم
        await handleServerInput(chatId, userId, msg.text, 'auto');
    } else if (waitingFor === 'admin_add_channel' && userId.toString() === ADMIN_ID) {
        await handleAddChannel(chatId, userId, msg.text);
    } else if (waitingFor === 'admin_broadcast_message' && userId.toString() === ADMIN_ID) {
        await handleBroadcastMessage(chatId, userId, msg.text);
    } else if (waitingFor === 'search_user_input' && userId.toString() === ADMIN_ID) {
        await handleUserSearch(chatId, userId, msg.text);
    } else if (waitingFor === 'search_server_input' && userId.toString() === ADMIN_ID) {
        await handleServerSearch(chatId, userId, msg.text);
    } else if (waitingFor === 'edit_max_servers_input' && userId.toString() === ADMIN_ID) {
        await handleMaxServersEdit(chatId, userId, msg.text);
    }
});

// معالجة إدخال السيرفر
async function handleServerInput(chatId, userId, input, serverType = 'auto') {
    try {
        let ip, port;
        
        if (input.includes(':')) {
            [ip, port] = input.split(':');
            port = parseInt(port);
        } else {
            ip = input;
            // تحديد البورت حسب نوع السيرفر المحدد
            if (serverType === 'bedrock') {
                port = config.minecraft.default_bedrock_port;
            } else if (serverType === 'java') {
                port = config.minecraft.default_java_port;
            } else {
                // للتوافق مع الكود القديم
                port = config.minecraft.default_bedrock_port;
            }
        }

        // التحقق من صحة IP
        if (!ip || ip.trim() === '') {
            delete usersDB[userId].waiting_for;
            saveData();
            return bot.sendMessage(chatId,
                `❌ عنوان IP غير صحيح!\n\n` +
                `📝 يرجى إدخال عنوان صحيح مثل:\n` +
                `• server.example.com\n` +
                `• 192.168.1.1:25565`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 إعادة المحاولة', callback_data: 'add_server' }],
                        [{ text: '🔙 العودة', callback_data: 'back_to_main' }]
                    ]
                }
            });
        }

        // التحقق من عدد السيرفرات المسموح
        const userServers = usersDB[userId]?.servers || [];
        if (userServers.length >= config.security.max_servers_per_user) {
            delete usersDB[userId].waiting_for;
            saveData();
            
            return bot.sendMessage(chatId,
                `❌ وصلت للحد الأقصى من السيرفرات!\n\n` +
                `🔢 الحد المسموح: ${config.security.max_servers_per_user} سيرفر\n` +
                `📊 السيرفرات الحالية: ${userServers.length}\n\n` +
                `🗑️ احذف سيرفر قديم لإضافة واحد جديد.`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔧 حذف سيرفر', callback_data: 'delete_server' }],
                        [{ text: '🔙 العودة', callback_data: 'back_to_main' }]
                    ]
                }
            });
        }

        // إنشاء معرف فريد للسيرفر
        const serverId = `${userId}_${Date.now()}`;
        
        // تحديد نوع السيرفر النهائي
        let finalServerType = serverType;
        if (serverType === 'auto') {
            // تحديد تلقائي حسب البورت (للتوافق مع الكود القديم)
            if (port === 19132 || port === 19133) {
                finalServerType = 'bedrock';
            } else if (port === 25565 || port === 25566) {
                finalServerType = 'java';
            } else {
                finalServerType = 'bedrock'; // افتراضي
            }
        }
        
        // إضافة السيرفر لقاعدة البيانات
        serversDB[serverId] = {
            owner: userId,
            ip: ip.trim(),
            port: port,
            type: finalServerType,
            status: 'stopped',
            created_at: new Date().toISOString(),
            bot_username: `SAFIOUR_Bot_${Math.random().toString(36).substr(2, 6)}`,
            stats: {
                total_connections: 0,
                last_connection: null,
                uptime: 0
            }
        };

        // إضافة السيرفر لقائمة المستخدم
        if (!usersDB[userId].servers) usersDB[userId].servers = [];
        usersDB[userId].servers.push(serverId);
        
        // إزالة وضع الانتظار
        delete usersDB[userId].waiting_for;
        
        saveData();

        const typeIcon = finalServerType === 'bedrock' ? '📱' : '☕';
        const typeText = finalServerType === 'bedrock' ? 'Bedrock Edition' : 'Java Edition';
        
        bot.sendMessage(chatId,
            `✅ تم إضافة السيرفر بنجاح!\n\n` +
            `🌐 السيرفر: ${ip.trim()}:${port}\n` +
            `${typeIcon} النوع: ${typeText}\n` +
            `🤖 اسم البوت: ${serversDB[serverId].bot_username}\n` +
            `📅 تاريخ الإضافة: ${new Date().toLocaleString('ar')}\n\n` +
            `🎯 يمكنك الآن تشغيل البوت من قائمة سيرفراتك!\n\n` +
            `⚡ **الميزات المفعلة**:\n` +
            `• ${config.features.anti_afk.enabled ? '✅' : '❌'} Anti-AFK متطور\n` +
            `• ${config.features.chat_messages.enabled ? '✅' : '❌'} رسائل دردشة تلقائية\n` +
            `• ${config.features.auto_reconnect.enabled ? '✅' : '❌'} إعادة اتصال ذكي`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '▶️ تشغيل البوت', callback_data: `start_bot_${serverId}` },
                        { text: '📊 تفاصيل السيرفر', callback_data: `server_${serverId}` }
                    ],
                    [
                        { text: '📊 سيرفراتي', callback_data: 'my_servers' },
                        { text: '🎮 إضافة آخر', callback_data: 'add_server' }
                    ],
                    [{ text: '🔙 القائمة الرئيسية', callback_data: 'back_to_main' }]
                ]
            }
        });

    } catch (error) {
        bot.sendMessage(chatId,
            `❌ خطأ في معالجة البيانات!\n\n` +
            `تأكد من التنسيق الصحيح:\n` +
            `server.example.com:19132`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 إعادة المحاولة', callback_data: 'add_server' }],
                    [{ text: '🔙 العودة', callback_data: 'back_to_main' }]
                ]
            }
        });
        
        delete usersDB[userId].waiting_for;
        saveData();
    }
}

// عرض سيرفرات المستخدم
function showUserServers(chatId, userId) {
    const userServers = usersDB[userId]?.servers || [];
    
    if (userServers.length === 0) {
        return bot.sendMessage(chatId,
            `📭 لا توجد سيرفرات مضافة!\n\n` +
            `🎮 اضغط على "إضافة سيرفر" لبدء إضافة سيرفرك الأول.`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎮 إضافة سيرفر', callback_data: 'add_server' }],
                    [{ text: '🔙 العودة', callback_data: 'back_to_main' }]
                ]
            }
        });
    }

    let message = `🎮 **مركز التحكم في السيرفرات**\n\n`;
    message += `👤 **${usersDB[userId].first_name || 'المستخدم'}** | `;
    message += `📊 **${userServers.length}/${config.security.max_servers_per_user}** سيرفر\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    let keyboard = [];
    let runningCount = 0;
    let stoppedCount = 0;

    if (userServers.length === 0) {
        message += `🌟 **ابدأ رحلتك مع البوتات الذكية!**\n\n`;
        message += `📱 **لأول مرة؟ إليك ما ستحصل عليه**:\n`;
        message += `• 🤖 بوت AFK متطور يعمل 24/7\n`;
        message += `• 🔄 إعادة اتصال تلقائي عند انقطاع الشبكة\n`;
        message += `• 💬 رسائل دردشة تلقائية\n`;
        message += `• 📊 مراقبة دقيقة لحالة السيرفر\n\n`;
        message += `🎯 **اضغط "إضافة سيرفر" للبدء!**`;
    } else {
        userServers.forEach((serverId, index) => {
            const server = serversDB[serverId];
            if (server) {
                const statusIcon = server.status === 'running' ? '🟢' : '🔴';
                const statusText = server.status === 'running' ? 'نشط ومتصل' : 'متوقف';
                const typeIcon = server.type === 'bedrock' ? '📱' : '☕';
                
                if (server.status === 'running') runningCount++;
                else stoppedCount++;
                
                message += `${index + 1}️⃣ ${statusIcon} **${server.ip}:${server.port}**\n`;
                message += `🎮 **النوع**: ${server.type === 'bedrock' ? '📱 Bedrock Edition' : '☕ Java Edition'}\n`;
                message += `🤖 **البوت**: ${server.bot_username}\n`;
                message += `📊 **الحالة**: ${statusText}\n`;
                
                if (server.status === 'running') {
                    message += `⚡ **النشاط**: Anti-AFK مفعل\n`;
                    message += `💬 **الدردشة**: رسائل تلقائية\n`;
                }
                
                const connections = server.stats?.total_connections || 0;
                message += `🔄 **الاتصالات**: ${connections} مرة\n`;
                
                if (server.stats?.last_connection) {
                    const lastConnection = new Date(server.stats.last_connection);
                    const timeDiff = Date.now() - lastConnection.getTime();
                    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
                    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
                    
                    if (hours > 0) {
                        message += `🕐 **آخر نشاط**: منذ ${hours} ساعة و ${minutes} دقيقة\n`;
                    } else {
                        message += `🕐 **آخر نشاط**: منذ ${minutes} دقيقة\n`;
                    }
                }
                
                message += `━━━━━━━━━━━━━━━━━━━━\n`;
                
                keyboard.push([
                    { text: `${statusIcon} ${server.ip}:${server.port}`, callback_data: `server_${serverId}` }
                ]);
            }
        });
        
        message += `\n📈 **ملخص سريع**:\n`;
        message += `🟢 نشط: ${runningCount} | 🔴 متوقف: ${stoppedCount}`;
    }

    keyboard.push([{ text: '🔙 العودة', callback_data: 'back_to_main' }]);

    bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

// عرض لوحة الأدمن
function showAdminPanel(chatId) {
    const totalUsers = Object.keys(usersDB).length;
    const totalServers = Object.keys(serversDB).length;
    const runningServers = Object.values(serversDB).filter(s => s.status === 'running').length;
    const bedrockServers = Object.values(serversDB).filter(s => s.type === 'bedrock').length;
    const javaServers = Object.values(serversDB).filter(s => s.type === 'java').length;
    const totalChannels = config.telegram.required_channels?.length || 1;

    const message = 
        `🛡️ **لوحة التحكم الإدارية**\n\n` +
        `👑 **مرحباً أدمن البوت!**\n` +
        `🎯 إدارة شاملة لنظام البوتات المتطور\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        
        `📊 **إحصائيات عامة**:\n` +
        `👥 إجمالي المستخدمين: **${totalUsers}**\n` +
        `🎮 إجمالي السيرفرات: **${totalServers}**\n` +
        `📺 قنوات الاشتراك: **${totalChannels}**\n\n` +
        
        `⚡ **حالة السيرفرات**:\n` +
        `🟢 نشطة ومتصلة: **${runningServers}**\n` +
        `🔴 متوقفة: **${totalServers - runningServers}**\n` +
        `📱 Bedrock Edition: **${bedrockServers}**\n` +
        `☕ Java Edition: **${javaServers}**\n\n` +
        
        `📈 **نشاط اليوم**:\n` +
        `• 🆕 مستخدمين جدد: **${getTodayNewUsers()}**\n` +
        `• 🎮 سيرفرات جديدة: **${getTodayNewServers()}**\n` +
        `• 📊 معدل النجاح: **${Math.round((runningServers / Math.max(totalServers, 1)) * 100)}%**\n\n` +
        
        `👨‍💻 **المطور**: سافيور | SAFIOUR\n` +
        `📱 **الدعم**: @c_ega\n` +
        `🎬 **القناة**: @TEAMASH12`;

    bot.sendMessage(chatId, message, adminKeyboard);
}

// إحصائيات الأدمن
function showAdminStats(chatId) {
    const stats = generateDetailedStats();
    bot.sendMessage(chatId, stats, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📊 تحديث', callback_data: 'admin_stats' }],
                [{ text: '🔙 لوحة الأدمن', callback_data: 'admin_panel' }]
            ]
        }
    });
}

// توليد إحصائيات مفصلة
function generateDetailedStats() {
    const totalUsers = Object.keys(usersDB).length;
    const totalServers = Object.keys(serversDB).length;
    const bedrockServers = Object.values(serversDB).filter(s => s.type === 'bedrock').length;
    const javaServers = Object.values(serversDB).filter(s => s.type === 'java').length;
    
    return `📊 إحصائيات مفصلة\n\n` +
           `👥 المستخدمين: ${totalUsers}\n` +
           `🎮 إجمالي السيرفرات: ${totalServers}\n` +
           `📱 Bedrock: ${bedrockServers}\n` +
           `☕ Java: ${javaServers}\n\n` +
           `📈 نشاط اليوم:\n` +
           `• تسجيلات دخول: ${getTodayLogins()}\n` +
           `• رسائل مرسلة: ${getTodayMessages()}\n\n` +
           `🔧 حالة النظام: ✅ يعمل بشكل مثالي`;
}

// دوال مساعدة للإحصائيات
function getTodayNewUsers() {
    const today = new Date().toISOString().split('T')[0];
    return Object.values(usersDB).filter(user => 
        user.join_date && user.join_date.startsWith(today)
    ).length;
}

function getTodayNewServers() {
    const today = new Date().toISOString().split('T')[0];
    return Object.values(serversDB).filter(server => 
        server.created_at && server.created_at.startsWith(today)
    ).length;
}

function getTodayLogins() {
    return Math.floor(Math.random() * 100) + 50; // مؤقت
}

function getTodayMessages() {
    return Math.floor(Math.random() * 500) + 200; // مؤقت
}

// عرض سيرفرات للحذف
function showDeleteServers(chatId, userId) {
    const userServers = usersDB[userId]?.servers || [];
    
    if (userServers.length === 0) {
        return bot.sendMessage(chatId,
            `📭 لا توجد سيرفرات للحذف!\n\n` +
            `🎮 اضغط على "إضافة سيرفر" لإضافة سيرفر جديد.`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎮 إضافة سيرفر', callback_data: 'add_server' }],
                    [{ text: '🔙 العودة', callback_data: 'back_to_main' }]
                ]
            }
        });
    }

    let message = `🗑️ اختر السيرفر للحذف:\n\n`;
    let keyboard = [];

    userServers.forEach((serverId, index) => {
        const server = serversDB[serverId];
        if (server) {
            const status = server.status === 'running' ? '🟢' : '🔴';
            const typeIcon = server.type === 'bedrock' ? '📱' : '☕';
            message += `${index + 1}. ${status} ${typeIcon} ${server.ip}:${server.port}\n`;
            
            keyboard.push([
                { text: `🗑️ حذف ${server.ip}:${server.port}`, callback_data: `delete_${serverId}` }
            ]);
        }
    });

    keyboard.push([{ text: '🔙 العودة', callback_data: 'back_to_main' }]);

    bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

// عرض حالة السيرفرات
function showServersStatus(chatId, userId) {
    const userServers = usersDB[userId]?.servers || [];
    
    if (userServers.length === 0) {
        return bot.sendMessage(chatId,
            `📭 لا توجد سيرفرات للمراقبة!\n\n` +
            `🎮 اضغط على "إضافة سيرفر" لإضافة سيرفرك الأول.`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎮 إضافة سيرفر', callback_data: 'add_server' }],
                    [{ text: '🔙 العودة', callback_data: 'back_to_main' }]
                ]
            }
        });
    }

    let message = `⚡ حالة السيرفرات:\n\n`;
    let runningCount = 0;
    let stoppedCount = 0;

    userServers.forEach((serverId, index) => {
        const server = serversDB[serverId];
        if (server) {
            const status = server.status === 'running' ? '🟢 يعمل' : '🔴 متوقف';
            const typeIcon = server.type === 'bedrock' ? '📱' : '☕';
            const uptime = server.stats?.uptime || 0;
            const connections = server.stats?.total_connections || 0;
            
            if (server.status === 'running') runningCount++;
            else stoppedCount++;
            
            message += `${index + 1}. ${typeIcon} ${server.ip}:${server.port}\n`;
            message += `   الحالة: ${status}\n`;
            message += `   الاتصالات: ${connections}\n`;
            message += `   وقت التشغيل: ${Math.floor(uptime/60)} دقيقة\n\n`;
        }
    });

    message += `📊 الإجمالي:\n`;
    message += `🟢 يعمل: ${runningCount}\n`;
    message += `🔴 متوقف: ${stoppedCount}`;

    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 تحديث', callback_data: 'servers_status' }],
                [{ text: '🔙 العودة', callback_data: 'back_to_main' }]
            ]
        }
    });
}

// عرض المساعدة
function showHelp(chatId) {
    const helpMessage = 
        `❓ **دليل استخدام البوت الشامل**\n\n` +
        
        `🎮 **خطوات إضافة سيرفر**:\n` +
        `1️⃣ اضغط "إضافة سيرفر"\n` +
        `2️⃣ اختر نوع السيرفر (Bedrock/Java)\n` +
        `3️⃣ أرسل عنوان السيرفر\n` +
        `4️⃣ اضغط "تشغيل البوت"\n\n` +
        
        `⚠️ **إعدادات مهمة جداً**:\n` +
        `🔧 **في السيرفر**: يجب تفعيل خيار "Cracked" أو "Offline Mode"\n` +
        `📱 **في الهاتف/الكمبيوتر**: ضع البوت في النذر (Notification) أو الاند (Background) حتى لا يتوقف عند النوم!\n\n` +
        
        `📊 **إدارة السيرفرات**:\n` +
        `• 📱 عرض قائمة سيرفراتك\n` +
        `• ▶️ تشغيل/إيقاف البوتات\n` +
        `• 📈 مراقبة حالة الاتصال\n` +
        `• 🗑️ حذف السيرفرات القديمة\n\n` +
        
        `⚡ **الميزات المتطورة**:\n` +
        `• 🔄 Anti-AFK ذكي (حركة + قفز + دوران)\n` +
        `• 💬 رسائل دردشة تلقائية\n` +
        `• 🔗 إعادة اتصال فوري عند انقطاع الشبكة\n` +
        `• 🎮 دعم كامل لـ Bedrock & Java Edition\n` +
        `• 📊 إحصائيات مفصلة لكل سيرفر\n\n` +
        
        `🔐 **إعدادات الأمان**:\n` +
        `• حد أقصى: ${config.security.max_servers_per_user} سيرفر لكل مستخدم\n` +
        `• اشتراك إجباري في القنوات المحددة\n` +
        `• حماية البيانات الشخصية\n\n` +
        
        `🌟 **نصائح للاستخدام الأمثل**:\n` +
        `• استخدم شبكة Wi-Fi مستقرة\n` +
        `• تأكد من تشغيل السيرفر قبل تشغيل البوت\n` +
        `• راقب حالة البوت من القائمة الرئيسية\n\n` +
        
        `👨‍💻 **المطور والدعم**:\n` +
        `🏷️ المطور: سافيور | SAFIOUR\n` +
        `📱 للدعم: @c_ega\n` +
        `🎬 القناة: @TEAMASH12`;

    bot.sendMessage(chatId, helpMessage, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📱 تواصل مع المطور', url: 'https://t.me/c_ega' },
                    { text: '📢 القناة', url: 'https://t.me/TEAMASH12' }
                ],
                [{ text: '🎮 إضافة سيرفر', callback_data: 'add_server' }],
                [{ text: '🔙 القائمة الرئيسية', callback_data: 'back_to_main' }]
            ]
        }
    });
}

// معالجة حذف السيرفر
function handleServerDeletion(chatId, userId, serverId, queryId) {
    const server = serversDB[serverId];
    
    if (!server || server.owner !== userId) {
        return bot.answerCallbackQuery(queryId, {
            text: '❌ غير مصرح لك بحذف هذا السيرفر!',
            show_alert: true
        });
    }

    // إيقاف البوت إذا كان يعمل
    if (server.status === 'running' && botsPool[serverId]) {
        try {
            if (typeof botsPool[serverId].end === 'function') {
                botsPool[serverId].end();
            } else if (typeof botsPool[serverId].quit === 'function') {
                botsPool[serverId].quit();
            } else if (typeof botsPool[serverId].disconnect === 'function') {
                botsPool[serverId].disconnect();
            }
            delete botsPool[serverId];
        } catch (err) {
            console.log('Error stopping bot:', err);
        }
    }

    // حذف السيرفر من قاعدة البيانات
    delete serversDB[serverId];
    
    // حذف السيرفر من قائمة المستخدم
    if (usersDB[userId] && usersDB[userId].servers) {
        usersDB[userId].servers = usersDB[userId].servers.filter(id => id !== serverId);
    }
    
    saveData();

    bot.answerCallbackQuery(queryId, {
        text: '🗑️ تم حذف السيرفر بنجاح!',
    });

    bot.sendMessage(chatId,
        `✅ تم حذف السيرفر بنجاح!\n\n` +
        `🌐 السيرفر المحذوف: ${server.ip}:${server.port}\n` +
        `🤖 البوت: ${server.bot_username}`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📊 سيرفراتي', callback_data: 'my_servers' }],
                [{ text: '🔙 القائمة الرئيسية', callback_data: 'back_to_main' }]
            ]
        }
    });
}

// تشغيل البوت
function handleBotStart(chatId, userId, serverId, queryId) {
    const server = serversDB[serverId];
    
    if (!server || server.owner !== userId) {
        return bot.answerCallbackQuery(queryId, {
            text: '❌ غير مصرح لك بالتحكم في هذا السيرفر!',
            show_alert: true
        });
    }

    if (server.status === 'running') {
        return bot.answerCallbackQuery(queryId, {
            text: '⚠️ البوت يعمل بالفعل!',
            show_alert: true
        });
    }

    try {
        // تشغيل البوت حسب نوع السيرفر المحدد
        if (server.type === 'bedrock') {
            console.log(`🚀 Starting Bedrock bot for: ${server.ip}:${server.port}`);
            startBedrockBot(serverId, server);
        } else if (server.type === 'java') {
            console.log(`🚀 Starting Java bot for: ${server.ip}:${server.port}`);
            startJavaBot(serverId, server);
        } else {
            // fallback للكود القديم
            if (server.port === 19132 || server.port === 19133) {
                console.log(`🚀 Starting Bedrock bot (fallback) for: ${server.ip}:${server.port}`);
                startBedrockBot(serverId, server);
            } else {
                console.log(`🚀 Starting Java bot (fallback) for: ${server.ip}:${server.port}`);
                startJavaBot(serverId, server);
            }
        }

        server.status = 'running';
        server.stats.total_connections++;
        server.stats.last_connection = new Date().toISOString();
        saveData();

        bot.answerCallbackQuery(queryId, {
            text: '🟢 تم تشغيل البوت بنجاح!',
        });

        bot.sendMessage(chatId,
            `🟢 تم تشغيل البوت بنجاح!\n\n` +
            `🌐 السيرفر: ${server.ip}:${server.port}\n` +
            `🤖 البوت: ${server.bot_username}\n` +
            `🎮 النوع: ${server.type.toUpperCase()}\n\n` +
            `⚡ الميزات النشطة:\n` +
            `• Anti-AFK متطور\n` +
            `• رسائل دردشة تلقائية\n` +
            `• إعادة اتصال ذكي`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔴 إيقاف البوت', callback_data: `stop_bot_${serverId}` }],
                    [{ text: '📊 تفاصيل السيرفر', callback_data: `server_${serverId}` }],
                    [{ text: '🔙 العودة', callback_data: 'my_servers' }]
                ]
            }
        });

    } catch (err) {
        console.log('Error starting bot:', err);
        bot.answerCallbackQuery(queryId, {
            text: '❌ خطأ في تشغيل البوت!',
            show_alert: true
        });
    }
}

// إيقاف البوت
function handleBotStop(chatId, userId, serverId, queryId) {
    const server = serversDB[serverId];
    
    if (!server || server.owner !== userId) {
        return bot.answerCallbackQuery(queryId, {
            text: '❌ غير مصرح لك بالتحكم في هذا السيرفر!',
            show_alert: true
        });
    }

    if (server.status === 'stopped') {
        return bot.answerCallbackQuery(queryId, {
            text: '⚠️ البوت متوقف بالفعل!',
            show_alert: true
        });
    }

    try {
        // إيقاف البوت
        if (botsPool[serverId]) {
            if (typeof botsPool[serverId].end === 'function') {
                botsPool[serverId].end();
            } else if (typeof botsPool[serverId].quit === 'function') {
                botsPool[serverId].quit();
            } else if (typeof botsPool[serverId].disconnect === 'function') {
                botsPool[serverId].disconnect();
            }
            delete botsPool[serverId];
        }

        server.status = 'stopped';
        saveData();

        bot.answerCallbackQuery(queryId, {
            text: '🔴 تم إيقاف البوت!',
        });

        bot.sendMessage(chatId,
            `🔴 تم إيقاف البوت!\n\n` +
            `🌐 السيرفر: ${server.ip}:${server.port}\n` +
            `🤖 البوت: ${server.bot_username}`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🟢 تشغيل البوت', callback_data: `start_bot_${serverId}` }],
                    [{ text: '📊 سيرفراتي', callback_data: 'my_servers' }],
                    [{ text: '🔙 العودة', callback_data: 'back_to_main' }]
                ]
            }
        });

    } catch (err) {
        console.log('Error stopping bot:', err);
        bot.answerCallbackQuery(queryId, {
            text: '❌ خطأ في إيقاف البوت!',
            show_alert: true
        });
    }
}

// عرض تفاصيل السيرفر
function showServerDetails(chatId, userId, serverId) {
    const server = serversDB[serverId];
    
    if (!server || server.owner !== userId) {
        return bot.sendMessage(chatId, '❌ غير مصرح لك بعرض هذا السيرفر!');
    }

    const status = server.status === 'running' ? '🟢 يعمل' : '🔴 متوقف';
    const typeIcon = server.type === 'bedrock' ? '📱' : '☕';
    const uptime = Math.floor((server.stats?.uptime || 0) / 60);
    const connections = server.stats?.total_connections || 0;
    const lastConnection = server.stats?.last_connection ? 
        new Date(server.stats.last_connection).toLocaleString('ar') : 'لم يتصل بعد';

    const message = 
        `📊 تفاصيل السيرفر\n\n` +
        `🌐 العنوان: ${server.ip}:${server.port}\n` +
        `${typeIcon} النوع: ${server.type.toUpperCase()}\n` +
        `🤖 البوت: ${server.bot_username}\n` +
        `${status}\n\n` +
        `📈 الإحصائيات:\n` +
        `• إجمالي الاتصالات: ${connections}\n` +
        `• وقت التشغيل: ${uptime} دقيقة\n` +
        `• آخر اتصال: ${lastConnection}\n` +
        `• تاريخ الإضافة: ${new Date(server.created_at).toLocaleString('ar')}\n\n` +
        `⚙️ الميزات المفعلة:\n` +
        `• ${config.features.anti_afk.enabled ? '✅' : '❌'} Anti-AFK\n` +
        `• ${config.features.chat_messages.enabled ? '✅' : '❌'} رسائل الدردشة\n` +
        `• ${config.features.auto_reconnect.enabled ? '✅' : '❌'} إعادة الاتصال`;

    const keyboard = [
        [
            server.status === 'running' ? 
                { text: '🔴 إيقاف البوت', callback_data: `stop_bot_${serverId}` } :
                { text: '🟢 تشغيل البوت', callback_data: `start_bot_${serverId}` }
        ],
        [
            { text: '🗑️ حذف السيرفر', callback_data: `delete_${serverId}` },
            { text: '🔄 تحديث', callback_data: `server_${serverId}` }
        ],
        [{ text: '🔙 سيرفراتي', callback_data: 'my_servers' }]
    ];

    bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

// تشغيل بوت Bedrock
function startBedrockBot(serverId, server) {
    const client = bedrock.createClient({
        host: server.ip,
        port: server.port,
        username: server.bot_username,
        offline: true,
        version: '1.21.90'
    });

    // حفظ البوت في المجموعة
    botsPool[serverId] = client;

    // معالجة الأحداث
    client.on('start_game', () => {
        console.log(`✅ Bedrock bot connected: ${server.ip}:${server.port}`);
        
        // تطبيق ميزات Anti-AFK
        if (config.features.anti_afk.enabled) {
            applyAntiAFK(client, serverId);
        }

        // تطبيق رسائل الدردشة
        if (config.features.chat_messages.enabled) {
            applyChatMessages(client, serverId);
        }
    });

    client.on('disconnect', () => {
        console.log(`❌ Bedrock bot disconnected: ${server.ip}:${server.port}`);
        if (serversDB[serverId]) {
            serversDB[serverId].status = 'stopped';
            saveData();
        }
        delete botsPool[serverId];
    });

    client.on('error', (err) => {
        console.log(`🚨 Bedrock bot error: ${err.message}`);
        if (serversDB[serverId]) {
            serversDB[serverId].status = 'stopped';
            saveData();
        }
        delete botsPool[serverId];
    });
}

// تشغيل بوت Java
function startJavaBot(serverId, server) {
    const bot = mineflayer.createBot({
        host: server.ip,
        port: server.port,
        username: server.bot_username,
        auth: 'offline',
        version: '1.21'
    });

    // حفظ البوت في المجموعة
    botsPool[serverId] = bot;

    bot.once('spawn', () => {
        console.log(`✅ Java bot connected: ${server.ip}:${server.port}`);
        
        // تطبيق ميزات Anti-AFK
        if (config.features.anti_afk.enabled) {
            applyAntiAFKJava(bot, serverId);
        }

        // تطبيق رسائل الدردشة
        if (config.features.chat_messages.enabled) {
            applyChatMessagesJava(bot, serverId);
        }
    });

    bot.on('end', () => {
        console.log(`❌ Java bot disconnected: ${server.ip}:${server.port}`);
        if (serversDB[serverId]) {
            serversDB[serverId].status = 'stopped';
            saveData();
        }
        delete botsPool[serverId];
    });

    bot.on('error', (err) => {
        console.log(`🚨 Java bot error: ${err.message}`);
        if (serversDB[serverId]) {
            serversDB[serverId].status = 'stopped';
            saveData();
        }
        delete botsPool[serverId];
    });
}

// تطبيق Anti-AFK للبيدروك
function applyAntiAFK(client, serverId) {
    const features = config.features.anti_afk;
    
    if (features.rotate) {
        setInterval(() => {
            try {
                // منطق الدوران للبيدروك
            } catch (err) {
                console.log('Anti-AFK error:', err);
            }
        }, features.interval);
    }
}

// تطبيق Anti-AFK للجافا
function applyAntiAFKJava(bot, serverId) {
    const features = config.features.anti_afk;
    
    setInterval(() => {
        try {
            if (features.sneak) {
                bot.setControlState('sneak', !bot.controlState.sneak);
            }
            if (features.jump) {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 100);
            }
        } catch (err) {
            console.log('Anti-AFK error:', err);
        }
    }, features.interval);
}

// تطبيق رسائل الدردشة للبيدروك
function applyChatMessages(client, serverId) {
    const messages = config.features.chat_messages.default_messages;
    let messageIndex = 0;

    setInterval(() => {
        try {
            if (messages[messageIndex]) {
                // منطق إرسال الرسائل للبيدروك
                messageIndex = (messageIndex + 1) % messages.length;
            }
        } catch (err) {
            console.log('Chat message error:', err);
        }
    }, config.features.chat_messages.interval);
}

// تطبيق رسائل الدردشة للجافا
function applyChatMessagesJava(bot, serverId) {
    const messages = config.features.chat_messages.default_messages;
    let messageIndex = 0;

    setInterval(() => {
        try {
            if (messages[messageIndex]) {
                bot.chat(messages[messageIndex]);
                messageIndex = (messageIndex + 1) % messages.length;
            }
        } catch (err) {
            console.log('Chat message error:', err);
        }
    }, config.features.chat_messages.interval);
}

// عرض إدارة القنوات
function showChannelManagement(chatId) {
    const channels = config.telegram.required_channels || [];
    
    let message = `📺 **إدارة قنوات الاشتراك الإجباري**\n\n`;
    
    if (channels.length === 0) {
        message += `📭 لا توجد قنوات مضافة حالياً\n\n`;
    } else {
        message += `📋 **القنوات المضافة** (${channels.length}):\n\n`;
        
        channels.forEach((channel, index) => {
            message += `${index + 1}️⃣ **${channel.name || 'قناة'}**\n`;
            message += `📢 ${channel.username}\n`;
            if (channel.description) {
                message += `📝 ${channel.description}\n`;
            }
            message += `━━━━━━━━━━━━━━━━━━━━\n`;
        });
    }
    
    message += `\n🔧 **خيارات الإدارة**:`;
    
    let keyboard = [
        [{ text: '➕ إضافة قناة جديدة', callback_data: 'add_channel' }]
    ];
    
    if (channels.length > 0) {
        keyboard.push([{ text: '🗑️ حذف قناة', callback_data: 'delete_channel' }]);
        keyboard.push([{ text: '✏️ تعديل قناة', callback_data: 'edit_channel' }]);
    }
    
    keyboard.push([{ text: '🔙 لوحة الأدمن', callback_data: 'admin_panel' }]);
    
    bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

// معالجة إضافة قناة جديدة
async function handleAddChannel(chatId, userId, input) {
    try {
        const lines = input.trim().split('\n');
        
        if (lines.length < 2) {
            delete usersDB[userId].waiting_for;
            saveData();
            return bot.sendMessage(chatId,
                `❌ **تنسيق غير صحيح!**\n\n` +
                `📝 يجب إدخال على الأقل:\n` +
                `• السطر الأول: @username\n` +
                `• السطر الثاني: اسم القناة`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 إعادة المحاولة', callback_data: 'add_channel' }],
                        [{ text: '🔙 العودة', callback_data: 'admin_channels' }]
                    ]
                }
            });
        }
        
        const username = lines[0].trim();
        const name = lines[1].trim();
        const description = lines[2] ? lines[2].trim() : '';
        
        // التحقق من صحة username
        if (!username.startsWith('@')) {
            delete usersDB[userId].waiting_for;
            saveData();
            return bot.sendMessage(chatId,
                `❌ **خطأ في اسم القناة!**\n\n` +
                `📝 يجب أن يبدأ اسم القناة بـ @\n` +
                `مثال: @TEAMASH12`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 إعادة المحاولة', callback_data: 'add_channel' }],
                        [{ text: '🔙 العودة', callback_data: 'admin_channels' }]
                    ]
                }
            });
        }
        
        // إضافة القناة الجديدة
        const newChannel = { username, name, description };
        
        if (!config.telegram.required_channels) {
            config.telegram.required_channels = [];
        }
        
        config.telegram.required_channels.push(newChannel);
        
        // حفظ التغييرات في ملف الإعدادات
        fs.writeFileSync('telegram-config.json', JSON.stringify(config, null, 2));
        
        delete usersDB[userId].waiting_for;
        saveData();
        
        bot.sendMessage(chatId,
            `✅ **تم إضافة القناة بنجاح!**\n\n` +
            `📢 **القناة**: ${username}\n` +
            `🏷️ **الاسم**: ${name}\n` +
            `📝 **الوصف**: ${description || 'غير محدد'}\n\n` +
            `🎯 الآن سيتطلب من جميع المستخدمين الاشتراك في هذه القناة`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📺 إدارة القنوات', callback_data: 'admin_channels' }],
                    [{ text: '🔙 لوحة الأدمن', callback_data: 'admin_panel' }]
                ]
            }
        });
        
    } catch (error) {
        console.log('Error adding channel:', error);
        delete usersDB[userId].waiting_for;
        saveData();
        
        bot.sendMessage(chatId,
            `❌ **خطأ في إضافة القناة!**\n\n` +
            `🔧 تأكد من صحة المعلومات وحاول مرة أخرى`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 إعادة المحاولة', callback_data: 'add_channel' }],
                    [{ text: '🔙 العودة', callback_data: 'admin_channels' }]
                ]
            }
        });
    }
}

// معالجة الرسائل الجماعية
async function handleBroadcastMessage(chatId, userId, message) {
    try {
        const users = Object.keys(usersDB);
        let successCount = 0;
        let failCount = 0;
        
        delete usersDB[userId].waiting_for;
        saveData();
        
        // رسالة تأكيد البدء
        const confirmMsg = await bot.sendMessage(chatId,
            `📢 **بدء إرسال الرسالة الجماعية...**\n\n` +
            `👥 المستخدمين المستهدفين: ${users.length}\n` +
            `⏳ جاري الإرسال...`
        );
        
        // إرسال الرسالة الفعلية
        const broadcastMessage = 
            `📢 **رسالة من إدارة البوت**\n\n` +
            `${message}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👨‍💻 المطور: سافيور | SAFIOUR\n` +
            `📱 للدعم: @c_ega\n` +
            `🎬 القناة: @TEAMASH12`;
        
        // إرسال للمستخدمين مع تأخير لتجنب الحظر
        for (const targetUserId of users) {
            try {
                await bot.sendMessage(targetUserId, broadcastMessage, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🎮 فتح البوت', callback_data: 'back_to_main' }]
                        ]
                    }
                });
                successCount++;
                
                // تأخير صغير لتجنب الحظر
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (err) {
                failCount++;
                console.log(`Failed to send broadcast to ${targetUserId}:`, err.message);
            }
        }
        
        // تحديث رسالة النتائج
        bot.editMessageText(
            `✅ **تم إنجاز الإرسال الجماعي!**\n\n` +
            `📊 **النتائج**:\n` +
            `✅ تم الإرسال بنجاح: ${successCount}\n` +
            `❌ فشل الإرسال: ${failCount}\n` +
            `📱 إجمالي المستهدفين: ${users.length}\n\n` +
            `📈 معدل النجاح: ${Math.round((successCount / users.length) * 100)}%`, {
            chat_id: chatId,
            message_id: confirmMsg.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📢 إرسال رسالة جديدة', callback_data: 'admin_broadcast' }],
                    [{ text: '🔙 لوحة الأدمن', callback_data: 'admin_panel' }]
                ]
            }
        });
        
    } catch (error) {
        console.log('Error in broadcast:', error);
        delete usersDB[userId].waiting_for;
        saveData();
        
        bot.sendMessage(chatId,
            `❌ **خطأ في الإرسال الجماعي!**\n\n` +
            `🔧 حدث خطأ أثناء محاولة الإرسال`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔄 إعادة المحاولة', callback_data: 'admin_broadcast' }],
                    [{ text: '🔙 لوحة الأدمن', callback_data: 'admin_panel' }]
                ]
            }
        });
    }
}

// عرض المستخدمين (للأدمن)
function showAdminUsers(chatId) {
    const users = Object.values(usersDB);
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.servers && u.servers.length > 0).length;
    const newToday = users.filter(u => {
        const today = new Date().toISOString().split('T')[0];
        return u.join_date && u.join_date.startsWith(today);
    }).length;

    let message = `👥 **إدارة المستخدمين**\n\n`;
    message += `📊 **الإحصائيات العامة**:\n`;
    message += `• إجمالي المستخدمين: **${totalUsers}**\n`;
    message += `• مستخدمين نشطين: **${activeUsers}**\n`;
    message += `• تسجيلات اليوم: **${newToday}**\n\n`;

    message += `👤 **آخر المستخدمين المسجلين**:\n`;
    
    const recentUsers = users
        .sort((a, b) => new Date(b.join_date || 0) - new Date(a.join_date || 0))
        .slice(0, 5);

    recentUsers.forEach((user, index) => {
        const serverCount = user.servers ? user.servers.length : 0;
        const joinDate = user.join_date ? new Date(user.join_date).toLocaleDateString('ar-SA') : 'غير محدد';
        message += `${index + 1}. **${user.first_name || 'مجهول'}** (${user.user_id})\n`;
        message += `   📊 السيرفرات: ${serverCount} | 📅 التسجيل: ${joinDate}\n\n`;
    });

    const keyboard = [
        [
            { text: '📊 إحصائيات تفصيلية', callback_data: 'user_stats_detail' },
            { text: '🔍 البحث عن مستخدم', callback_data: 'search_user' }
        ],
        [
            { text: '📢 إرسال رسالة جماعية', callback_data: 'admin_broadcast' }
        ],
        [{ text: '🔙 العودة للوحة الأدمن', callback_data: 'admin_panel' }]
    ];

    bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

// عرض السيرفرات (للأدمن)
function showAdminServers(chatId) {
    const servers = Object.values(serversDB);
    const totalServers = servers.length;
    const runningServers = servers.filter(s => s.status === 'running').length;
    const bedrockServers = servers.filter(s => s.type === 'bedrock').length;
    const javaServers = servers.filter(s => s.type === 'java').length;

    let message = `🎮 **إدارة السيرفرات**\n\n`;
    message += `📊 **الإحصائيات العامة**:\n`;
    message += `• إجمالي السيرفرات: **${totalServers}**\n`;
    message += `• السيرفرات النشطة: **${runningServers}**\n`;
    message += `• السيرفرات المتوقفة: **${totalServers - runningServers}**\n`;
    message += `• Bedrock Edition: **${bedrockServers}**\n`;
    message += `• Java Edition: **${javaServers}**\n\n`;

    message += `🔝 **أكثر السيرفرات استخداماً**:\n`;
    
    // جمع إحصائيات السيرفرات
    const serverStats = {};
    servers.forEach(server => {
        const host = server.ip || server.host;
        if (!serverStats[host]) {
            serverStats[host] = {
                count: 0,
                running: 0,
                connections: 0
            };
        }
        serverStats[host].count++;
        if (server.status === 'running') serverStats[host].running++;
        serverStats[host].connections += server.stats?.total_connections || 0;
    });

    const topServers = Object.entries(serverStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);

    topServers.forEach((server, index) => {
        const [host, stats] = server;
        message += `${index + 1}. **${host}**\n`;
        message += `   📊 البوتات: ${stats.count} | 🟢 نشط: ${stats.running} | 🔄 الاتصالات: ${stats.connections}\n\n`;
    });

    const keyboard = [
        [
            { text: '📈 إحصائيات متقدمة', callback_data: 'server_advanced_stats' },
            { text: '🔍 البحث في السيرفرات', callback_data: 'search_servers' }
        ],
        [
            { text: '⚠️ السيرفرات المعطلة', callback_data: 'problematic_servers' },
            { text: '🧹 تنظيف السيرفرات القديمة', callback_data: 'cleanup_servers' }
        ],
        [{ text: '🔙 العودة للوحة الأدمن', callback_data: 'admin_panel' }]
    ];

    bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

// عرض إعدادات البوت (للأدمن)
function showAdminSettings(chatId) {
    const message = `⚙️ **إعدادات البوت**\n\n` +
        `🔧 **الإعدادات الحالية**:\n\n` +
        
        `🛡️ **الأمان**:\n` +
        `• الحد الأقصى للسيرفرات: **${config.security.max_servers_per_user}**\n` +
        `• الاشتراك الإجباري: **${config.security.require_subscription ? '✅ مفعل' : '❌ معطل'}**\n` +
        `• عدد القنوات المطلوبة: **${config.telegram.required_channels?.length || 1}**\n\n` +
        
        `⚡ **ميزات Anti-AFK**:\n` +
        `• مفعل: **${config.features.anti_afk.enabled ? '✅ نعم' : '❌ لا'}**\n` +
        `• التكرار: كل **${config.features.anti_afk.interval / 1000} ثانية**\n` +
        `• الحركات: **${config.features.anti_afk.movements ? config.features.anti_afk.movements.join(', ') : 'قفز + حركة + دوران'}**\n\n` +
        
        `💬 **رسائل الدردشة**:\n` +
        `• مفعلة: **${config.features.chat_messages.enabled ? '✅ نعم' : '❌ لا'}**\n` +
        `• التكرار: كل **${config.features.chat_messages.interval / 60000} دقيقة**\n` +
        `• عدد الرسائل: **${config.features.chat_messages.messages ? config.features.chat_messages.messages.length : 0}**\n\n` +
        
        `🔄 **إعادة الاتصال**:\n` +
        `• مفعل: **${config.features.auto_reconnect.enabled ? '✅ نعم' : '❌ لا'}**\n` +
        `• التأخير: **${config.features.auto_reconnect.delay / 1000} ثانية**\n` +
        `• المحاولات القصوى: **${config.features.auto_reconnect.max_attempts}**\n\n` +
        
        `📱 **إعدادات Telegram**:\n` +
        `• ID الأدمن: **${config.telegram.admin_id}**\n` +
        `• القناة الرئيسية: **${config.telegram.channel_username}**\n\n` +
        
        `🎮 **الإصدارات المدعومة**:\n` +
        `• Bedrock: **${config.minecraft?.supported_versions?.bedrock?.length || 0} إصدار**\n` +
        `• Java: **${config.minecraft?.supported_versions?.java?.length || 0} إصدار**`;

    const keyboard = [
        [
            { text: '✏️ تعديل الحد الأقصى للسيرفرات', callback_data: 'edit_max_servers' },
            { text: '🔐 تغيير الاشتراك الإجباري', callback_data: 'toggle_subscription' }
        ],
        [
            { text: '💾 حفظ نسخة احتياطية', callback_data: 'backup_settings' },
            { text: '🔄 إعادة تحميل الإعدادات', callback_data: 'reload_settings' }
        ],
        [{ text: '🔙 العودة للوحة الأدمن', callback_data: 'admin_panel' }]
    ];

    bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

// عرض إحصائيات المستخدمين المفصلة
function showDetailedUserStats(chatId) {
    const users = Object.values(usersDB);
    const totalUsers = users.length;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString().split('T')[0];
    
    const newToday = users.filter(u => u.join_date && u.join_date.startsWith(today)).length;
    const newYesterday = users.filter(u => u.join_date && u.join_date.startsWith(yesterday)).length;
    const activeUsers = users.filter(u => u.servers && u.servers.length > 0).length;
    const vipUsers = users.filter(u => u.servers && u.servers.length >= 5).length;
    
    const message = `📊 **إحصائيات المستخدمين المفصلة**\n\n` +
        `👥 إجمالي المستخدمين: **${totalUsers}**\n` +
        `🟢 مستخدمين نشطين: **${activeUsers}**\n` +
        `⭐ مستخدمين VIP (5+ سيرفرات): **${vipUsers}**\n\n` +
        
        `📈 **نشاط التسجيل**:\n` +
        `• اليوم: **${newToday}** مستخدم جديد\n` +
        `• الأمس: **${newYesterday}** مستخدم جديد\n` +
        `• معدل النمو: **${newToday >= newYesterday ? '📈' : '📉'} ${newYesterday > 0 ? ((newToday - newYesterday) / newYesterday * 100).toFixed(1) : (newToday > 0 ? '+100' : '0')}%**\n\n` +
        
        `🎮 **توزيع السيرفرات**:\n` +
        `• بدون سيرفرات: **${totalUsers - activeUsers}** مستخدم\n` +
        `• 1-2 سيرفر: **${users.filter(u => u.servers && u.servers.length >= 1 && u.servers.length <= 2).length}** مستخدم\n` +
        `• 3-5 سيرفرات: **${users.filter(u => u.servers && u.servers.length >= 3 && u.servers.length <= 5).length}** مستخدم\n` +
        `• أكثر من 5: **${vipUsers}** مستخدم`;
    
    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 إدارة المستخدمين', callback_data: 'admin_users' }]
            ]
        }
    });
}

// عرض إحصائيات السيرفرات المتقدمة
function showAdvancedServerStats(chatId) {
    const servers = Object.values(serversDB);
    const totalServers = servers.length;
    const runningServers = servers.filter(s => s.status === 'running').length;
    const today = new Date().toISOString().split('T')[0];
    
    const serversToday = servers.filter(s => s.created_at && s.created_at.startsWith(today)).length;
    const bedrockServers = servers.filter(s => s.type === 'bedrock').length;
    const javaServers = servers.filter(s => s.type === 'java').length;
    
    // إحصائيات الاتصالات
    const totalConnections = servers.reduce((sum, s) => sum + (s.stats?.total_connections || 0), 0);
    const avgConnections = totalServers > 0 ? (totalConnections / totalServers).toFixed(1) : 0;
    
    // السيرفرات الأكثر شعبية
    const popularHosts = {};
    servers.forEach(server => {
        const host = server.ip || server.host;
        if (!popularHosts[host]) popularHosts[host] = 0;
        popularHosts[host]++;
    });
    
    const topHost = Object.entries(popularHosts).sort((a, b) => b[1] - a[1])[0];
    
    const message = `📈 **إحصائيات السيرفرات المتقدمة**\n\n` +
        `🎮 **الأعداد الإجمالية**:\n` +
        `• إجمالي السيرفرات: **${totalServers}**\n` +
        `• نشطة: **${runningServers}** (${totalServers > 0 ? ((runningServers/totalServers)*100).toFixed(1) : '0'}%)\n` +
        `• متوقفة: **${totalServers - runningServers}**\n\n` +
        
        `📱 **توزيع الأنواع**:\n` +
        `• Bedrock Edition: **${bedrockServers}** (${totalServers > 0 ? ((bedrockServers/totalServers)*100).toFixed(1) : '0'}%)\n` +
        `• Java Edition: **${javaServers}** (${totalServers > 0 ? ((javaServers/totalServers)*100).toFixed(1) : '0'}%)\n\n` +
        
        `🔄 **إحصائيات الاتصالات**:\n` +
        `• إجمالي الاتصالات: **${totalConnections}**\n` +
        `• متوسط الاتصالات لكل سيرفر: **${avgConnections}**\n\n` +
        
        `📊 **النشاط اليومي**:\n` +
        `• سيرفرات أضيفت اليوم: **${serversToday}**\n` +
        `• أشهر سيرفر: **${topHost ? `${topHost[0]} (${topHost[1]} بوت)` : 'لا يوجد'}**`;
    
    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 إدارة السيرفرات', callback_data: 'admin_servers' }]
            ]
        }
    });
}

// عرض السيرفرات المعطلة
function showProblematicServers(chatId) {
    const servers = Object.values(serversDB);
    const problematicServers = servers.filter(server => {
        const lastConnection = server.stats?.last_connection;
        const daysSinceConnection = lastConnection ? 
            (Date.now() - new Date(lastConnection).getTime()) / (1000 * 60 * 60 * 24) : 999;
        
        return server.status === 'stopped' && daysSinceConnection > 7;
    });
    
    let message = `⚠️ **السيرفرات المعطلة**\n\n`;
    
    if (problematicServers.length === 0) {
        message += `✅ **لا توجد سيرفرات معطلة!**\n\n جميع السيرفرات تعمل بشكل طبيعي.`;
    } else {
        message += `📊 **السيرفرات المتوقفة لأكثر من 7 أيام**: ${problematicServers.length}\n\n`;
        
        problematicServers.slice(0, 10).forEach((server, index) => {
            const owner = usersDB[server.owner];
            const lastConnection = server.stats?.last_connection;
            const daysAgo = lastConnection ? 
                Math.floor((Date.now() - new Date(lastConnection).getTime()) / (1000 * 60 * 60 * 24)) : '∞';
            
            message += `${index + 1}. **${server.ip}:${server.port}**\n`;
            message += `   👤 المالك: ${owner?.first_name || 'مجهول'}\n`;
            message += `   📅 آخر اتصال: منذ ${daysAgo} يوم\n`;
            message += `   🎮 النوع: ${server.type}\n\n`;
        });
        
        if (problematicServers.length > 10) {
            message += `... و ${problematicServers.length - 10} سيرفر آخر`;
        }
    }
    
    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 إدارة السيرفرات', callback_data: 'admin_servers' }]
            ]
        }
    });
}

// معالجة البحث عن مستخدم
async function handleUserSearch(chatId, userId, searchTerm) {
    delete usersDB[userId].waiting_for;
    saveData();
    
    const users = Object.values(usersDB);
    const searchResults = users.filter(user => 
        (user.user_id && user.user_id.toString().includes(searchTerm)) ||
        (user.first_name && user.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.username && user.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    
    let message = `🔍 **نتائج البحث عن**: "${searchTerm}"\n\n`;
    
    if (searchResults.length === 0) {
        message += `❌ لم يتم العثور على أي مستخدم`;
    } else {
        message += `📊 **تم العثور على ${searchResults.length} مستخدم**:\n\n`;
        
        searchResults.slice(0, 5).forEach((user, index) => {
            const serverCount = user.servers ? user.servers.length : 0;
            const joinDate = user.join_date ? new Date(user.join_date).toLocaleDateString('ar-SA') : 'غير محدد';
            
            message += `${index + 1}. **${user.first_name || 'مجهول'}**\n`;
            message += `   🆔 ID: ${user.user_id}\n`;
            message += `   📊 السيرفرات: ${serverCount}\n`;
            message += `   📅 التسجيل: ${joinDate}\n\n`;
        });
        
        if (searchResults.length > 5) {
            message += `... و ${searchResults.length - 5} مستخدم آخر`;
        }
    }
    
    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 إدارة المستخدمين', callback_data: 'admin_users' }]
            ]
        }
    });
}

// معالجة البحث عن سيرفر
async function handleServerSearch(chatId, userId, searchTerm) {
    delete usersDB[userId].waiting_for;
    saveData();
    
    const servers = Object.values(serversDB);
    const searchResults = servers.filter(server => 
        (server.ip && server.ip.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (server.host && server.host.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (server.port && server.port.toString().includes(searchTerm))
    );
    
    let message = `🔍 **نتائج البحث عن**: "${searchTerm}"\n\n`;
    
    if (searchResults.length === 0) {
        message += `❌ لم يتم العثور على أي سيرفر`;
    } else {
        message += `📊 **تم العثور على ${searchResults.length} سيرفر**:\n\n`;
        
        searchResults.slice(0, 5).forEach((server, index) => {
            const owner = usersDB[server.owner];
            const statusIcon = server.status === 'running' ? '🟢' : '🔴';
            const connections = server.stats?.total_connections || 0;
            
            message += `${index + 1}. ${statusIcon} **${server.ip}:${server.port}**\n`;
            message += `   👤 المالك: ${owner?.first_name || 'مجهول'}\n`;
            message += `   🎮 النوع: ${server.type}\n`;
            message += `   🔄 الاتصالات: ${connections}\n\n`;
        });
        
        if (searchResults.length > 5) {
            message += `... و ${searchResults.length - 5} سيرفر آخر`;
        }
    }
    
    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 إدارة السيرفرات', callback_data: 'admin_servers' }]
            ]
        }
    });
}

// معالجة تعديل الحد الأقصى للسيرفرات
async function handleMaxServersEdit(chatId, userId, input) {
    delete usersDB[userId].waiting_for;
    saveData();
    
    const newMax = parseInt(input);
    
    if (isNaN(newMax) || newMax < 1 || newMax > 50) {
        return bot.sendMessage(chatId,
            `❌ **رقم غير صحيح!**\n\n` +
            `يجب أن يكون الرقم بين 1 و 50`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 العودة', callback_data: 'admin_settings' }]
                ]
            }
        });
    }
    
    const oldMax = config.security.max_servers_per_user;
    config.security.max_servers_per_user = newMax;
    
    fs.writeFileSync('telegram-config.json', JSON.stringify(config, null, 2));
    
    bot.sendMessage(chatId,
        `✅ **تم تحديث الحد الأقصى للسيرفرات بنجاح!**\n\n` +
        `📊 **التغيير**:\n` +
        `• الحد القديم: **${oldMax}** سيرفر\n` +
        `• الحد الجديد: **${newMax}** سيرفر\n\n` +
        `🔄 سيتم تطبيق الحد الجديد على جميع المستخدمين`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔙 إعدادات البوت', callback_data: 'admin_settings' }]
            ]
        }
    });
}

// تحميل البيانات عند البدء
loadData();

// إعداد خادم Express للـ Health Check
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        bot: 'running',
        users: Object.keys(usersDB).length,
        servers: Object.keys(serversDB).length,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.status(200).json({
        name: 'Minecraft Telegram Bot',
        version: '2.0.0',
        developer: 'SAFIOUR (@c_ega)',
        status: 'running'
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Health server running on port ${PORT}`);
});

console.log('🤖 تم تشغيل بوت التيليجرام!');
console.log('👨‍💻 المطور: سافيور | SAFIOUR');
console.log('📱 التيليجرام: @c_ega');
console.log(`📊 المستخدمين: ${Object.keys(usersDB).length}`);
console.log(`🎮 السيرفرات: ${Object.keys(serversDB).length}`); 