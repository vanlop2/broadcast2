// ===================================================
// بوت ديسكورد احترافي للبرودكاست
// الإصدار: 1.0.0
// discord.js v14
// ===================================================

// ============ استيراد المكتبات ============
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ActivityType,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============ الثوابت والإعدادات ============
const PREFIX = '#';
const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const DATA_FILE = path.join(__dirname, 'data.json');

// ألوان الـ Embeds
const COLORS = {
    SUCCESS: 0x2ECC71,    // أخضر - نجاح
    ERROR: 0xE74C3C,      // أحمر - خطأ
    WARNING: 0xF39C12,    // برتقالي - تحذير
    INFO: 0x3498DB,       // أزرق - معلومة
    PRIMARY: 0x9B59B6,    // بنفسجي - رئيسي
    BROADCAST: 0x1ABC9C,  // فيروزي - برودكاست
    SCHEDULE: 0xE91E63,   // وردي - جدولة
    ADMIN: 0xFFD700       // ذهبي - إدارة
};

// مدة انتهاء الـ Collectors (5 دقائق)
const COLLECTOR_TIMEOUT = 300000;

// تأخير بين كل DM (بالميلي ثانية) لتجنب Rate Limit
const DM_DELAY = 1200;

// ============ إنشاء الكلاينت ============
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// ============ متغيرات عامة ============
// تخزين مؤقتات الجدولة النشطة
const activeSchedules = new Map();

// ============ دوال التخزين المحلي ============

/**
 * قراءة ملف البيانات
 * لو الملف مو موجود ينشئ واحد جديد فاضي
 */
function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            const defaultData = {};
            fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
            return defaultData;
        }
        const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error('❌ خطأ في قراءة ملف البيانات:', error);
        return {};
    }
}

/**
 * حفظ البيانات في الملف
 */
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ البيانات:', error);
    }
}

/**
 * الحصول على بيانات سيرفر معين
 * لو ما موجود ينشئ بيانات افتراضية
 */
function getGuildData(guildId) {
    const data = loadData();
    if (!data[guildId]) {
        data[guildId] = {
            admins: [],
            scheduledMessages: [],
            lastBroadcast: null,
            stats: {
                totalBroadcasts: 0,
                totalDelivered: 0,
                totalFailed: 0,
                totalBlocked: 0
            }
        };
        saveData(data);
    }
    return data[guildId];
}

/**
 * تحديث بيانات سيرفر معين
 */
function updateGuildData(guildId, guildData) {
    const data = loadData();
    data[guildId] = guildData;
    saveData(data);
}

// ============ دوال التحقق من الصلاحيات ============

/**
 * التحقق إذا المستخدم هو الأونر
 */
function isOwner(userId) {
    return userId === OWNER_ID;
}

/**
 * التحقق إذا المستخدم أدمن أو أونر
 */
function isAdmin(userId, guildId) {
    if (isOwner(userId)) return true;
    const guildData = getGuildData(guildId);
    return guildData.admins.includes(userId);
}

// ============ دوال مساعدة ============

/**
 * تحويل التاريخ لتوقيت الرياض
 */
function toRiyadhTime(date) {
    return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
}

/**
 * تنسيق التاريخ بشكل مقروء
 */
function formatDate(date) {
    const d = new Date(date);
    const options = {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    };
    return d.toLocaleString('ar-SA', options);
}

/**
 * إنشاء Embed خطأ
 */
function errorEmbed(description) {
    return new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle('❌ خطأ')
        .setDescription(description)
        .setTimestamp();
}

/**
 * إنشاء Embed نجاح
 */
function successEmbed(description) {
    return new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle('✅ تم بنجاح')
        .setDescription(description)
        .setTimestamp();
}

/**
 * إنشاء Embed معلومة
 */
function infoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

/**
 * تأخير (sleep)
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * جمع رسالة من المستخدم في شانل معين
 */
async function collectMessage(channel, userId, prompt, timeout = COLLECTOR_TIMEOUT) {
    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(COLORS.INFO)
                .setDescription(prompt)
                .setFooter({ text: `⏱️ لديك ${Math.floor(timeout / 60000)} دقائق للإجابة | اكتب "إلغاء" للإلغاء` })
        ]
    });

    try {
        const filter = m => m.author.id === userId;
        const collected = await channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });

        const response = collected.first();
        if (response.content.trim() === 'إلغاء' || response.content.trim() === 'الغاء') {
            return null;
        }
        return response;
    } catch (error) {
        await channel.send({
            embeds: [errorEmbed('⏱️ انتهى الوقت المخصص للإجابة. حاول مرة أخرى.')]
        });
        return null;
    }
}

// ============ دالة إرسال البرودكاست ============

/**
 * إرسال البرودكاست لأعضاء السيرفر
 * @param {Object} guild - السيرفر
 * @param {Object} channel - القناة اللي يتم فيها التقرير
 * @param {Object} broadcastContent - محتوى البرودكاست
 * @param {Number} maxMembers - أقصى عدد أعضاء (0 = الكل)
 */
async function sendBroadcast(guild, channel, broadcastContent, maxMembers = 0) {
    // جلب كل الأعضاء
    await guild.members.fetch();

    // فلترة البوتات
    let members = guild.members.cache.filter(m => !m.user.bot).map(m => m);

    // لو تجربة، نختار عدد عشوائي
    if (maxMembers > 0 && maxMembers < members.length) {
        // ترتيب عشوائي
        members = members.sort(() => Math.random() - 0.5).slice(0, maxMembers);
    }

    const totalMembers = members.length;
    let delivered = 0;
    let failed = 0;
    let blocked = 0;

    // رسالة تقدم العملية
    const progressEmbed = new EmbedBuilder()
        .setColor(COLORS.BROADCAST)
        .setTitle('📤 جاري إرسال البرودكاست...')
        .setDescription(`**الإجمالي:** ${totalMembers} عضو\n**تم الإرسال:** 0\n**فشل:** 0\n**مقفل الخاص:** 0`)
        .setFooter({ text: 'يرجى الانتظار...' })
        .setTimestamp();

    const progressMsg = await channel.send({ embeds: [progressEmbed] });

    // تحديث رسالة التقدم كل 10 أعضاء
    let updateCounter = 0;

    for (let i = 0; i < members.length; i++) {
        const member = members[i];

        try {
            // بناء الرسالة حسب النوع
            const messagePayload = {};

            if (broadcastContent.text) {
                messagePayload.content = broadcastContent.text;
            }

            if (broadcastContent.embed) {
                messagePayload.embeds = [broadcastContent.embed];
            }

            if (broadcastContent.image && !broadcastContent.embed) {
                messagePayload.files = [broadcastContent.image];
            }

            await member.send(messagePayload);
            delivered++;
        } catch (error) {
            if (error.code === 50007) {
                // Cannot send messages to this user (DM مقفل)
                blocked++;
            } else {
                failed++;
            }
        }

        updateCounter++;

        // تحديث رسالة التقدم كل 10 أعضاء أو عند الانتهاء
        if (updateCounter >= 10 || i === members.length - 1) {
            updateCounter = 0;
            const percentage = Math.round(((i + 1) / totalMembers) * 100);
            const progressBar = createProgressBar(percentage);

            try {
                await progressMsg.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.BROADCAST)
                            .setTitle('📤 جاري إرسال البرودكاست...')
                            .setDescription(
                                `${progressBar} **${percentage}%**\n\n` +
                                `**📊 الإحصائيات المباشرة:**\n` +
                                `> 👥 الإجمالي: **${totalMembers}**\n` +
                                `> ✅ تم الإرسال: **${delivered}**\n` +
                                `> ❌ فشل: **${failed}**\n` +
                                `> 🔒 مقفل الخاص: **${blocked}**\n` +
                                `> ⏳ متبقي: **${totalMembers - (i + 1)}**`
                            )
                            .setFooter({ text: 'يرجى الانتظار...' })
                            .setTimestamp()
                    ]
                });
            } catch (e) {
                // تجاهل خطأ تحديث الرسالة
            }
        }

        // تأخير بين كل رسالة لتجنب Rate Limit
        if (i < members.length - 1) {
            await sleep(DM_DELAY);
        }
    }

    // التقرير النهائي
    const successRate = totalMembers > 0 ? Math.round((delivered / totalMembers) * 100) : 0;

    const finalEmbed = new EmbedBuilder()
        .setColor(delivered > 0 ? COLORS.SUCCESS : COLORS.ERROR)
        .setTitle('📊 تقرير البرودكاست النهائي')
        .setDescription(
            `${maxMembers > 0 ? '🧪 **وضع التجربة**\n\n' : ''}` +
            `**📈 النتائج:**\n` +
            `> 👥 إجمالي الأعضاء: **${totalMembers}**\n` +
            `> ✅ تم الإرسال بنجاح: **${delivered}**\n` +
            `> ❌ فشل الإرسال: **${failed}**\n` +
            `> 🔒 مقفل الخاص: **${blocked}**\n` +
            `> 📊 نسبة النجاح: **${successRate}%**\n\n` +
            `${createProgressBar(successRate)} **${successRate}%**`
        )
        .setFooter({ text: `السيرفر: ${guild.name}` })
        .setTimestamp();

    try {
        await progressMsg.edit({ embeds: [finalEmbed] });
    } catch (e) {
        await channel.send({ embeds: [finalEmbed] });
    }

    // تحديث الإحصائيات
    const guildData = getGuildData(guild.id);
    guildData.stats.totalBroadcasts++;
    guildData.stats.totalDelivered += delivered;
    guildData.stats.totalFailed += failed;
    guildData.stats.totalBlocked += blocked;
    guildData.lastBroadcast = {
        content: broadcastContent,
        timestamp: new Date().toISOString(),
        stats: { delivered, failed, blocked, total: totalMembers }
    };
    updateGuildData(guild.id, guildData);

    return { delivered, failed, blocked, total: totalMembers };
}

/**
 * إنشاء شريط تقدم مرئي
 */
function createProgressBar(percentage) {
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    return '`[' + '█'.repeat(filled) + '░'.repeat(empty) + ']`';
}

// ============ دالة بناء محتوى البرودكاست (Flow التفاعلي) ============

/**
 * بدء عملية بناء البرودكاست التفاعلية
 */
async function startBroadcastFlow(message, isTest = false) {
    const userId = message.author.id;
    const channel = message.channel;
    const guildId = message.guild.id;

    // المرحلة 1: اختيار نوع المحتوى
    const typeSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`broadcast_type_${userId}_${Date.now()}`)
        .setPlaceholder('📝 اختر نوع المحتوى')
        .addOptions([
            {
                label: 'نص فقط',
                description: 'إرسال رسالة نصية فقط',
                value: 'text_only',
                emoji: '📝'
            },
            {
                label: 'صورة فقط',
                description: 'إرسال صورة فقط',
                value: 'image_only',
                emoji: '🖼️'
            },
            {
                label: 'نص + صورة',
                description: 'إرسال رسالة نصية مع صورة',
                value: 'text_and_image',
                emoji: '📎'
            }
        ]);

    const typeRow = new ActionRowBuilder().addComponents(typeSelectMenu);

    const typeMsg = await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setTitle(`📤 ${isTest ? 'برودكاست تجريبي' : 'إنشاء برودكاست جديد'}`)
                .setDescription('اختر نوع المحتوى اللي تبي ترسله:')
                .setFooter({ text: '⏱️ لديك 5 دقائق للاختيار' })
        ],
        components: [typeRow]
    });

    // انتظار اختيار النوع
    let contentType;
    try {
        const typeInteraction = await typeMsg.awaitMessageComponent({
            filter: i => i.user.id === userId,
            componentType: ComponentType.StringSelect,
            time: COLLECTOR_TIMEOUT
        });

        contentType = typeInteraction.values[0];
        await typeInteraction.update({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setDescription(`✅ تم اختيار: **${contentType === 'text_only' ? 'نص فقط' : contentType === 'image_only' ? 'صورة فقط' : 'نص + صورة'}**`)
            ],
            components: []
        });
    } catch (error) {
        await typeMsg.edit({
            embeds: [errorEmbed('⏱️ انتهى الوقت المخصص للاختيار.')],
            components: []
        });
        return null;
    }

    // المرحلة 2: سؤال عن الـ Embed
    const embedSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`broadcast_embed_${userId}_${Date.now()}`)
        .setPlaceholder('🎨 هل تريد إرسال كـ Embed؟')
        .addOptions([
            {
                label: 'نعم - Embed',
                description: 'إرسال الرسالة كـ Embed منسق',
                value: 'yes_embed',
                emoji: '✅'
            },
            {
                label: 'لا - رسالة عادية',
                description: 'إرسال الرسالة كنص عادي',
                value: 'no_embed',
                emoji: '❌'
            }
        ]);

    const embedRow = new ActionRowBuilder().addComponents(embedSelectMenu);

    const embedMsg = await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(COLORS.INFO)
                .setTitle('🎨 نوع الرسالة')
                .setDescription('هل تريد إرسال الرسالة كـ Embed منسق؟')
                .setFooter({ text: '⏱️ لديك 5 دقائق للاختيار' })
        ],
        components: [embedRow]
    });

    let useEmbed;
    try {
        const embedInteraction = await embedMsg.awaitMessageComponent({
            filter: i => i.user.id === userId,
            componentType: ComponentType.StringSelect,
            time: COLLECTOR_TIMEOUT
        });

        useEmbed = embedInteraction.values[0] === 'yes_embed';
        await embedInteraction.update({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setDescription(`✅ تم اختيار: **${useEmbed ? 'Embed منسق' : 'رسالة عادية'}**`)
            ],
            components: []
        });
    } catch (error) {
        await embedMsg.edit({
            embeds: [errorEmbed('⏱️ انتهى الوقت المخصص للاختيار.')],
            components: []
        });
        return null;
    }

    // المرحلة 3: جمع المحتوى حسب النوع
    let broadcastContent = {
        text: null,
        image: null,
        embed: null,
        type: contentType,
        isEmbed: useEmbed
    };

    // جمع النص
    if (contentType === 'text_only' || contentType === 'text_and_image') {
        if (useEmbed) {
            // جمع عنوان الـ Embed
            const titleResponse = await collectMessage(channel, userId, '📌 **اكتب عنوان الـ Embed:**');
            if (!titleResponse) return null;
            const embedTitle = titleResponse.content;

            // جمع وصف الـ Embed
            const descResponse = await collectMessage(channel, userId, '📝 **اكتب وصف/محتوى الـ Embed:**');
            if (!descResponse) return null;
            const embedDescription = descResponse.content;

            // بناء الـ Embed
            const broadcastEmbed = new EmbedBuilder()
                .setColor(COLORS.BROADCAST)
                .setTitle(embedTitle)
                .setDescription(embedDescription)
                .setTimestamp();

            // لو فيه صورة
            if (contentType === 'text_and_image') {
                const imgResponse = await collectMessage(channel, userId, '🖼️ **أرسل الصورة (رابط أو ارفق الصورة مباشرة):**');
                if (!imgResponse) return null;

                let imageUrl = null;
                if (imgResponse.attachments.size > 0) {
                    imageUrl = imgResponse.attachments.first().url;
                } else if (imgResponse.content.match(/https?:\/\/\S+/)) {
                    imageUrl = imgResponse.content.match(/https?:\/\/\S+/)[0];
                }

                if (imageUrl) {
                    broadcastEmbed.setImage(imageUrl);
                    broadcastContent.image = imageUrl;
                }
            }

            broadcastContent.embed = broadcastEmbed.toJSON();
            broadcastContent.text = null;
        } else {
            // رسالة عادية
            const textResponse = await collectMessage(channel, userId, '📝 **اكتب نص الرسالة:**');
            if (!textResponse) return null;
            broadcastContent.text = textResponse.content;

            if (contentType === 'text_and_image') {
                const imgResponse = await collectMessage(channel, userId, '🖼️ **أرسل الصورة (رابط أو ارفق الصورة مباشرة):**');
                if (!imgResponse) return null;

                if (imgResponse.attachments.size > 0) {
                    broadcastContent.image = imgResponse.attachments.first().url;
                } else if (imgResponse.content.match(/https?:\/\/\S+/)) {
                    broadcastContent.image = imgResponse.content.match(/https?:\/\/\S+/)[0];
                }
            }
        }
    } else if (contentType === 'image_only') {
        if (useEmbed) {
            // Embed بصورة فقط
            const titleResponse = await collectMessage(channel, userId, '📌 **اكتب عنوان الـ Embed (اختياري - اكتب "تخطي" للتخطي):**');
            if (!titleResponse) return null;

            const imgResponse = await collectMessage(channel, userId, '🖼️ **أرسل الصورة (رابط أو ارفق الصورة مباشرة):**');
            if (!imgResponse) return null;

            let imageUrl = null;
            if (imgResponse.attachments.size > 0) {
                imageUrl = imgResponse.attachments.first().url;
            } else if (imgResponse.content.match(/https?:\/\/\S+/)) {
                imageUrl = imgResponse.content.match(/https?:\/\/\S+/)[0];
            }

            const broadcastEmbed = new EmbedBuilder()
                .setColor(COLORS.BROADCAST)
                .setTimestamp();

            if (titleResponse.content !== 'تخطي') {
                broadcastEmbed.setTitle(titleResponse.content);
            }

            if (imageUrl) {
                broadcastEmbed.setImage(imageUrl);
                broadcastContent.image = imageUrl;
            }

            broadcastContent.embed = broadcastEmbed.toJSON();
        } else {
            // صورة عادية فقط
            const imgResponse = await collectMessage(channel, userId, '🖼️ **أرسل الصورة (رابط أو ارفق الصورة مباشرة):**');
            if (!imgResponse) return null;

            if (imgResponse.attachments.size > 0) {
                broadcastContent.image = imgResponse.attachments.first().url;
            } else if (imgResponse.content.match(/https?:\/\/\S+/)) {
                broadcastContent.image = imgResponse.content.match(/https?:\/\/\S+/)[0];
            }
        }
    }

    // المرحلة 4: إرسال الآن أو جدولة
    const scheduleSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`broadcast_schedule_${userId}_${Date.now()}`)
        .setPlaceholder('⏰ متى تريد الإرسال؟')
        .addOptions([
            {
                label: 'إرسال الآن',
                description: 'إرسال البرودكاست فوراً',
                value: 'send_now',
                emoji: '🚀'
            },
            {
                label: 'جدولة',
                description: 'جدولة الإرسال لوقت محدد',
                value: 'schedule',
                emoji: '⏰'
            }
        ]);

    const scheduleRow = new ActionRowBuilder().addComponents(scheduleSelectMenu);

    const scheduleMsg = await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(COLORS.SCHEDULE)
                .setTitle('⏰ وقت الإرسال')
                .setDescription('هل تريد إرسال البرودكاست الآن أم جدولته لوقت لاحق؟')
                .setFooter({ text: '⏱️ لديك 5 دقائق للاختيار' })
        ],
        components: [scheduleRow]
    });

    let sendNow;
    let scheduledTime = null;

    try {
        const scheduleInteraction = await scheduleMsg.awaitMessageComponent({
            filter: i => i.user.id === userId,
            componentType: ComponentType.StringSelect,
            time: COLLECTOR_TIMEOUT
        });

        sendNow = scheduleInteraction.values[0] === 'send_now';

        await scheduleInteraction.update({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setDescription(`✅ تم اختيار: **${sendNow ? 'إرسال الآن' : 'جدولة'}**`)
            ],
            components: []
        });
    } catch (error) {
        await scheduleMsg.edit({
            embeds: [errorEmbed('⏱️ انتهى الوقت المخصص للاختيار.')],
            components: []
        });
        return null;
    }

    // لو اختار جدولة
    if (!sendNow) {
        const timeResponse = await collectMessage(
            channel,
            userId,
            '⏰ **اكتب وقت الإرسال بتوقيت الرياض:**\n' +
            'الصيغة: `YYYY-MM-DD HH:MM`\n' +
            'مثال: `2025-01-15 14:30`'
        );

        if (!timeResponse) return null;

        const timeStr = timeResponse.content.trim();
        // تحليل الوقت
        const timeParts = timeStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);

        if (!timeParts) {
            await channel.send({
                embeds: [errorEmbed('❌ صيغة الوقت غير صحيحة. استخدم الصيغة: `YYYY-MM-DD HH:MM`')]
            });
            return null;
        }

        // إنشاء التاريخ بتوقيت الرياض (UTC+3)
        const [, year, month, day, hour, minute] = timeParts;
        const riyadhDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+03:00`);

        if (riyadhDate <= new Date()) {
            await channel.send({
                embeds: [errorEmbed('❌ الوقت المحدد في الماضي. يرجى اختيار وقت مستقبلي.')]
            });
            return null;
        }

        scheduledTime = riyadhDate.toISOString();
        broadcastContent.scheduledTime = scheduledTime;
    }

    // لو تجربة، نسأل عن العدد
    let testCount = 0;
    if (isTest) {
        const countResponse = await collectMessage(
            channel,
            userId,
            '🧪 **كم عضو تبي ترسل لهم كتجربة؟**\nاكتب رقم:'
        );

        if (!countResponse) return null;

        testCount = parseInt(countResponse.content);
        if (isNaN(testCount) || testCount < 1) {
            await channel.send({
                embeds: [errorEmbed('❌ يرجى كتابة رقم صحيح أكبر من 0.')]
            });
            return null;
        }
    }

    // المرحلة 5: عرض Preview
    const previewEmbed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('👁️ معاينة البرودكاست')
        .setDescription('هكذا ستظهر الرسالة للأعضاء:')
        .setFooter({ text: 'تأكد من المحتوى قبل الإرسال' })
        .setTimestamp();

    // عرض الـ Preview
    await channel.send({ embeds: [previewEmbed] });

    // عرض المحتوى كما سيظهر
    const previewPayload = {};
    if (broadcastContent.text) {
        previewPayload.content = broadcastContent.text;
    }
    if (broadcastContent.embed) {
        previewPayload.embeds = [EmbedBuilder.from(broadcastContent.embed)];
    }
    if (broadcastContent.image && !broadcastContent.embed) {
        previewPayload.files = [broadcastContent.image];
    }

    // لو المحتوى فاضي
    if (!previewPayload.content && !previewPayload.embeds && !previewPayload.files) {
        previewPayload.content = '*(محتوى فارغ)*';
    }

    await channel.send(previewPayload);

    // معلومات إضافية
    let extraInfo = '';
    if (scheduledTime) {
        extraInfo += `\n⏰ **موعد الإرسال:** ${formatDate(scheduledTime)}`;
    }
    if (isTest) {
        extraInfo += `\n🧪 **عدد الأعضاء للتجربة:** ${testCount}`;
    }

    // أزرار التأكيد
    const confirmButton = new ButtonBuilder()
        .setCustomId(`broadcast_confirm_${userId}_${Date.now()}`)
        .setLabel(sendNow ? '🚀 إرسال الآن' : '⏰ تأكيد الجدولة')
        .setStyle(ButtonStyle.Success);

    const editButton = new ButtonBuilder()
        .setCustomId(`broadcast_edit_${userId}_${Date.now()}`)
        .setLabel('✏️ تعديل')
        .setStyle(ButtonStyle.Primary);

    const cancelButton = new ButtonBuilder()
        .setCustomId(`broadcast_cancel_${userId}_${Date.now()}`)
        .setLabel('❌ إلغاء')
        .setStyle(ButtonStyle.Danger);

    const confirmRow = new ActionRowBuilder().addComponents(confirmButton, editButton, cancelButton);

    const confirmMsg = await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle('⚡ تأكيد الإرسال')
                .setDescription(
                    `هل أنت متأكد من ${sendNow ? 'إرسال' : 'جدولة'} هذا البرودكاست؟${extraInfo}`
                )
                .setFooter({ text: '⏱️ لديك 5 دقائق للتأكيد' })
        ],
        components: [confirmRow]
    });

    try {
        const confirmInteraction = await confirmMsg.awaitMessageComponent({
            filter: i => i.user.id === userId,
            componentType: ComponentType.Button,
            time: COLLECTOR_TIMEOUT
        });

        if (confirmInteraction.customId.startsWith('broadcast_confirm_')) {
            await confirmInteraction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.SUCCESS)
                        .setDescription(sendNow ? '🚀 جاري إرسال البرودكاست...' : '⏰ جاري جدولة البرودكاست...')
                ],
                components: []
            });

            if (sendNow) {
                // إرسال فوري
                await sendBroadcast(message.guild, channel, broadcastContent, isTest ? testCount : 0);
            } else {
                // جدولة
                const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const guildData = getGuildData(guildId);

                const scheduledEntry = {
                    id: scheduleId,
                    content: broadcastContent,
                    scheduledTime: scheduledTime,
                    channelId: channel.id,
                    createdBy: userId,
                    createdAt: new Date().toISOString(),
                    isTest: isTest,
                    testCount: testCount
                };

                guildData.scheduledMessages.push(scheduledEntry);
                updateGuildData(guildId, guildData);

                // تشغيل المؤقت
                scheduleMessageTimer(message.guild, scheduledEntry);

                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.SCHEDULE)
                            .setTitle('⏰ تم جدولة البرودكاست بنجاح')
                            .setDescription(
                                `**📋 معرف الجدولة:** \`${scheduleId}\`\n` +
                                `**⏰ موعد الإرسال:** ${formatDate(scheduledTime)}\n` +
                                `**👤 بواسطة:** <@${userId}>`
                            )
                            .setFooter({ text: 'يمكنك إلغاء الجدولة باستخدام #scheduled' })
                            .setTimestamp()
                    ]
                });
            }
        } else if (confirmInteraction.customId.startsWith('broadcast_edit_')) {
            await confirmInteraction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.INFO)
                        .setDescription('✏️ تم إلغاء العملية. استخدم الأمر مرة أخرى لإعادة البدء.')
                ],
                components: []
            });
        } else if (confirmInteraction.customId.startsWith('broadcast_cancel_')) {
            await confirmInteraction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setDescription('❌ تم إلغاء البرودكاست.')
                ],
                components: []
            });
        }
    } catch (error) {
        await confirmMsg.edit({
            embeds: [errorEmbed('⏱️ انتهى الوقت المخصص للتأكيد.')],
            components: []
        });
    }
}

// ============ دالة جدولة المؤقتات ============

/**
 * تشغيل مؤقت لرسالة مجدولة
 */
function scheduleMessageTimer(guild, scheduledEntry) {
    const now = new Date().getTime();
    const scheduledTime = new Date(scheduledEntry.scheduledTime).getTime();
    const delay = scheduledTime - now;

    if (delay <= 0) {
        // الوقت فات، ننفذ فوراً
        executeScheduledMessage(guild, scheduledEntry);
        return;
    }

    const timer = setTimeout(() => {
        executeScheduledMessage(guild, scheduledEntry);
    }, delay);

    // حفظ المؤقت
    activeSchedules.set(scheduledEntry.id, timer);
}

/**
 * تنفيذ رسالة مجدولة
 */
async function executeScheduledMessage(guild, scheduledEntry) {
    try {
        const channel = await guild.channels.fetch(scheduledEntry.channelId);
        if (!channel) {
            console.error(`❌ القناة ${scheduledEntry.channelId} غير موجودة`);
            return;
        }

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.SCHEDULE)
                    .setTitle('⏰ تنفيذ رسالة مجدولة')
                    .setDescription(
                        `**📋 معرف الجدولة:** \`${scheduledEntry.id}\`\n` +
                        `**👤 بواسطة:** <@${scheduledEntry.createdBy}>`
                    )
                    .setTimestamp()
            ]
        });

        await sendBroadcast(
            guild,
            channel,
            scheduledEntry.content,
            scheduledEntry.isTest ? scheduledEntry.testCount : 0
        );

        // حذف الجدولة من البيانات
        const guildData = getGuildData(guild.id);
        guildData.scheduledMessages = guildData.scheduledMessages.filter(s => s.id !== scheduledEntry.id);
        updateGuildData(guild.id, guildData);

        // حذف المؤقت من القائمة
        activeSchedules.delete(scheduledEntry.id);
    } catch (error) {
        console.error('❌ خطأ في تنفيذ الرسالة المجدولة:', error);
    }
}

// ============ تحميل الجدولات عند بدء البوت ============

/**
 * تحميل وتشغيل كل الجدولات المخزنة
 */
async function loadScheduledMessages() {
    const data = loadData();

    for (const [guildId, guildData] of Object.entries(data)) {
        if (!guildData.scheduledMessages || guildData.scheduledMessages.length === 0) continue;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        // فلترة الجدولات المنتهية
        const now = new Date().getTime();
        const validSchedules = [];
        const expiredSchedules = [];

        for (const schedule of guildData.scheduledMessages) {
            const scheduledTime = new Date(schedule.scheduledTime).getTime();
            if (scheduledTime > now) {
                validSchedules.push(schedule);
                scheduleMessageTimer(guild, schedule);
            } else {
                // تنفيذ فوري للجدولات المتأخرة
                expiredSchedules.push(schedule);
            }
        }

        // تنفيذ الجدولات المتأخرة
        for (const expired of expiredSchedules) {
            executeScheduledMessage(guild, expired);
        }

        // تحديث القائمة
        guildData.scheduledMessages = validSchedules;
        updateGuildData(guildId, guildData);
    }

    console.log('✅ تم تحميل وتشغيل الجدولات المخزنة');
}

// ============ معالجة الأحداث ============

// عند جاهزية البوت
client.once('ready', async () => {
    console.log('═══════════════════════════════════════');
    console.log(`✅ البوت جاهز: ${client.user.tag}`);
    console.log(`📊 متصل بـ ${client.guilds.cache.size} سيرفر`);
    console.log(`👥 إجمالي الأعضاء: ${client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)}`);
    console.log('═══════════════════════════════════════');

    // تعيين الحالة
    client.user.setPresence({
        activities: [{
            name: `${PREFIX}help | البرودكاست`,
            type: ActivityType.Watching
        }],
        status: 'online'
    });

    // تحميل الجدولات المخزنة
    await loadScheduledMessages();
});

// عند استقبال رسالة
client.on('messageCreate', async (message) => {
    // تجاهل رسائل البوتات والرسائل الخاصة
    if (message.author.bot) return;
    if (!message.guild) return;

    // التحقق من الـ prefix
    if (!message.content.startsWith(PREFIX)) return;

    // تقسيم الأمر والمعاملات
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    // ============ أمر help ============
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle('📖 قائمة أوامر البوت')
            .setDescription('مرحباً! هذي كل الأوامر المتاحة:')
            .addFields(
                {
                    name: '━━━━━━ 📢 أوامر البرودكاست ━━━━━━',
                    value: '\u200b',
                    inline: false
                },
                {
                    name: `\`${PREFIX}broadcast\``,
                    value: '> 📤 إنشاء وإرسال برودكاست جديد لكل أعضاء السيرفر',
                    inline: false
                },
                {
                    name: `\`${PREFIX}broadcast test\``,
                    value: '> 🧪 إرسال برودكاست تجريبي لعدد محدد من الأعضاء',
                    inline: false
                },
                {
                    name: `\`${PREFIX}scheduled\``,
                    value: '> ⏰ عرض وإدارة الرسائل المجدولة',
                    inline: false
                },
                {
                    name: `\`${PREFIX}resend\``,
                    value: '> 🔄 إعادة إرسال آخر برودكاست',
                    inline: false
                },
                {
                    name: `\`${PREFIX}stats\``,
                    value: '> 📊 عرض إحصائيات البرودكاست',
                    inline: false
                },
                {
                    name: '━━━━━━ ⚙️ أوامر الإدارة (Admin) ━━━━━━',
                    value: '\u200b',
                    inline: false
                },
                {
                    name: `\`${PREFIX}admin\``,
                    value: '> ⚙️ إعدادات البوت وإدارة الأدمنز',
                    inline: false
                },
                {
                    name: '━━━━━━ 👑 أوامر المالك (Owner) ━━━━━━',
                    value: '\u200b',
                    inline: false
                },
                {
                    name: `\`${PREFIX}owner\``,
                    value: '> 👑 لوحة تحكم المالك - إحصائيات شاملة',
                    inline: false
                },
                {
                    name: `\`${PREFIX}help\``,
                    value: '> 📖 عرض هذه القائمة',
                    inline: false
                }
            )
            .setFooter({ text: `البادئة: ${PREFIX} | الوقت بتوقيت الرياض` })
            .setTimestamp();

        await message.reply({ embeds: [helpEmbed] });
    }

    // ============ أمر broadcast ============
    else if (command === 'broadcast') {
        // التحقق من الصلاحية
        if (!isAdmin(message.author.id, message.guild.id)) {
            return message.reply({
                embeds: [errorEmbed('🔒 ليس لديك صلاحية لاستخدام هذا الأمر. يجب أن تكون Admin أو Owner.')]
            });
        }

        const isTest = args[0]?.toLowerCase() === 'test';

        await startBroadcastFlow(message, isTest);
    }

    // ============ أمر scheduled ============
    else if (command === 'scheduled') {
        // التحقق من الصلاحية
        if (!isAdmin(message.author.id, message.guild.id)) {
            return message.reply({
                embeds: [errorEmbed('🔒 ليس لديك صلاحية لاستخدام هذا الأمر.')]
            });
        }

        const guildData = getGuildData(message.guild.id);
        const schedules = guildData.scheduledMessages || [];

        if (schedules.length === 0) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.INFO)
                        .setTitle('⏰ الرسائل المجدولة')
                        .setDescription('📭 لا توجد رسائل مجدولة حالياً.')
                        .setTimestamp()
                ]
            });
        }

        // عرض قائمة الجدولات
        const schedulesEmbed = new EmbedBuilder()
            .setColor(COLORS.SCHEDULE)
            .setTitle('⏰ الرسائل المجدولة')
            .setDescription(`📋 **عدد الرسائل المجدولة:** ${schedules.length}`)
            .setTimestamp();

        const buttons = [];

        for (let i = 0; i < schedules.length; i++) {
            const schedule = schedules[i];
            schedulesEmbed.addFields({
                name: `📌 جدولة #${i + 1}`,
                value:
                    `> **المعرف:** \`${schedule.id}\`\n` +
                    `> **الموعد:** ${formatDate(schedule.scheduledTime)}\n` +
                    `> **بواسطة:** <@${schedule.createdBy}>\n` +
                    `> **النوع:** ${schedule.content.type === 'text_only' ? '📝 نص' : schedule.content.type === 'image_only' ? '🖼️ صورة' : '📎 نص + صورة'}\n` +
                    `> **تجربة:** ${schedule.isTest ? '✅ نعم' : '❌ لا'}`,
                inline: false
            });

            // زر إلغاء لكل جدولة (حد أقصى 5 أزرار في صف واحد)
            if (buttons.length < 25) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`cancel_schedule_${schedule.id}`)
                        .setLabel(`إلغاء #${i + 1}`)
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️')
                );
            }
        }

        // تقسيم الأزرار لصفوف (5 أزرار كحد أقصى لكل صف)
        const buttonRows = [];
        for (let i = 0; i < buttons.length; i += 5) {
            buttonRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        const scheduledMsg = await message.reply({
            embeds: [schedulesEmbed],
            components: buttonRows
        });

        // الاستماع للأزرار
        const collector = scheduledMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            componentType: ComponentType.Button,
            time: COLLECTOR_TIMEOUT
        });

        collector.on('collect', async (interaction) => {
            if (interaction.customId.startsWith('cancel_schedule_')) {
                const scheduleId = interaction.customId.replace('cancel_schedule_', '');

                // إلغاء المؤقت
                if (activeSchedules.has(scheduleId)) {
                    clearTimeout(activeSchedules.get(scheduleId));
                    activeSchedules.delete(scheduleId);
                }

                // حذف من البيانات
                const currentData = getGuildData(message.guild.id);
                currentData.scheduledMessages = currentData.scheduledMessages.filter(s => s.id !== scheduleId);
                updateGuildData(message.guild.id, currentData);

                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.SUCCESS)
                            .setTitle('✅ تم إلغاء الجدولة')
                            .setDescription(`تم إلغاء الجدولة بمعرف: \`${scheduleId}\``)
                            .setTimestamp()
                    ],
                    components: []
                });

                // تسجيل في نفس الروم
                await message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.WARNING)
                            .setTitle('📋 سجل العمليات')
                            .setDescription(
                                `**🗑️ تم إلغاء جدولة**\n` +
                                `> **المعرف:** \`${scheduleId}\`\n` +
                                `> **بواسطة:** <@${interaction.user.id}>\n` +
                                `> **الوقت:** ${formatDate(new Date())}`
                            )
                            .setTimestamp()
                    ]
                });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                try {
                    await scheduledMsg.edit({ components: [] });
                } catch (e) { }
            }
        });
    }

    // ============ أمر resend ============
    else if (command === 'resend') {
        // التحقق من الصلاحية
        if (!isAdmin(message.author.id, message.guild.id)) {
            return message.reply({
                embeds: [errorEmbed('🔒 ليس لديك صلاحية لاستخدام هذا الأمر.')]
            });
        }

        const guildData = getGuildData(message.guild.id);

        if (!guildData.lastBroadcast) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.INFO)
                        .setTitle('🔄 إعادة الإرسال')
                        .setDescription('📭 لا يوجد برودكاست سابق لإعادة إرساله.')
                        .setTimestamp()
                ]
            });
        }

        const lastBroadcast = guildData.lastBroadcast;

        // عرض Preview
        await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.WARNING)
                    .setTitle('👁️ معاينة آخر برودكاست')
                    .setDescription(
                        `**📅 تم إرساله في:** ${formatDate(lastBroadcast.timestamp)}\n` +
                        `**📊 الإحصائيات السابقة:**\n` +
                        `> ✅ وصل: ${lastBroadcast.stats.delivered}\n` +
                        `> ❌ فشل: ${lastBroadcast.stats.failed}\n` +
                        `> 🔒 مقفل: ${lastBroadcast.stats.blocked}`
                    )
                    .setTimestamp()
            ]
        });

        // عرض المحتوى
        const previewPayload = {};
        if (lastBroadcast.content.text) {
            previewPayload.content = lastBroadcast.content.text;
        }
        if (lastBroadcast.content.embed) {
            previewPayload.embeds = [EmbedBuilder.from(lastBroadcast.content.embed)];
        }
        if (lastBroadcast.content.image && !lastBroadcast.content.embed) {
            previewPayload.files = [lastBroadcast.content.image];
        }
        if (!previewPayload.content && !previewPayload.embeds && !previewPayload.files) {
            previewPayload.content = '*(محتوى فارغ)*';
        }

        await message.channel.send(previewPayload);

        // زر تأكيد
        const confirmBtn = new ButtonBuilder()
            .setCustomId(`resend_confirm_${message.author.id}_${Date.now()}`)
            .setLabel('🔄 إعادة الإرسال')
            .setStyle(ButtonStyle.Success);

        const cancelBtn = new ButtonBuilder()
            .setCustomId(`resend_cancel_${message.author.id}_${Date.now()}`)
            .setLabel('❌ إلغاء')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

        const confirmMsg = await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.WARNING)
                    .setTitle('⚡ تأكيد إعادة الإرسال')
                    .setDescription('هل تريد إعادة إرسال هذا البرودكاست لكل الأعضاء؟')
                    .setFooter({ text: '⏱️ لديك 5 دقائق للتأكيد' })
            ],
            components: [row]
        });

        try {
            const interaction = await confirmMsg.awaitMessageComponent({
                filter: i => i.user.id === message.author.id,
                componentType: ComponentType.Button,
                time: COLLECTOR_TIMEOUT
            });

            if (interaction.customId.startsWith('resend_confirm_')) {
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.SUCCESS)
                            .setDescription('🔄 جاري إعادة إرسال البرودكاست...')
                    ],
                    components: []
                });

                await sendBroadcast(message.guild, message.channel, lastBroadcast.content, 0);
            } else {
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.ERROR)
                            .setDescription('❌ تم إلغاء إعادة الإرسال.')
                    ],
                    components: []
                });
            }
        } catch (error) {
            await confirmMsg.edit({
                embeds: [errorEmbed('⏱️ انتهى الوقت المخصص للتأكيد.')],
                components: []
            });
        }
    }

    // ============ أمر stats ============
    else if (command === 'stats') {
        const guildData = getGuildData(message.guild.id);
        const stats = guildData.stats;

        const totalSent = stats.totalDelivered + stats.totalFailed + stats.totalBlocked;
        const successRate = totalSent > 0 ? Math.round((stats.totalDelivered / totalSent) * 100) : 0;

        const statsEmbed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle('📊 إحصائيات البرودكاست')
            .setThumbnail(message.guild.iconURL({ dynamic: true }))
            .setDescription(`إحصائيات السيرفر: **${message.guild.name}**`)
            .addFields(
                {
                    name: '📤 إجمالي البرودكاست المُرسلة',
                    value: `> **${stats.totalBroadcasts}** برودكاست`,
                    inline: true
                },
                {
                    name: '✅ إجمالي الرسائل الواصلة',
                    value: `> **${stats.totalDelivered}** رسالة`,
                    inline: true
                },
                {
                    name: '❌ إجمالي الفشل',
                    value: `> **${stats.totalFailed}** رسالة`,
                    inline: true
                },
                {
                    name: '🔒 إجمالي المقفول خاصهم',
                    value: `> **${stats.totalBlocked}** عضو`,
                    inline: true
                },
                {
                    name: '📈 نسبة النجاح',
                    value: `> **${successRate}%**\n> ${createProgressBar(successRate)}`,
                    inline: true
                },
                {
                    name: '👥 عدد أعضاء السيرفر',
                    value: `> **${message.guild.memberCount}** عضو`,
                    inline: true
                },
                {
                    name: '📅 آخر برودكاست',
                    value: guildData.lastBroadcast
                        ? `> ${formatDate(guildData.lastBroadcast.timestamp)}`
                        : '> لم يتم إرسال أي برودكاست بعد',
                    inline: false
                },
                {
                    name: '⏰ الرسائل المجدولة',
                    value: `> **${(guildData.scheduledMessages || []).length}** رسالة مجدولة`,
                    inline: false
                }
            )
            .setFooter({ text: `طلب بواسطة: ${message.author.tag}` })
            .setTimestamp();

        await message.reply({ embeds: [statsEmbed] });
    }

    // ============ أمر admin ============
    else if (command === 'admin') {
        // التحقق من الصلاحية - يجب أن يكون Owner
        if (!isOwner(message.author.id)) {
            return message.reply({
                embeds: [errorEmbed('🔒 هذا الأمر خاص بمالك البوت فقط.')]
            });
        }

        const adminMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_menu_${message.author.id}_${Date.now()}`)
            .setPlaceholder('⚙️ اختر الإعداد')
            .addOptions([
                {
                    label: 'تغيير اسم البوت',
                    description: 'تعديل اسم العرض للبوت',
                    value: 'change_name',
                    emoji: '📝'
                },
                {
                    label: 'تغيير صورة البوت',
                    description: 'تعديل الأفاتار الخاص بالبوت',
                    value: 'change_avatar',
                    emoji: '🖼️'
                },
                {
                    label: 'تغيير البايو',
                    description: 'تعديل الوصف/البايو الخاص بالبوت',
                    value: 'change_bio',
                    emoji: '📋'
                },
                {
                    label: 'تغيير الستاتس والأكتيفيتي',
                    description: 'تعديل حالة وأكتيفيتي البوت',
                    value: 'change_status',
                    emoji: '🎮'
                },
                {
                    label: 'إضافة Admin',
                    description: 'إضافة مشرف جديد للبوت',
                    value: 'add_admin',
                    emoji: '➕'
                },
                {
                    label: 'حذف Admin',
                    description: 'إزالة مشرف من البوت',
                    value: 'remove_admin',
                    emoji: '➖'
                },
                {
                    label: 'عرض قائمة الأدمنز',
                    description: 'عرض كل المشرفين الحاليين',
                    value: 'list_admins',
                    emoji: '📋'
                }
            ]);

        const adminRow = new ActionRowBuilder().addComponents(adminMenu);

        const adminMsg = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.ADMIN)
                    .setTitle('⚙️ لوحة إعدادات البوت')
                    .setDescription('اختر الإعداد اللي تبي تعدله:')
                    .setFooter({ text: '⏱️ لديك 5 دقائق للاختيار' })
            ],
            components: [adminRow]
        });

        try {
            const adminInteraction = await adminMsg.awaitMessageComponent({
                filter: i => i.user.id === message.author.id,
                componentType: ComponentType.StringSelect,
                time: COLLECTOR_TIMEOUT
            });

            const choice = adminInteraction.values[0];

            // ---- تغيير اسم البوت ----
            if (choice === 'change_name') {
                await adminInteraction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.INFO)
                            .setDescription('📝 اكتب الاسم الجديد للبوت:')
                    ],
                    components: []
                });

                const nameResponse = await collectMessage(message.channel, message.author.id, '📝 **اكتب الاسم الجديد للبوت:**');
                if (!nameResponse) return;

                try {
                    await client.user.setUsername(nameResponse.content);
                    await message.channel.send({
                        embeds: [successEmbed(`تم تغيير اسم البوت إلى: **${nameResponse.content}**`)]
                    });

                    // تسجيل
                    await message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLORS.ADMIN)
                                .setTitle('📋 سجل العمليات')
                                .setDescription(
                                    `**📝 تم تغيير اسم البوت**\n` +
                                    `> **الاسم الجديد:** ${nameResponse.content}\n` +
                                    `> **بواسطة:** <@${message.author.id}>\n` +
                                    `> **الوقت:** ${formatDate(new Date())}`
                                )
                                .setTimestamp()
                        ]
                    });
                } catch (error) {
                    await message.channel.send({
                        embeds: [errorEmbed(`فشل تغيير الاسم: ${error.message}\n\n⚠️ ملاحظة: تغيير اسم البوت محدود بمرتين كل ساعة.`)]
                    });
                }
            }

            // ---- تغيير صورة البوت ----
            else if (choice === 'change_avatar') {
                await adminInteraction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.INFO)
                            .setDescription('🖼️ أرسل الصورة الجديدة (رابط أو ارفق صورة):')
                    ],
                    components: []
                });

                const avatarResponse = await collectMessage(message.channel, message.author.id, '🖼️ **أرسل الصورة الجديدة (رابط أو ارفق صورة):**');
                if (!avatarResponse) return;

                let avatarUrl = null;
                if (avatarResponse.attachments.size > 0) {
                    avatarUrl = avatarResponse.attachments.first().url;
                } else if (avatarResponse.content.match(/https?:\/\/\S+/)) {
                    avatarUrl = avatarResponse.content.match(/https?:\/\/\S+/)[0];
                }

                if (!avatarUrl) {
                    return message.channel.send({
                        embeds: [errorEmbed('❌ لم يتم العثور على صورة صالحة.')]
                    });
                }

                try {
                    await client.user.setAvatar(avatarUrl);
                    await message.channel.send({
                        embeds: [successEmbed('✅ تم تغيير صورة البوت بنجاح!')]
                    });

                    await message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLORS.ADMIN)
                                .setTitle('📋 سجل العمليات')
                                .setDescription(
                                    `**🖼️ تم تغيير صورة البوت**\n` +
                                    `> **بواسطة:** <@${message.author.id}>\n` +
                                    `> **الوقت:** ${formatDate(new Date())}`
                                )
                                .setThumbnail(avatarUrl)
                                .setTimestamp()
                        ]
                    });
                } catch (error) {
                    await message.channel.send({
                        embeds: [errorEmbed(`فشل تغيير الصورة: ${error.message}\n\n⚠️ ملاحظة: تغيير الصورة محدود بعدد محدد كل فترة.`)]
                    });
                }
            }

            // ---- تغيير البايو ----
            else if (choice === 'change_bio') {
                await adminInteraction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.INFO)
                            .setDescription('📋 اكتب البايو الجديد للبوت:')
                    ],
                    components: []
                });

                const bioResponse = await collectMessage(message.channel, message.author.id, '📋 **اكتب البايو الجديد:**');
                if (!bioResponse) return;

                try {
                    // تحديث البايو باستخدام REST API
                    await client.rest.patch('/users/@me', {
                        body: { bio: bioResponse.content }
                    });

                    await message.channel.send({
                        embeds: [successEmbed(`✅ تم تغيير البايو إلى:\n> ${bioResponse.content}`)]
                    });

                    await message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLORS.ADMIN)
                                .setTitle('📋 سجل العمليات')
                                .setDescription(
                                    `**📋 تم تغيير بايو البوت**\n` +
                                    `> **البايو الجديد:** ${bioResponse.content}\n` +
                                    `> **بواسطة:** <@${message.author.id}>\n` +
                                    `> **الوقت:** ${formatDate(new Date())}`
                                )
                                .setTimestamp()
                        ]
                    });
                } catch (error) {
                    await message.channel.send({
                        embeds: [errorEmbed(`فشل تغيير البايو: ${error.message}`)]
                    });
                }
            }

            // ---- تغيير الستاتس والأكتيفيتي ----
            else if (choice === 'change_status') {
                await adminInteraction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.INFO)
                            .setDescription('🎮 جاري تحضير خيارات الستاتس...')
                    ],
                    components: []
                });

                // اختيار نوع الأكتيفيتي
                const activityMenu = new StringSelectMenuBuilder()
                    .setCustomId(`activity_type_${message.author.id}_${Date.now()}`)
                    .setPlaceholder('🎮 اختر نوع الأكتيفيتي')
                    .addOptions([
                        {
                            label: 'يلعب (Playing)',
                            value: 'playing',
                            emoji: '🎮'
                        },
                        {
                            label: 'يشاهد (Watching)',
                            value: 'watching',
                            emoji: '👀'
                        },
                        {
                            label: 'يستمع (Listening)',
                            value: 'listening',
                            emoji: '🎵'
                        },
                        {
                            label: 'ينافس (Competing)',
                            value: 'competing',
                            emoji: '🏆'
                        },
                        {
                            label: 'مخصص (Custom)',
                            value: 'custom',
                            emoji: '✨'
                        }
                    ]);

                const activityRow = new ActionRowBuilder().addComponents(activityMenu);

                const activityMsg = await message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.INFO)
                            .setTitle('🎮 نوع الأكتيفيتي')
                            .setDescription('اختر نوع الأكتيفيتي:')
                    ],
                    components: [activityRow]
                });

                try {
                    const activityInteraction = await activityMsg.awaitMessageComponent({
                        filter: i => i.user.id === message.author.id,
                        componentType: ComponentType.StringSelect,
                        time: COLLECTOR_TIMEOUT
                    });

                    const activityType = activityInteraction.values[0];

                    await activityInteraction.update({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLORS.SUCCESS)
                                .setDescription(`✅ تم اختيار: **${activityType}**`)
                        ],
                        components: []
                    });

                    // جمع النص
                    const statusTextResponse = await collectMessage(message.channel, message.author.id, '📝 **اكتب نص الأكتيفيتي:**');
                    if (!statusTextResponse) return;

                    // اختيار الحالة
                    const statusMenu = new StringSelectMenuBuilder()
                        .setCustomId(`status_type_${message.author.id}_${Date.now()}`)
                        .setPlaceholder('🟢 اختر الحالة')
                        .addOptions([
                            { label: 'متصل (Online)', value: 'online', emoji: '🟢' },
                            { label: 'مشغول (Do Not Disturb)', value: 'dnd', emoji: '🔴' },
                            { label: 'غير نشط (Idle)', value: 'idle', emoji: '🟡' },
                            { label: 'غير مرئي (Invisible)', value: 'invisible', emoji: '⚫' }
                        ]);

                    const statusRow = new ActionRowBuilder().addComponents(statusMenu);

                    const statusMsg = await message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLORS.INFO)
                                .setTitle('🟢 الحالة')
                                .setDescription('اختر حالة البوت:')
                        ],
                        components: [statusRow]
                    });

                    const statusInteraction = await statusMsg.awaitMessageComponent({
                        filter: i => i.user.id === message.author.id,
                        componentType: ComponentType.StringSelect,
                        time: COLLECTOR_TIMEOUT
                    });

                    const statusType = statusInteraction.values[0];

                    // تحويل نوع الأكتيفيتي
                    const activityTypeMap = {
                        'playing': ActivityType.Playing,
                        'watching': ActivityType.Watching,
                        'listening': ActivityType.Listening,
                        'competing': ActivityType.Competing,
                        'custom': ActivityType.Custom
                    };

                    client.user.setPresence({
                        activities: [{
                            name: statusTextResponse.content,
                            type: activityTypeMap[activityType]
                        }],
                        status: statusType
                    });

                    await statusInteraction.update({
                        embeds: [
                            successEmbed(
                                `تم تحديث حالة البوت:\n` +
                                `> **النوع:** ${activityType}\n` +
                                `> **النص:** ${statusTextResponse.content}\n` +
                                `> **الحالة:** ${statusType}`
                            )
                        ],
                        components: []
                    });

                    await message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLORS.ADMIN)
                                .setTitle('📋 سجل العمليات')
                                .setDescription(
                                    `**🎮 تم تغيير ستاتس البوت**\n` +
                                    `> **النوع:** ${activityType}\n` +
                                    `> **النص:** ${statusTextResponse.content}\n` +
                                    `> **الحالة:** ${statusType}\n` +
                                    `> **بواسطة:** <@${message.author.id}>\n` +
                                    `> **الوقت:** ${formatDate(new Date())}`
                                )
                                .setTimestamp()
                        ]
                    });
                } catch (error) {
                    await activityMsg.edit({
                        embeds: [errorEmbed('⏱️ انتهى الوقت أو حدث خطأ.')],
                        components: []
                    });
                }
            }

            // ---- إضافة Admin ----
            else if (choice === 'add_admin') {
                await adminInteraction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.INFO)
                            .setDescription('➕ اكتب آيدي المستخدم أو سوله منشن:')
                    ],
                    components: []
                });

                const adminResponse = await collectMessage(message.channel, message.author.id, '➕ **اكتب آيدي المستخدم أو سوله منشن (@user):**');
                if (!adminResponse) return;

                // استخراج الآيدي
                let targetId = adminResponse.content.replace(/[<@!>]/g, '').trim();

                // التحقق من صحة الآيدي
                if (!/^\d{17,19}$/.test(targetId)) {
                    return message.channel.send({
                        embeds: [errorEmbed('❌ آيدي غير صالح. يجب أن يكون رقم أو منشن.')]
                    });
                }

                // التحقق إنه مو بوت
                try {
                    const targetUser = await client.users.fetch(targetId);
                    if (targetUser.bot) {
                        return message.channel.send({
                            embeds: [errorEmbed('❌ لا يمكن إضافة بوت كأدمن.')]
                        });
                    }
                } catch (e) {
                    return message.channel.send({
                        embeds: [errorEmbed('❌ لم يتم العثور على المستخدم.')]
                    });
                }

                const guildData = getGuildData(message.guild.id);

                if (guildData.admins.includes(targetId)) {
                    return message.channel.send({
                        embeds: [errorEmbed('⚠️ هذا المستخدم أدمن بالفعل.')]
                    });
                }

                guildData.admins.push(targetId);
                updateGuildData(message.guild.id, guildData);

                await message.channel.send({
                    embeds: [successEmbed(`تم إضافة <@${targetId}> كأدمن بنجاح!`)]
                });

                await message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.ADMIN)
                            .setTitle('📋 سجل العمليات')
                            .setDescription(
                                `**➕ تم إضافة أدمن جديد**\n` +
                                `> **المستخدم:** <@${targetId}>\n` +
                                `> **بواسطة:** <@${message.author.id}>\n` +
                                `> **الوقت:** ${formatDate(new Date())}`
                            )
                            .setTimestamp()
                    ]
                });
            }

            // ---- حذف Admin ----
            else if (choice === 'remove_admin') {
                const guildData = getGuildData(message.guild.id);

                if (guildData.admins.length === 0) {
                    await adminInteraction.update({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(COLORS.INFO)
                                .setDescription('📭 لا يوجد أدمنز حالياً.')
                        ],
                        components: []
                    });
                    return;
                }

                await adminInteraction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.INFO)
                            .setDescription('➖ اكتب آيدي الأدمن اللي تبي تحذفه أو سوله منشن:')
                    ],
                    components: []
                });

                const removeResponse = await collectMessage(message.channel, message.author.id, '➖ **اكتب آيدي الأدمن أو سوله منشن:**');
                if (!removeResponse) return;

                let removeId = removeResponse.content.replace(/[<@!>]/g, '').trim();

                if (!guildData.admins.includes(removeId)) {
                    return message.channel.send({
                        embeds: [errorEmbed('❌ هذا المستخدم ليس أدمن.')]
                    });
                }

                guildData.admins = guildData.admins.filter(id => id !== removeId);
                updateGuildData(message.guild.id, guildData);

                await message.channel.send({
                    embeds: [successEmbed(`تم حذف <@${removeId}> من الأدمنز.`)]
                });

                await message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.ADMIN)
                            .setTitle('📋 سجل العمليات')
                            .setDescription(
                                `**➖ تم حذف أدمن**\n` +
                                `> **المستخدم:** <@${removeId}>\n` +
                                `> **بواسطة:** <@${message.author.id}>\n` +
                                `> **الوقت:** ${formatDate(new Date())}`
                            )
                            .setTimestamp()
                    ]
                });
            }

            // ---- عرض قائمة الأدمنز ----
            else if (choice === 'list_admins') {
                const guildData = getGuildData(message.guild.id);
                const admins = guildData.admins;

                let adminList = '';
                if (admins.length === 0) {
                    adminList = '📭 لا يوجد أدمنز حالياً.';
                } else {
                    admins.forEach((adminId, index) => {
                        adminList += `**${index + 1}.** <@${adminId}> (\`${adminId}\`)\n`;
                    });
                }

                await adminInteraction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.ADMIN)
                            .setTitle('📋 قائمة الأدمنز')
                            .setDescription(
                                `**👑 المالك:** <@${OWNER_ID}> (\`${OWNER_ID}\`)\n\n` +
                                `**🛡️ الأدمنز (${admins.length}):**\n${adminList}`
                            )
                            .setFooter({ text: `السيرفر: ${message.guild.name}` })
                            .setTimestamp()
                    ],
                    components: []
                });
            }

        } catch (error) {
            try {
                await adminMsg.edit({
                    embeds: [errorEmbed('⏱️ انتهى الوقت المخصص للاختيار.')],
                    components: []
                });
            } catch (e) { }
        }
    }

    // ============ أمر owner ============
    else if (command === 'owner') {
        // التحقق من الصلاحية - Owner فقط
        if (!isOwner(message.author.id)) {
            return message.reply({
                embeds: [errorEmbed('🔒 هذا الأمر خاص بمالك البوت فقط.')]
            });
        }

        const guilds = client.guilds.cache;
        const data = loadData();

        // حساب الإحصائيات الشاملة
        let totalBroadcasts = 0;
        let totalMembers = 0;

        let guildsList = '';

        guilds.forEach((guild, index) => {
            const guildData = data[guild.id];
            const broadcasts = guildData?.stats?.totalBroadcasts || 0;
            totalBroadcasts += broadcasts;
            totalMembers += guild.memberCount;

            guildsList += `**${guilds.size > 1 ? '├' : '└'}** ${guild.name}\n` +
                `> 👥 الأعضاء: **${guild.memberCount}**\n` +
                `> 📤 البرودكاست: **${broadcasts}**\n` +
                `> 🛡️ الأدمنز: **${guildData?.admins?.length || 0}**\n\n`;
        });

        if (guildsList === '') {
            guildsList = '📭 لا يوجد سيرفرات.';
        }

        // حساب الـ Ping
        const ping = client.ws.ping;
        const uptime = formatUptime(client.uptime);

        const ownerEmbed = new EmbedBuilder()
            .setColor(COLORS.ADMIN)
            .setTitle('👑 لوحة تحكم المالك')
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: '📊 إحصائيات عامة',
                    value:
                        `> 🏠 السيرفرات: **${guilds.size}**\n` +
                        `> 👥 إجمالي الأعضاء: **${totalMembers}**\n` +
                        `> 📤 إجمالي البرودكاست: **${totalBroadcasts}**\n` +
                        `> 🏓 البينق: **${ping}ms**\n` +
                        `> ⏱️ وقت التشغيل: **${uptime}**`,
                    inline: false
                },
                {
                    name: '🏠 السيرفرات',
                    value: guildsList,
                    inline: false
                }
            )
            .setFooter({ text: `المالك: ${message.author.tag}` })
            .setTimestamp();

        await message.reply({ embeds: [ownerEmbed] });
    }
});

// ============ دالة تنسيق وقت التشغيل ============

/**
 * تنسيق وقت التشغيل بشكل مقروء
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days} يوم`);
    if (hours % 24 > 0) parts.push(`${hours % 24} ساعة`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60} دقيقة`);
    if (seconds % 60 > 0) parts.push(`${seconds % 60} ثانية`);

    return parts.join(' و ') || '0 ثانية';
}

// ============ معالجة الأخطاء العامة ============

// معالجة الأخطاء غير المتوقعة
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// عند انقطاع الاتصال
client.on('error', (error) => {
    console.error('❌ Client Error:', error);
});

// عند إعادة الاتصال
client.on('shardReconnecting', () => {
    console.log('🔄 جاري إعادة الاتصال...');
});

// عند استئناف الاتصال
client.on('shardResume', () => {
    console.log('✅ تم استئناف الاتصال');
});

// عند حدوث تحذير
client.on('warn', (warning) => {
    console.warn('⚠️ Warning:', warning);
});

// ============ تشغيل البوت ============
client.login(TOKEN)
    .then(() => {
        console.log('🚀 جاري تشغيل البوت...');
    })
    .catch((error) => {
        console.error('❌ فشل تشغيل البوت:', error);
        process.exit(1);
    });

// ===================================================
// متغيرات البيئة المطلوبة في Railway:
// TOKEN     ← توكن البوت من Discord Developer Portal
// OWNER_ID  ← الآيدي الخاص فيك من ديسكورد
// CLIENT_ID ← آيدي البوت من Discord Developer Portal
// ===================================================
