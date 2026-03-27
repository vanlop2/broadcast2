// ═══════════════════════════════════════════════════════════════
//  بوت البرودكاست الاحترافي — Components V2 Edition
//  discord.js v14.18+ | مارس 2025
//  كل الرسائل مبنية بـ Components V2 — بدون Embeds تقليدية
// ═══════════════════════════════════════════════════════════════

// ─── استيراد المكتبات — مرتب أبجدياً ───
const {
    ActionRowBuilder,
    ActivityType,
    ButtonBuilder,
    ButtonStyle,
    Client,
    ComponentType,
    ContainerBuilder,
    EmbedBuilder,
    GatewayIntentBits,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    ModalBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
    ThumbnailBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════
//  CONFIG — كل الإعدادات في مكان واحد
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
    // ─── أساسيات ───
    PREFIX: '#',
    TOKEN: process.env.TOKEN,
    OWNER_ID: process.env.OWNER_ID,

    // ─── توقيتات ───
    DM_DELAY: 1200,
    COLLECTOR_TIMEOUT: 300000,

    // ─── ثيم الألوان — كل لون له معنى ───
    THEME: {
        PRIMARY: 0x5865F2,    // أزرق ديسكورد — العنصر الأساسي
        SUCCESS: 0x57F287,    // أخضر — نجاح
        WARNING: 0xFEE75C,    // أصفر — تنبيه
        DANGER: 0xED4245,     // أحمر — خطأ / خطر
        INFO: 0x5865F2,       // أزرق — معلومة
        MUTED: 0x2B2D31,      // رمادي غامق — خلفية
        PINK: 0xEB459E,       // وردي — جدولة
        GOLD: 0xF0B232,       // ذهبي — إدارة
        LOG_SUCCESS: 0x57F287,
        LOG_WARNING: 0xFEE75C,
        LOG_ERROR: 0xED4245,
        LOG_MUTED: 0x95A5A6
    },

    // ─── خيارات الجدولة الجاهزة ───
    SCHEDULE_OPTIONS: [
        { label: 'الحين', value: 'now', emoji: '⚡', ms: 0 },
        { label: 'بعد 30 دقيقة', value: '30m', emoji: '⏱️', ms: 30 * 60 * 1000 },
        { label: 'بعد ساعة', value: '1h', emoji: '🕐', ms: 60 * 60 * 1000 },
        { label: 'بعد 3 ساعات', value: '3h', emoji: '🕒', ms: 3 * 60 * 60 * 1000 },
        { label: 'بعد 6 ساعات', value: '6h', emoji: '🕕', ms: 6 * 60 * 60 * 1000 },
        { label: 'بعد 12 ساعة', value: '12h', emoji: '🕛', ms: 12 * 60 * 60 * 1000 },
        { label: 'غداً — حدد الساعة', value: 'tomorrow', emoji: '📅', ms: null },
        { label: 'تاريخ مخصص', value: 'custom', emoji: '🗓️', ms: null }
    ],

    // ─── مسار ملف البيانات ───
    DATA_FILE: path.join(__dirname, 'data.json')
};

// ═══════════════════════════════════════════════════════════════
//  الكلاينت
// ═══════════════════════════════════════════════════════════════

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// مخزن المؤقتات النشطة للجدولة
const activeTimers = new Map();

// مخزن مؤقت لبيانات الـ flow (بين الخطوات)
const flowStore = new Map();

// ═══════════════════════════════════════════════════════════════
//  التخزين المحلي — data.json
// ═══════════════════════════════════════════════════════════════

function loadData() {
    try {
        if (!fs.existsSync(CONFIG.DATA_FILE)) {
            fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify({}, null, 2), 'utf-8');
            return {};
        }
        return JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf-8'));
    } catch (e) {
        console.error('[DATA] فشل القراءة:', e.message);
        return {};
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('[DATA] فشل الحفظ:', e.message);
    }
}

function getGuild(guildId) {
    const data = loadData();
    if (!data[guildId]) {
        data[guildId] = {
            admins: [],
            scheduledMessages: [],
            lastBroadcast: null,
            logChannelId: null,
            stats: {
                totalBroadcasts: 0,
                totalDelivered: 0,
                totalFailed: 0,
                totalBlocked: 0
            }
        };
        saveData(data);
    }
    // ضمان الحقول الجديدة للبيانات القديمة
    if (!data[guildId].logChannelId && data[guildId].logChannelId !== null) {
        data[guildId].logChannelId = null;
        saveData(data);
    }
    return data[guildId];
}

function saveGuild(guildId, guildData) {
    const data = loadData();
    data[guildId] = guildData;
    saveData(data);
}

// ═══════════════════════════════════════════════════════════════
//  الصلاحيات
// ═══════════════════════════════════════════════════════════════

function isOwner(userId) {
    return userId === CONFIG.OWNER_ID;
}

function isAdmin(userId, guildId) {
    if (isOwner(userId)) return true;
    return getGuild(guildId).admins.includes(userId);
}

// ═══════════════════════════════════════════════════════════════
//  أدوات مساعدة
// ═══════════════════════════════════════════════════════════════

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function formatDate(date) {
    return new Date(date).toLocaleString('en-US', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
}

function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h % 24) parts.push(`${h % 24}h`);
    if (m % 60) parts.push(`${m % 60}m`);
    if (s % 60) parts.push(`${s % 60}s`);
    return parts.join(' ') || '0s';
}

function progressBar(percent) {
    const total = 16;
    const filled = Math.round((percent / 100) * total);
    return '▰'.repeat(filled) + '▱'.repeat(total - filled) + ` ${percent}%`;
}

function uid() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════
//  بناء Components V2 — الدوال الأساسية
// ═══════════════════════════════════════════════════════════════

/**
 * بناء Container V2 كامل
 * @param {number} color - لون الشريط الجانبي
 * @param {Array} components - مصفوفة الـ components الداخلية
 */
function v2Container(color, ...components) {
    const container = new ContainerBuilder().setAccentColor(color);
    for (const comp of components) {
        if (comp) container.addComponent(comp);
    }
    return container;
}

/**
 * نص عادي
 */
function v2Text(content) {
    return new TextDisplayBuilder().setContent(content);
}

/**
 * فاصل
 */
function v2Separator(spacing = SeparatorSpacingSize.Small) {
    return new SeparatorBuilder().setSpacing(spacing).setDivider(true);
}

/**
 * Section — نص يسار + صورة مصغرة يمين
 */
function v2Section(textContent, thumbnailUrl) {
    const section = new SectionBuilder();
    section.addTextDisplayComponents(new TextDisplayBuilder().setContent(textContent));
    if (thumbnailUrl) {
        section.setThumbnail(new ThumbnailBuilder().setURL(thumbnailUrl));
    }
    return section;
}

/**
 * Section — نص يسار + زر يمين
 */
function v2SectionButton(textContent, button) {
    const section = new SectionBuilder();
    section.addTextDisplayComponents(new TextDisplayBuilder().setContent(textContent));
    section.setButtonAccessory(button);
    return section;
}

/**
 * معرض صور
 */
function v2Gallery(imageUrl) {
    return new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl)
    );
}

/**
 * إرسال رسالة V2
 */
function v2Message(container, ephemeral = false) {
    const msg = {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
    if (ephemeral) {
        msg.flags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
    }
    return msg;
}

/**
 * بناء Container خطأ
 */
function v2Error(text) {
    return v2Container(
        CONFIG.THEME.DANGER,
        v2Text(`### ✗ خطأ\n${text}`)
    );
}

/**
 * بناء Container نجاح
 */
function v2Success(text) {
    return v2Container(
        CONFIG.THEME.SUCCESS,
        v2Text(`### ✓ تم\n${text}`)
    );
}

/**
 * بناء Container معلومة
 */
function v2Info(title, text) {
    return v2Container(
        CONFIG.THEME.INFO,
        v2Text(`### ${title}\n${text}`)
    );
}

// ═══════════════════════════════════════════════════════════════
//  نظام اللوق
// ═══════════════════════════════════════════════════════════════

async function sendLog(guildId, color, action, details, userId) {
    try {
        const gd = getGuild(guildId);
        if (!gd.logChannelId) return;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const ch = await guild.channels.fetch(gd.logChannelId).catch(() => null);
        if (!ch) return;

        const container = v2Container(
            color,
            v2Text(`### ◎ سجل`),
            v2Separator(),
            v2Text(`**${action}**\n\n${details}`),
            v2Separator(),
            v2Text(`-# <@${userId}> • ${formatDate(new Date())}`)
        );

        await ch.send(v2Message(container));
    } catch (e) {
        // اللوق ما يوقف البوت
    }
}

// ═══════════════════════════════════════════════════════════════
//  جمع رسالة نصية من الشات
// ═══════════════════════════════════════════════════════════════

async function collectText(channel, userId, prompt, timeout = CONFIG.COLLECTOR_TIMEOUT) {
    const container = v2Container(
        CONFIG.THEME.INFO,
        v2Text(prompt),
        v2Separator(),
        v2Text(`-# ◷ ${Math.floor(timeout / 60000)} دقائق • اكتب "إلغاء" للخروج`)
    );

    await channel.send(v2Message(container));

    try {
        const collected = await channel.awaitMessages({
            filter: m => m.author.id === userId,
            max: 1,
            time: timeout,
            errors: ['time']
        });

        const resp = collected.first();
        if (['إلغاء', 'الغاء', 'cancel'].includes(resp.content.trim().toLowerCase())) {
            await channel.send(v2Message(v2Container(CONFIG.THEME.WARNING, v2Text('▸ تم إلغاء العملية'))));
            return null;
        }
        return resp;
    } catch {
        await channel.send(v2Message(v2Container(CONFIG.THEME.DANGER, v2Text('✗ انتهى الوقت — حاول مرة ثانية'))));
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
//  استخراج صورة من رسالة
// ═══════════════════════════════════════════════════════════════

function extractImage(msg) {
    if (msg.attachments.size > 0) return msg.attachments.first().url;
    const match = msg.content.match(/https?:\/\/\S+\.(png|jpg|jpeg|gif|webp)(\?\S*)?/i);
    if (match) return match[0];
    const general = msg.content.match(/https?:\/\/\S+/);
    return general ? general[0] : null;
}

// ═══════════════════════════════════════════════════════════════
//  بناء Payload الرسالة (للـ DM — embed عادي)
// ═══════════════════════════════════════════════════════════════

function buildDmPayload(content) {
    const payload = {};

    if (content.text) payload.content = content.text;

    if (content.embed) {
        payload.embeds = [EmbedBuilder.from(content.embed)];
    }

    if (content.image && !content.embed) {
        payload.files = [content.image];
    }

    if (!payload.content && !payload.embeds && !payload.files) {
        payload.content = '*(فارغ)*';
    }

    return payload;
}

// ═══════════════════════════════════════════════════════════════
//  إرسال البرودكاست
// ═══════════════════════════════════════════════════════════════

async function executeBroadcast(guild, channel, broadcastContent, maxMembers = 0) {
    // جلب كل الأعضاء
    await guild.members.fetch();
    let members = guild.members.cache.filter(m => !m.user.bot).map(m => m);

    // لو تجربة — نختار عشوائي
    if (maxMembers > 0 && maxMembers < members.length) {
        members = members.sort(() => Math.random() - 0.5).slice(0, maxMembers);
    }

    const total = members.length;
    let delivered = 0, failed = 0, blocked = 0;

    // رسالة التقدم
    const progressContainer = v2Container(
        CONFIG.THEME.PRIMARY,
        v2Text(`### ⊳ جاري الإرسال`),
        v2Separator(),
        v2Text(`▸ الأعضاء: **${total}**\n▸ الحالة: **بدأ...**\n\n\`${progressBar(0)}\``)
    );

    const progressMsg = await channel.send(v2Message(progressContainer));

    let counter = 0;

    for (let i = 0; i < members.length; i++) {
        const member = members[i];

        try {
            const payload = buildDmPayload(broadcastContent);
            await member.send(payload);
            delivered++;
        } catch (err) {
            if (err.code === 50007) blocked++;
            else failed++;
        }

        counter++;

        // تحديث كل 8 أعضاء أو عند النهاية
        if (counter >= 8 || i === members.length - 1) {
            counter = 0;
            const pct = Math.round(((i + 1) / total) * 100);

            try {
                const updateContainer = v2Container(
                    CONFIG.THEME.PRIMARY,
                    v2Text(`### ⊳ جاري الإرسال`),
                    v2Separator(),
                    v2Text(
                        `✓ وصل: **${delivered}**\n` +
                        `✗ فشل: **${failed}**\n` +
                        `⊘ مقفل: **${blocked}**\n` +
                        `◷ متبقي: **${total - (i + 1)}**\n\n` +
                        `\`${progressBar(pct)}\``
                    )
                );
                await progressMsg.edit(v2Message(updateContainer));
            } catch (e) { }
        }

        if (i < members.length - 1) await sleep(CONFIG.DM_DELAY);
    }

    // التقرير النهائي
    const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    const reportContainer = v2Container(
        delivered > 0 ? CONFIG.THEME.SUCCESS : CONFIG.THEME.DANGER,
        v2Text(`### ◈ التقرير النهائي`),
        v2Separator(),
        v2Text(
            (maxMembers > 0 ? '`  تجربة  `\n\n' : '') +
            `◉ المستهدفين: **${total}**\n` +
            `✓ وصل بنجاح: **${delivered}**\n` +
            `✗ فشل: **${failed}**\n` +
            `⊘ مقفل الخاص: **${blocked}**\n\n` +
            `\`${progressBar(rate)}\``
        ),
        v2Separator(),
        v2Text(`-# ${guild.name} • ${formatDate(new Date())}`)
    );

    try {
        await progressMsg.edit(v2Message(reportContainer));
    } catch {
        await channel.send(v2Message(reportContainer));
    }

    // تحديث الإحصائيات
    const gd = getGuild(guild.id);
    gd.stats.totalBroadcasts++;
    gd.stats.totalDelivered += delivered;
    gd.stats.totalFailed += failed;
    gd.stats.totalBlocked += blocked;

    gd.lastBroadcast = {
        content: { ...broadcastContent },
        timestamp: new Date().toISOString(),
        stats: { delivered, failed, blocked, total }
    };
    saveGuild(guild.id, gd);

    // لوق
    await sendLog(guild.id, CONFIG.THEME.LOG_SUCCESS,
        maxMembers > 0 ? 'برودكاست تجريبي' : 'برودكاست تم إرساله',
        `◉ المستهدفين: **${total}**\n✓ وصل: **${delivered}**\n✗ فشل: **${failed}**\n⊘ مقفل: **${blocked}**\n◈ النسبة: **${rate}%**`,
        'system'
    );

    return { delivered, failed, blocked, total };
}

// ═══════════════════════════════════════════════════════════════
//  Flow البرودكاست التفاعلي الكامل
// ═══════════════════════════════════════════════════════════════

async function broadcastFlow(message, isTest = false) {
    const userId = message.author.id;
    const channel = message.channel;
    const guildId = message.guild.id;
    const ts = uid();

    // ═══ الخطوة 1: نوع المحتوى ═══
    const typeMenu = new StringSelectMenuBuilder()
        .setCustomId(`bc_type_${ts}`)
        .setPlaceholder('اختر نوع المحتوى...')
        .addOptions([
            { label: 'نص فقط', description: 'رسالة نصية بدون مرفقات', value: 'text_only', emoji: '📄' },
            { label: 'صورة فقط', description: 'صورة بدون نص', value: 'image_only', emoji: '🖼️' },
            { label: 'نص + صورة', description: 'رسالة نصية مع صورة', value: 'text_and_image', emoji: '📎' }
        ]);

    const step1Container = v2Container(
        CONFIG.THEME.PRIMARY,
        v2Text(`### ${isTest ? '∗ برودكاست تجريبي' : '⊳ برودكاست جديد'}`),
        v2Separator(),
        v2Text(`مرحباً <@${userId}>\n\n▸ وش نوع الرسالة اللي تبي ترسلها؟`),
        v2Separator(),
        v2Text(`-# الخطوة 1 من 5`),
        new ActionRowBuilder().addComponents(typeMenu)
    );

    const step1Msg = await channel.send(v2Message(step1Container));

    let contentType;
    try {
        const typeInt = await step1Msg.awaitMessageComponent({
            filter: i => i.user.id === userId && i.customId === `bc_type_${ts}`,
            componentType: ComponentType.StringSelect,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        contentType = typeInt.values[0];
        const label = contentType === 'text_only' ? 'نص فقط' : contentType === 'image_only' ? 'صورة فقط' : 'نص + صورة';

        await typeInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`✓ النوع: **${label}**`))));
    } catch {
        return step1Msg.edit(v2Message(v2Error('انتهى الوقت'))).catch(() => { });
    }

    // ═══ الخطوة 2: شكل الرسالة ═══
    const ts2 = uid();
    const styleMenu = new StringSelectMenuBuilder()
        .setCustomId(`bc_style_${ts2}`)
        .setPlaceholder('اختر شكل الرسالة...')
        .addOptions([
            { label: 'Embed منسق', description: 'رسالة بإطار وألوان', value: 'embed', emoji: '✨' },
            { label: 'رسالة عادية', description: 'نص بدون تنسيق', value: 'plain', emoji: '💬' }
        ]);

    const step2Container = v2Container(
        CONFIG.THEME.PRIMARY,
        v2Text(`### ⟐ شكل الرسالة`),
        v2Separator(),
        v2Text(`▸ تبي الرسالة تكون Embed ولا عادية؟`),
        v2Separator(),
        v2Text(`-# الخطوة 2 من 5`),
        new ActionRowBuilder().addComponents(styleMenu)
    );

    const step2Msg = await channel.send(v2Message(step2Container));

    let useEmbed;
    try {
        const styleInt = await step2Msg.awaitMessageComponent({
            filter: i => i.user.id === userId && i.customId === `bc_style_${ts2}`,
            componentType: ComponentType.StringSelect,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        useEmbed = styleInt.values[0] === 'embed';

        await styleInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`✓ الشكل: **${useEmbed ? 'Embed' : 'عادي'}**`))));
    } catch {
        return step2Msg.edit(v2Message(v2Error('انتهى الوقت'))).catch(() => { });
    }

    // ═══ الخطوة 3: جمع المحتوى ═══
    let broadcastContent = { text: null, image: null, embed: null, type: contentType, isEmbed: useEmbed };

    if (contentType === 'text_only' || contentType === 'text_and_image') {
        if (useEmbed) {
            // Modal لإدخال بيانات الـ Embed
            const ts3 = uid();

            // نحتاج interaction عشان نفتح Modal — نستخدم زر مؤقت
            const modalTriggerBtn = new ButtonBuilder()
                .setCustomId(`bc_modal_trigger_${ts3}`)
                .setLabel('✏️ اكتب المحتوى')
                .setStyle(ButtonStyle.Primary);

            const triggerContainer = v2Container(
                CONFIG.THEME.PRIMARY,
                v2Text(`### ✏️ محتوى الرسالة`),
                v2Separator(),
                v2Text(`▸ اضغط الزر عشان تكتب العنوان والمحتوى`),
                v2Separator(),
                v2Text(`-# الخطوة 3 من 5`),
                new ActionRowBuilder().addComponents(modalTriggerBtn)
            );

            const triggerMsg = await channel.send(v2Message(triggerContainer));

            try {
                const btnInt = await triggerMsg.awaitMessageComponent({
                    filter: i => i.user.id === userId && i.customId === `bc_modal_trigger_${ts3}`,
                    componentType: ComponentType.Button,
                    time: CONFIG.COLLECTOR_TIMEOUT
                });

                // فتح Modal
                const modal = new ModalBuilder()
                    .setCustomId(`bc_embed_modal_${ts3}`)
                    .setTitle('محتوى البرودكاست');

                const titleInput = new TextInputBuilder()
                    .setCustomId('embed_title')
                    .setLabel('العنوان')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(256);

                const descInput = new TextInputBuilder()
                    .setCustomId('embed_desc')
                    .setLabel('المحتوى')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(4000);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                    new ActionRowBuilder().addComponents(descInput)
                );

                await btnInt.showModal(modal);

                // انتظار الـ Modal
                const modalInt = await btnInt.awaitModalSubmit({
                    filter: i => i.customId === `bc_embed_modal_${ts3}`,
                    time: CONFIG.COLLECTOR_TIMEOUT
                });

                const embedTitle = modalInt.fields.getTextInputValue('embed_title');
                const embedDesc = modalInt.fields.getTextInputValue('embed_desc');

                const bEmbed = new EmbedBuilder()
                    .setColor(CONFIG.THEME.PRIMARY)
                    .setTitle(embedTitle)
                    .setDescription(embedDesc)
                    .setTimestamp();

                broadcastContent.embed = bEmbed.toJSON();

                await modalInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`✓ تم حفظ المحتوى`))));

                // لو فيه صورة
                if (contentType === 'text_and_image') {
                    const imgResp = await collectText(channel, userId, '▸ أرسل **الصورة** — رابط أو ارفق ملف:');
                    if (!imgResp) return;

                    const imgUrl = extractImage(imgResp);
                    if (imgUrl) {
                        // نعدل الـ embed ونضيف الصورة
                        const updatedEmbed = EmbedBuilder.from(broadcastContent.embed).setImage(imgUrl);
                        broadcastContent.embed = updatedEmbed.toJSON();
                        broadcastContent.image = imgUrl;
                    }
                }

            } catch (err) {
                return triggerMsg.edit(v2Message(v2Error('انتهى الوقت أو حدث خطأ'))).catch(() => { });
            }

        } else {
            // رسالة عادية — يكتب في الشات
            const textResp = await collectText(channel, userId, '▸ اكتب **نص الرسالة**:');
            if (!textResp) return;
            broadcastContent.text = textResp.content;

            if (contentType === 'text_and_image') {
                const imgResp = await collectText(channel, userId, '▸ أرسل **الصورة** — رابط أو ارفق ملف:');
                if (!imgResp) return;
                const imgUrl = extractImage(imgResp);
                if (imgUrl) broadcastContent.image = imgUrl;
            }
        }

    } else if (contentType === 'image_only') {
        if (useEmbed) {
            const ts3i = uid();
            const modalTriggerBtn = new ButtonBuilder()
                .setCustomId(`bc_img_modal_trigger_${ts3i}`)
                .setLabel('✏️ عنوان الـ Embed (اختياري)')
                .setStyle(ButtonStyle.Primary);

            const skipBtn = new ButtonBuilder()
                .setCustomId(`bc_img_skip_${ts3i}`)
                .setLabel('تخطي العنوان')
                .setStyle(ButtonStyle.Secondary);

            const imgTriggerContainer = v2Container(
                CONFIG.THEME.PRIMARY,
                v2Text(`### ✏️ عنوان الـ Embed`),
                v2Separator(),
                v2Text(`▸ تبي تضيف عنوان للـ Embed ولا تتخطى؟`),
                v2Separator(),
                v2Text(`-# الخطوة 3 من 5`),
                new ActionRowBuilder().addComponents(modalTriggerBtn, skipBtn)
            );

            const imgTriggerMsg = await channel.send(v2Message(imgTriggerContainer));

            let embedTitle = null;

            try {
                const trigInt = await imgTriggerMsg.awaitMessageComponent({
                    filter: i => i.user.id === userId && (i.customId === `bc_img_modal_trigger_${ts3i}` || i.customId === `bc_img_skip_${ts3i}`),
                    componentType: ComponentType.Button,
                    time: CONFIG.COLLECTOR_TIMEOUT
                });

                if (trigInt.customId === `bc_img_modal_trigger_${ts3i}`) {
                    const modal = new ModalBuilder()
                        .setCustomId(`bc_img_title_modal_${ts3i}`)
                        .setTitle('عنوان الـ Embed');

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('img_title')
                                .setLabel('العنوان')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                                .setMaxLength(256)
                        )
                    );

                    await trigInt.showModal(modal);

                    const modalInt = await trigInt.awaitModalSubmit({
                        filter: i => i.customId === `bc_img_title_modal_${ts3i}`,
                        time: CONFIG.COLLECTOR_TIMEOUT
                    });

                    embedTitle = modalInt.fields.getTextInputValue('img_title');
                    await modalInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`✓ العنوان: **${embedTitle}**`))));
                } else {
                    await trigInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`✓ بدون عنوان`))));
                }

            } catch {
                return imgTriggerMsg.edit(v2Message(v2Error('انتهى الوقت'))).catch(() => { });
            }

            // طلب الصورة
            const imgResp = await collectText(channel, userId, '▸ أرسل **الصورة** — رابط أو ارفق ملف:');
            if (!imgResp) return;

            const imgUrl = extractImage(imgResp);
            const bEmbed = new EmbedBuilder().setColor(CONFIG.THEME.PRIMARY).setTimestamp();
            if (embedTitle) bEmbed.setTitle(embedTitle);
            if (imgUrl) {
                bEmbed.setImage(imgUrl);
                broadcastContent.image = imgUrl;
            }
            broadcastContent.embed = bEmbed.toJSON();

        } else {
            // صورة عادية بدون embed
            const imgResp = await collectText(channel, userId, '▸ أرسل **الصورة** — رابط أو ارفق ملف:');
            if (!imgResp) return;
            const imgUrl = extractImage(imgResp);
            if (imgUrl) broadcastContent.image = imgUrl;
        }
    }

    // ═══ الخطوة 4: وقت الإرسال ═══
    const ts4 = uid();
    const scheduleMenu = new StringSelectMenuBuilder()
        .setCustomId(`bc_sched_${ts4}`)
        .setPlaceholder('متى تبي ترسل؟')
        .addOptions(CONFIG.SCHEDULE_OPTIONS.map(opt => ({
            label: opt.label,
            value: opt.value,
            emoji: opt.emoji
        })));

    const step4Container = v2Container(
        CONFIG.THEME.PINK,
        v2Text(`### ◷ وقت الإرسال`),
        v2Separator(),
        v2Text(`▸ متى تبي ترسل البرودكاست؟`),
        v2Separator(),
        v2Text(`-# الخطوة 4 من 5 • التوقيت: الرياض`),
        new ActionRowBuilder().addComponents(scheduleMenu)
    );

    const step4Msg = await channel.send(v2Message(step4Container));

    let sendNow = false;
    let scheduledTime = null;

    try {
        const schedInt = await step4Msg.awaitMessageComponent({
            filter: i => i.user.id === userId && i.customId === `bc_sched_${ts4}`,
            componentType: ComponentType.StringSelect,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        const schedChoice = schedInt.values[0];
        const schedOption = CONFIG.SCHEDULE_OPTIONS.find(o => o.value === schedChoice);

        if (schedChoice === 'now') {
            sendNow = true;
            await schedInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`✓ إرسال فوري`))));

        } else if (schedOption.ms !== null) {
            // وقت نسبي (بعد X)
            scheduledTime = new Date(Date.now() + schedOption.ms).toISOString();
            await schedInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`✓ ${schedOption.label} — ${formatDate(scheduledTime)}`))));

        } else if (schedChoice === 'tomorrow') {
            await schedInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`✓ غداً — حدد الساعة`))));

            const timeResp = await collectText(channel, userId, '▸ اكتب الساعة بصيغة **HH:MM** (مثال: `14:30`):');
            if (!timeResp) return;

            const timeMatch = timeResp.content.trim().match(/^(\d{2}):(\d{2})$/);
            if (!timeMatch) {
                return channel.send(v2Message(v2Error('صيغة الوقت غلط — استخدم HH:MM')));
            }

            // حساب غداً بتوقيت الرياض
            const now = new Date();
            const riyadhNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
            const tomorrow = new Date(riyadhNow);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);

            // التحويل من توقيت الرياض لـ UTC
            const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T${timeMatch[1]}:${timeMatch[2]}:00+03:00`;
            scheduledTime = new Date(tomorrowStr).toISOString();

        } else if (schedChoice === 'custom') {
            await schedInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`✓ تاريخ مخصص`))));

            const timeResp = await collectText(channel, userId, '▸ اكتب التاريخ والوقت بتوقيت الرياض:\n```\nالصيغة: YYYY-MM-DD HH:MM\nمثال:  2025-06-20 15:30\n```');
            if (!timeResp) return;

            const match = timeResp.content.trim().match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
            if (!match) {
                return channel.send(v2Message(v2Error('صيغة غلط — استخدم: `YYYY-MM-DD HH:MM`')));
            }

            const [, yr, mo, dy, hr, mn] = match;
            const customDate = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:00+03:00`);

            if (customDate <= new Date()) {
                return channel.send(v2Message(v2Error('الوقت هذا في الماضي')));
            }

            scheduledTime = customDate.toISOString();
        }

        if (scheduledTime) {
            broadcastContent.scheduledTime = scheduledTime;
        }

    } catch {
        return step4Msg.edit(v2Message(v2Error('انتهى الوقت'))).catch(() => { });
    }

    // ═══ لو تجربة — نسأل عن العدد ═══
    let testCount = 0;
    if (isTest) {
        const countResp = await collectText(channel, userId, '▸ كم عضو تبي ترسل لهم كتجربة؟');
        if (!countResp) return;

        testCount = parseInt(countResp.content);
        if (isNaN(testCount) || testCount < 1) {
            return channel.send(v2Message(v2Error('اكتب رقم صحيح أكبر من 0')));
        }
    }

    // ═══ الخطوة 5: Preview + تأكيد ═══
    // عرض المعاينة
    const previewHeaderContainer = v2Container(
        CONFIG.THEME.WARNING,
        v2Text(`### ✦ معاينة الرسالة`),
        v2Separator(),
        v2Section(
            `▸ السيرفر: **${message.guild.name}**\n▸ الأعضاء: **${message.guild.memberCount}**`,
            message.guild.iconURL({ dynamic: true, size: 64 }) || undefined
        ),
        v2Separator(),
        v2Text(`-# الخطوة 5 من 5 — تأكد من كل شي قبل الإرسال`)
    );

    await channel.send(v2Message(previewHeaderContainer));

    // عرض المحتوى كما سيظهر في الـ DM (embed عادي)
    const previewPayload = buildDmPayload(broadcastContent);
    await channel.send(previewPayload);

    // معلومات إضافية + أزرار
    const ts5 = uid();
    let extraInfo = '';
    if (scheduledTime) extraInfo += `\n◷ الموعد: **${formatDate(scheduledTime)}**`;
    if (isTest) extraInfo += `\n∗ تجربة: **${testCount}** عضو`;

    const confirmBtn = new ButtonBuilder()
        .setCustomId(`bc_confirm_${ts5}`)
        .setLabel(sendNow ? '⚡ أرسل الحين' : '⏰ أكد الجدولة')
        .setStyle(ButtonStyle.Success);

    const cancelBtn = new ButtonBuilder()
        .setCustomId(`bc_cancel_${ts5}`)
        .setLabel('✗ إلغاء')
        .setStyle(ButtonStyle.Danger);

    const confirmContainer = v2Container(
        CONFIG.THEME.WARNING,
        v2Text(`### ⚡ تأكيد ${sendNow ? 'الإرسال' : 'الجدولة'}`),
        v2Separator(),
        v2Text(`▸ كل شي جاهز؟${extraInfo}`),
        new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)
    );

    const confirmMsg = await channel.send(v2Message(confirmContainer));

    try {
        const confInt = await confirmMsg.awaitMessageComponent({
            filter: i => i.user.id === userId && (i.customId === `bc_confirm_${ts5}` || i.customId === `bc_cancel_${ts5}`),
            componentType: ComponentType.Button,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        if (confInt.customId === `bc_confirm_${ts5}`) {
            await confInt.update(v2Message(v2Container(
                CONFIG.THEME.SUCCESS,
                v2Text(sendNow ? `### ⊳ جاري الإرسال...` : `### ◷ جاري الجدولة...`)
            )));

            if (sendNow) {
                // لوق بدء الإرسال
                await sendLog(guildId, CONFIG.THEME.LOG_WARNING,
                    'بدء إرسال برودكاست',
                    `▸ النوع: **${contentType}**\n▸ تجربة: **${isTest ? 'نعم — ' + testCount : 'لا'}**`,
                    userId
                );

                await executeBroadcast(message.guild, channel, broadcastContent, isTest ? testCount : 0);
            } else {
                // حفظ الجدولة
                const schedId = `s_${uid()}`;
                const gd = getGuild(guildId);

                const entry = {
                    id: schedId,
                    content: broadcastContent,
                    scheduledTime,
                    channelId: channel.id,
                    createdBy: userId,
                    createdAt: new Date().toISOString(),
                    isTest,
                    testCount
                };

                gd.scheduledMessages.push(entry);
                saveGuild(guildId, gd);
                startTimer(message.guild, entry);

                const schedContainer = v2Container(
                    CONFIG.THEME.PINK,
                    v2Text(`### ✓ تم جدولة البرودكاست`),
                    v2Separator(),
                    v2Text(
                        `⊿ المعرف: \`${schedId}\`\n` +
                        `◷ الموعد: **${formatDate(scheduledTime)}**\n` +
                        `◉ بواسطة: <@${userId}>`
                    ),
                    v2Separator(),
                    v2Text(`-# يمكنك إلغاءها من ${CONFIG.PREFIX}scheduled`)
                );

                await channel.send(v2Message(schedContainer));

                await sendLog(guildId, CONFIG.THEME.LOG_WARNING,
                    'تم جدولة برودكاست',
                    `⊿ المعرف: \`${schedId}\`\n◷ الموعد: **${formatDate(scheduledTime)}**`,
                    userId
                );
            }

        } else {
            await confInt.update(v2Message(v2Container(CONFIG.THEME.DANGER, v2Text(`✗ تم إلغاء البرودكاست`))));
        }

    } catch {
        confirmMsg.edit(v2Message(v2Error('انتهى الوقت'))).catch(() => { });
    }
}

// ═══════════════════════════════════════════════════════════════
//  نظام الجدولة
// ═══════════════════════════════════════════════════════════════

function startTimer(guild, entry) {
    const delay = new Date(entry.scheduledTime).getTime() - Date.now();

    if (delay <= 0) {
        runScheduled(guild, entry);
        return;
    }

    const timer = setTimeout(() => runScheduled(guild, entry), delay);
    activeTimers.set(entry.id, timer);
}

async function runScheduled(guild, entry) {
    try {
        const ch = await guild.channels.fetch(entry.channelId).catch(() => null);
        if (!ch) return;

        const notifyContainer = v2Container(
            CONFIG.THEME.PINK,
            v2Text(`### ◷ تنفيذ جدولة`),
            v2Separator(),
            v2Text(`⊿ المعرف: \`${entry.id}\`\n◉ بواسطة: <@${entry.createdBy}>`)
        );

        await ch.send(v2Message(notifyContainer));

        await sendLog(guild.id, CONFIG.THEME.LOG_WARNING,
            'تنفيذ جدولة تلقائي',
            `⊿ المعرف: \`${entry.id}\``,
            entry.createdBy
        );

        await executeBroadcast(guild, ch, entry.content, entry.isTest ? entry.testCount : 0);

        // حذف الجدولة
        const gd = getGuild(guild.id);
        gd.scheduledMessages = gd.scheduledMessages.filter(s => s.id !== entry.id);
        saveGuild(guild.id, gd);
        activeTimers.delete(entry.id);

    } catch (err) {
        console.error('[SCHEDULE] خطأ:', err.message);
    }
}

async function loadAllSchedules() {
    const data = loadData();

    for (const [guildId, gd] of Object.entries(data)) {
        if (!gd.scheduledMessages?.length) continue;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        const now = Date.now();
        const valid = [];

        for (const sched of gd.scheduledMessages) {
            if (new Date(sched.scheduledTime).getTime() > now) {
                valid.push(sched);
                startTimer(guild, sched);
            } else {
                runScheduled(guild, sched);
            }
        }

        gd.scheduledMessages = valid;
        saveGuild(guildId, gd);
    }

    console.log('[SCHEDULE] تم تحميل الجدولات');
}

// ═══════════════════════════════════════════════════════════════
//  الأحداث والأوامر
// ═══════════════════════════════════════════════════════════════

client.once('ready', async () => {
    console.log(`\n  ✦ البوت شغال: ${client.user.tag}`);
    console.log(`  ▸ السيرفرات: ${client.guilds.cache.size}`);
    console.log(`  ▸ الأعضاء: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}\n`);

    client.user.setPresence({
        activities: [{ name: `${CONFIG.PREFIX}help`, type: ActivityType.Watching }],
        status: 'online'
    });

    await loadAllSchedules();

    // لوق تشغيل البوت
    const data = loadData();
    for (const [guildId, gd] of Object.entries(data)) {
        if (gd.logChannelId) {
            await sendLog(guildId, CONFIG.THEME.LOG_SUCCESS,
                'البوت شغال',
                `▸ السيرفرات: **${client.guilds.cache.size}**\n▸ البينق: **${client.ws.ping}ms**`,
                'system'
            );
        }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(CONFIG.PREFIX)) return;

    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  HELP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    if (cmd === 'help') {
        const container = v2Container(
            CONFIG.THEME.PRIMARY,
            v2Text(`### ✦ أوامر البوت`),
            v2Separator(),
            v2Text(`مرحباً <@${message.author.id}> 〜\nهذي كل الأوامر المتاحة:`),
            v2Separator(SeparatorSpacingSize.Large),

            // ── أوامر البرودكاست ──
            v2Text(`\` البرودكاست \``),
            v2Separator(),

            v2SectionButton(
                `**${CONFIG.PREFIX}broadcast**\n-# إنشاء وإرسال برودكاست جديد`,
                new ButtonBuilder().setCustomId('h_1').setLabel('📤').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),
            v2SectionButton(
                `**${CONFIG.PREFIX}broadcast test**\n-# تجربة الإرسال لعدد محدد`,
                new ButtonBuilder().setCustomId('h_2').setLabel('🧪').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),
            v2SectionButton(
                `**${CONFIG.PREFIX}scheduled**\n-# عرض وإدارة الرسائل المجدولة`,
                new ButtonBuilder().setCustomId('h_3').setLabel('⏰').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),
            v2SectionButton(
                `**${CONFIG.PREFIX}resend**\n-# إعادة إرسال آخر برودكاست`,
                new ButtonBuilder().setCustomId('h_4').setLabel('🔄').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),
            v2SectionButton(
                `**${CONFIG.PREFIX}stats**\n-# إحصائيات الإرسال`,
                new ButtonBuilder().setCustomId('h_5').setLabel('📊').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),

            v2Separator(SeparatorSpacingSize.Large),
            v2Text(`\` الإدارة ♛ \``),
            v2Separator(),

            v2SectionButton(
                `**${CONFIG.PREFIX}admin**\n-# إعدادات البوت والأدمنز`,
                new ButtonBuilder().setCustomId('h_6').setLabel('⚙️').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),
            v2SectionButton(
                `**${CONFIG.PREFIX}setlog**\n-# تحديد قناة السجل`,
                new ButtonBuilder().setCustomId('h_7').setLabel('📋').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),
            v2SectionButton(
                `**${CONFIG.PREFIX}owner**\n-# لوحة تحكم المالك`,
                new ButtonBuilder().setCustomId('h_8').setLabel('👑').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),
            v2SectionButton(
                `**${CONFIG.PREFIX}restart**\n-# إعادة تشغيل البوت`,
                new ButtonBuilder().setCustomId('h_9').setLabel('🔁').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ),

            v2Separator(),
            v2Text(`-# البادئة: ${CONFIG.PREFIX} • التوقيت: الرياض`)
        );

        await message.reply(v2Message(container));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  BROADCAST + BROADCAST TEST
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'broadcast') {
        if (!isAdmin(message.author.id, message.guild.id)) {
            return message.reply(v2Message(v2Error('ما عندك صلاحية — لازم تكون Admin أو Owner')));
        }

        const isTest = args[0]?.toLowerCase() === 'test';
        await broadcastFlow(message, isTest);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SCHEDULED
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'scheduled') {
        if (!isAdmin(message.author.id, message.guild.id)) {
            return message.reply(v2Message(v2Error('ما عندك صلاحية')));
        }

        const gd = getGuild(message.guild.id);
        const scheds = gd.scheduledMessages || [];

        if (scheds.length === 0) {
            const emptyContainer = v2Container(
                CONFIG.THEME.MUTED,
                v2Text(`### ◷ الرسائل المجدولة`),
                v2Separator(),
                v2Text(`○ لا توجد جدولات نشطة`)
            );
            return message.reply(v2Message(emptyContainer));
        }

        // بناء الـ container بـ section لكل جدولة
        const components = [
            v2Text(`### ◷ الرسائل المجدولة — ${scheds.length}`),
            v2Separator()
        ];

        for (let i = 0; i < scheds.length; i++) {
            const s = scheds[i];
            const typeLabel = s.content.type === 'text_only' ? 'نص' : s.content.type === 'image_only' ? 'صورة' : 'نص + صورة';

            const cancelBtn = new ButtonBuilder()
                .setCustomId(`csched_${s.id}`)
                .setLabel(`إلغاء`)
                .setStyle(ButtonStyle.Danger);

            components.push(
                v2SectionButton(
                    `**جدولة #${i + 1}**\n` +
                    `-# المعرف: \`${s.id}\`\n` +
                    `-# الموعد: ${formatDate(s.scheduledTime)}\n` +
                    `-# النوع: ${typeLabel} • بواسطة: <@${s.createdBy}>`,
                    cancelBtn
                )
            );

            if (i < scheds.length - 1) components.push(v2Separator());
        }

        const container = v2Container(CONFIG.THEME.PINK, ...components);
        const schedMsg = await message.reply(v2Message(container));

        // الاستماع لأزرار الإلغاء
        const collector = schedMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            componentType: ComponentType.Button,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        collector.on('collect', async (int) => {
            const schedId = int.customId.replace('csched_', '');

            if (activeTimers.has(schedId)) {
                clearTimeout(activeTimers.get(schedId));
                activeTimers.delete(schedId);
            }

            const currentGd = getGuild(message.guild.id);
            currentGd.scheduledMessages = currentGd.scheduledMessages.filter(s => s.id !== schedId);
            saveGuild(message.guild.id, currentGd);

            await int.update(v2Message(v2Success(`تم إلغاء الجدولة: \`${schedId}\``)));

            await sendLog(message.guild.id, CONFIG.THEME.LOG_ERROR,
                'تم إلغاء جدولة',
                `⊿ المعرف: \`${schedId}\``,
                int.user.id
            );

            collector.stop();
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'time') {
                try { await schedMsg.edit(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`-# انتهى وقت التفاعل`)))); } catch { }
            }
        });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  RESEND
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'resend') {
        if (!isAdmin(message.author.id, message.guild.id)) {
            return message.reply(v2Message(v2Error('ما عندك صلاحية')));
        }

        const gd = getGuild(message.guild.id);

        if (!gd.lastBroadcast) {
            return message.reply(v2Message(v2Container(
                CONFIG.THEME.MUTED,
                v2Text(`### ⊳ إعادة إرسال`),
                v2Separator(),
                v2Text(`○ ما في برودكاست سابق`)
            )));
        }

        const last = gd.lastBroadcast;

        // معاينة
        const previewContainer = v2Container(
            CONFIG.THEME.WARNING,
            v2Text(`### ✦ معاينة آخر برودكاست`),
            v2Separator(),
            v2Text(
                `◷ تم إرساله: **${formatDate(last.timestamp)}**\n\n` +
                `✓ وصل: **${last.stats.delivered}**\n` +
                `✗ فشل: **${last.stats.failed}**\n` +
                `⊘ مقفل: **${last.stats.blocked}**`
            )
        );

        await message.channel.send(v2Message(previewContainer));

        // عرض المحتوى
        const preview = buildDmPayload(last.content);
        await message.channel.send(preview);

        // تأكيد
        const ts = uid();
        const confirmBtn = new ButtonBuilder().setCustomId(`rs_yes_${ts}`).setLabel('أعد الإرسال').setStyle(ButtonStyle.Success);
        const cancelBtn = new ButtonBuilder().setCustomId(`rs_no_${ts}`).setLabel('إلغاء').setStyle(ButtonStyle.Danger);

        const confirmContainer = v2Container(
            CONFIG.THEME.WARNING,
            v2Text(`▸ تأكيد إعادة الإرسال؟`),
            new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)
        );

        const confirmMsg = await message.channel.send(v2Message(confirmContainer));

        try {
            const int = await confirmMsg.awaitMessageComponent({
                filter: i => i.user.id === message.author.id,
                componentType: ComponentType.Button,
                time: CONFIG.COLLECTOR_TIMEOUT
            });

            if (int.customId === `rs_yes_${ts}`) {
                await int.update(v2Message(v2Container(CONFIG.THEME.SUCCESS, v2Text(`### ⊳ جاري إعادة الإرسال...`))));

                await sendLog(message.guild.id, CONFIG.THEME.LOG_WARNING,
                    'إعادة إرسال برودكاست', '▸ إعادة إرسال آخر برودكاست', message.author.id
                );

                await executeBroadcast(message.guild, message.channel, last.content, 0);
            } else {
                await int.update(v2Message(v2Container(CONFIG.THEME.DANGER, v2Text(`✗ تم الإلغاء`))));
            }
        } catch {
            confirmMsg.edit(v2Message(v2Error('انتهى الوقت'))).catch(() => { });
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  STATS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'stats') {
        const gd = getGuild(message.guild.id);
        const st = gd.stats;
        const total = st.totalDelivered + st.totalFailed + st.totalBlocked;
        const rate = total > 0 ? Math.round((st.totalDelivered / total) * 100) : 0;

        const container = v2Container(
            CONFIG.THEME.INFO,
            v2Text(`### ◈ إحصائيات السيرفر`),
            v2Separator(),

            v2Section(
                `**${message.guild.name}**\n-# ${message.guild.memberCount} عضو`,
                message.guild.iconURL({ dynamic: true, size: 64 }) || undefined
            ),

            v2Separator(),

            v2Text(
                `⊳ البرودكاست المرسلة: **${st.totalBroadcasts}**\n` +
                `✓ رسائل وصلت: **${st.totalDelivered}**\n` +
                `✗ رسائل فشلت: **${st.totalFailed}**\n` +
                `⊘ خاص مقفل: **${st.totalBlocked}**\n\n` +
                `◈ نسبة الوصول:\n\`${progressBar(rate)}\``
            ),

            v2Separator(),

            v2Text(
                `◷ مجدولة: **${(gd.scheduledMessages || []).length}**\n\n` +
                `⊿ آخر برودكاست:\n` +
                `${gd.lastBroadcast ? `\`${formatDate(gd.lastBroadcast.timestamp)}\`` : '`لم يتم الإرسال بعد`'}`
            ),

            v2Separator(),
            v2Text(`-# ${message.guild.name}`)
        );

        await message.reply(v2Message(container));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SETLOG
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'setlog') {
        if (!isOwner(message.author.id)) {
            return message.reply(v2Message(v2Error('هذا الأمر خاص بالمالك فقط')));
        }

        const gd = getGuild(message.guild.id);
        const currentLog = gd.logChannelId
            ? `● القناة الحالية: <#${gd.logChannelId}>`
            : `○ ما في قناة لوق محددة`;

        const ts = uid();
        const logMenu = new StringSelectMenuBuilder()
            .setCustomId(`setlog_${ts}`)
            .setPlaceholder('اختر...')
            .addOptions([
                { label: 'هذي القناة', description: 'القناة الحالية', value: 'current', emoji: '📌' },
                { label: 'قناة ثانية', description: 'اكتب الآيدي أو المنشن', value: 'other', emoji: '🔗' },
                { label: 'إلغاء اللوق', description: 'إيقاف السجلات', value: 'disable', emoji: '🚫' }
            ]);

        const container = v2Container(
            CONFIG.THEME.GOLD,
            v2Text(`### ◎ إعداد قناة السجل`),
            v2Separator(),
            v2Text(`${currentLog}\n\n▸ اختر وين تبي تنرسل السجلات:`),
            new ActionRowBuilder().addComponents(logMenu)
        );

        const logMsg = await message.reply(v2Message(container));

        try {
            const logInt = await logMsg.awaitMessageComponent({
                filter: i => i.user.id === message.author.id && i.customId === `setlog_${ts}`,
                componentType: ComponentType.StringSelect,
                time: CONFIG.COLLECTOR_TIMEOUT
            });

            const choice = logInt.values[0];

            if (choice === 'current') {
                gd.logChannelId = message.channel.id;
                saveGuild(message.guild.id, gd);

                await logInt.update(v2Message(v2Success(`تم تحديد <#${message.channel.id}> كقناة سجل`)));

                await sendLog(message.guild.id, CONFIG.THEME.LOG_SUCCESS,
                    'تم تفعيل السجل',
                    '▸ هذي القناة صارت قناة سجل العمليات',
                    message.author.id
                );

            } else if (choice === 'other') {
                await logInt.update(v2Message(v2Container(CONFIG.THEME.GOLD, v2Text(`▸ جاري التحضير...`))));

                const chResp = await collectText(message.channel, message.author.id, '▸ اكتب **آيدي القناة** أو اسوي لها **منشن** (#channel):');
                if (!chResp) return;

                const channelId = chResp.content.replace(/[<#>]/g, '').trim();
                const targetCh = await message.guild.channels.fetch(channelId).catch(() => null);

                if (!targetCh) {
                    return message.channel.send(v2Message(v2Error('ما لقيت هالقناة')));
                }

                const perms = targetCh.permissionsFor(client.user);
                if (!perms || !perms.has('SendMessages')) {
                    return message.channel.send(v2Message(v2Error('ما أقدر أرسل في هالقناة — تحقق من الصلاحيات')));
                }

                gd.logChannelId = channelId;
                saveGuild(message.guild.id, gd);

                await message.channel.send(v2Message(v2Success(`تم تحديد <#${channelId}> كقناة سجل`)));

                await sendLog(message.guild.id, CONFIG.THEME.LOG_SUCCESS,
                    'تم تفعيل السجل',
                    '▸ هذي القناة صارت قناة سجل العمليات',
                    message.author.id
                );

            } else if (choice === 'disable') {
                gd.logChannelId = null;
                saveGuild(message.guild.id, gd);

                await logInt.update(v2Message(v2Container(
                    CONFIG.THEME.WARNING,
                    v2Text(`### ✓ تم إلغاء قناة السجل`),
                    v2Separator(),
                    v2Text(`▸ ما بيتم تسجيل أي عملية\n▸ تقدر تفعلها مرة ثانية بـ \`${CONFIG.PREFIX}setlog\``)
                )));
            }

        } catch {
            logMsg.edit(v2Message(v2Error('انتهى الوقت'))).catch(() => { });
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'admin') {
        if (!isOwner(message.author.id)) {
            return message.reply(v2Message(v2Error('هذا الأمر خاص بالمالك فقط')));
        }

        const ts = uid();
        const adminMenu = new StringSelectMenuBuilder()
            .setCustomId(`adm_${ts}`)
            .setPlaceholder('اختر الإعداد...')
            .addOptions([
                { label: 'تغيير اسم البوت', value: 'name', emoji: '✏️' },
                { label: 'تغيير صورة البوت', value: 'avatar', emoji: '🖼️' },
                { label: 'تغيير البايو', value: 'bio', emoji: '📝' },
                { label: 'تغيير الستاتس', value: 'status', emoji: '🎯' },
                { label: 'إضافة Admin', value: 'add', emoji: '➕' },
                { label: 'حذف Admin', value: 'remove', emoji: '➖' },
                { label: 'قائمة الأدمنز', value: 'list', emoji: '📋' }
            ]);

        const adminContainer = v2Container(
            CONFIG.THEME.GOLD,
            v2Text(`### ⟐ لوحة الإعدادات`),
            v2Separator(),
            v2Text(`مرحباً ♛ <@${message.author.id}>\n\n▸ اختر الإعداد اللي تبي تعدله`),
            v2Separator(),
            v2Text(`-# الإعدادات تطبق على البوت بالكامل`),
            new ActionRowBuilder().addComponents(adminMenu)
        );

        const adminMsg = await message.reply(v2Message(adminContainer));

        try {
            const admInt = await adminMsg.awaitMessageComponent({
                filter: i => i.user.id === message.author.id && i.customId === `adm_${ts}`,
                componentType: ComponentType.StringSelect,
                time: CONFIG.COLLECTOR_TIMEOUT
            });

            const choice = admInt.values[0];

            // ── تغيير الاسم ──
            if (choice === 'name') {
                const modalTs = uid();
                const modal = new ModalBuilder()
                    .setCustomId(`adm_name_modal_${modalTs}`)
                    .setTitle('تغيير اسم البوت');

                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('new_name')
                        .setLabel('الاسم الجديد')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(32)
                        .setValue(client.user.username)
                ));

                await admInt.showModal(modal);

                try {
                    const modalInt = await admInt.awaitModalSubmit({
                        filter: i => i.customId === `adm_name_modal_${modalTs}`,
                        time: CONFIG.COLLECTOR_TIMEOUT
                    });

                    const newName = modalInt.fields.getTextInputValue('new_name');
                    const oldName = client.user.username;

                    try {
                        await client.user.setUsername(newName);
                        await modalInt.update(v2Message(v2Success(`تم تغيير الاسم إلى: **${newName}**`)));

                        await sendLog(message.guild.id, CONFIG.THEME.LOG_MUTED,
                            'تغيير اسم البوت',
                            `▸ من: **${oldName}**\n▸ إلى: **${newName}**`,
                            message.author.id
                        );
                    } catch (err) {
                        await modalInt.update(v2Message(v2Error(`فشل التغيير: ${err.message}\n-# تغيير الاسم محدود بمرتين كل ساعة`)));
                    }
                } catch { }

            }

            // ── تغيير الصورة ──
            else if (choice === 'avatar') {
                await admInt.update(v2Message(v2Container(CONFIG.THEME.GOLD, v2Text(`▸ جاري التحضير...`))));

                const resp = await collectText(message.channel, message.author.id, '▸ أرسل الصورة الجديدة — رابط أو ارفق ملف:');
                if (!resp) return;

                const url = extractImage(resp);
                if (!url) return message.channel.send(v2Message(v2Error('ما لقيت صورة صالحة')));

                try {
                    await client.user.setAvatar(url);
                    await message.channel.send(v2Message(v2Success('تم تغيير صورة البوت')));

                    await sendLog(message.guild.id, CONFIG.THEME.LOG_MUTED,
                        'تغيير صورة البوت', '▸ تم تحديث الأفاتار', message.author.id
                    );
                } catch (err) {
                    await message.channel.send(v2Message(v2Error(`فشل التغيير: ${err.message}`)));
                }
            }

            // ── تغيير البايو ──
            else if (choice === 'bio') {
                const modalTs = uid();
                const modal = new ModalBuilder()
                    .setCustomId(`adm_bio_modal_${modalTs}`)
                    .setTitle('تغيير بايو البوت');

                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('new_bio')
                        .setLabel('البايو الجديد')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(190)
                ));

                await admInt.showModal(modal);

                try {
                    const modalInt = await admInt.awaitModalSubmit({
                        filter: i => i.customId === `adm_bio_modal_${modalTs}`,
                        time: CONFIG.COLLECTOR_TIMEOUT
                    });

                    const newBio = modalInt.fields.getTextInputValue('new_bio');

                    try {
                        await client.rest.patch('/users/@me', { body: { bio: newBio } });
                        await modalInt.update(v2Message(v2Success(`تم تحديث البايو:\n> ${newBio}`)));

                        await sendLog(message.guild.id, CONFIG.THEME.LOG_MUTED,
                            'تغيير بايو البوت', `▸ البايو: ${newBio}`, message.author.id
                        );
                    } catch (err) {
                        await modalInt.update(v2Message(v2Error(`فشل التحديث: ${err.message}`)));
                    }
                } catch { }
            }

            // ── تغيير الستاتس ──
            else if (choice === 'status') {
                const ts_act = uid();
                const actMenu = new StringSelectMenuBuilder()
                    .setCustomId(`act_${ts_act}`)
                    .setPlaceholder('نوع الأكتيفيتي...')
                    .addOptions([
                        { label: 'Playing', value: 'playing', emoji: '🎮' },
                        { label: 'Watching', value: 'watching', emoji: '👁️' },
                        { label: 'Listening', value: 'listening', emoji: '🎧' },
                        { label: 'Competing', value: 'competing', emoji: '🏅' },
                        { label: 'Custom', value: 'custom', emoji: '💫' }
                    ]);

                await admInt.update(v2Message(v2Container(
                    CONFIG.THEME.GOLD,
                    v2Text(`▸ اختر نوع الأكتيفيتي:`),
                    new ActionRowBuilder().addComponents(actMenu)
                )));

                try {
                    const actInt = await message.channel.awaitMessageComponent({
                        filter: i => i.user.id === message.author.id && i.customId === `act_${ts_act}`,
                        componentType: ComponentType.StringSelect,
                        time: CONFIG.COLLECTOR_TIMEOUT
                    });

                    const actType = actInt.values[0];

                    // Modal للنص
                    const modalTs = uid();
                    const modal = new ModalBuilder()
                        .setCustomId(`status_modal_${modalTs}`)
                        .setTitle('نص الأكتيفيتي');

                    modal.addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('status_text')
                            .setLabel('النص')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(128)
                    ));

                    await actInt.showModal(modal);

                    const modalInt = await actInt.awaitModalSubmit({
                        filter: i => i.customId === `status_modal_${modalTs}`,
                        time: CONFIG.COLLECTOR_TIMEOUT
                    });

                    const statusText = modalInt.fields.getTextInputValue('status_text');

                    // اختيار الحالة
                    const ts_st = uid();
                    const stMenu = new StringSelectMenuBuilder()
                        .setCustomId(`st_${ts_st}`)
                        .setPlaceholder('الحالة...')
                        .addOptions([
                            { label: 'Online', value: 'online', emoji: '🟢' },
                            { label: 'DND', value: 'dnd', emoji: '🔴' },
                            { label: 'Idle', value: 'idle', emoji: '🟡' },
                            { label: 'Invisible', value: 'invisible', emoji: '⚫' }
                        ]);

                    await modalInt.update(v2Message(v2Container(
                        CONFIG.THEME.GOLD,
                        v2Text(`✓ النوع: **${actType}** • النص: **${statusText}**\n\n▸ اختر الحالة:`),
                        new ActionRowBuilder().addComponents(stMenu)
                    )));

                    const stInt = await message.channel.awaitMessageComponent({
                        filter: i => i.user.id === message.author.id && i.customId === `st_${ts_st}`,
                        componentType: ComponentType.StringSelect,
                        time: CONFIG.COLLECTOR_TIMEOUT
                    });

                    const statusType = stInt.values[0];

                    const typeMap = {
                        playing: ActivityType.Playing,
                        watching: ActivityType.Watching,
                        listening: ActivityType.Listening,
                        competing: ActivityType.Competing,
                        custom: ActivityType.Custom
                    };

                    client.user.setPresence({
                        activities: [{ name: statusText, type: typeMap[actType] }],
                        status: statusType
                    });

                    await stInt.update(v2Message(v2Success(
                        `تم تحديث الستاتس\n\n` +
                        `▸ النوع: **${actType}**\n` +
                        `▸ النص: **${statusText}**\n` +
                        `▸ الحالة: **${statusType}**`
                    )));

                    await sendLog(message.guild.id, CONFIG.THEME.LOG_MUTED,
                        'تغيير ستاتس البوت',
                        `▸ النوع: **${actType}**\n▸ النص: **${statusText}**\n▸ الحالة: **${statusType}**`,
                        message.author.id
                    );

                } catch { }
            }

            // ── إضافة Admin ──
            else if (choice === 'add') {
                await admInt.update(v2Message(v2Container(CONFIG.THEME.GOLD, v2Text(`▸ جاري التحضير...`))));

                const resp = await collectText(message.channel, message.author.id, '▸ اكتب آيدي المستخدم أو سوله منشن:');
                if (!resp) return;

                let targetId = resp.content.replace(/[<@!>]/g, '').trim();

                if (!/^\d{17,19}$/.test(targetId)) {
                    return message.channel.send(v2Message(v2Error('آيدي غير صالح')));
                }

                try {
                    const user = await client.users.fetch(targetId);
                    if (user.bot) return message.channel.send(v2Message(v2Error('ما ينفع تضيف بوت كأدمن')));
                } catch {
                    return message.channel.send(v2Message(v2Error('ما لقيت هالمستخدم')));
                }

                const gd = getGuild(message.guild.id);
                if (gd.admins.includes(targetId)) {
                    return message.channel.send(v2Message(v2Container(CONFIG.THEME.WARNING, v2Text(`▸ هالمستخدم أدمن بالفعل`))));
                }

                gd.admins.push(targetId);
                saveGuild(message.guild.id, gd);

                await message.channel.send(v2Message(v2Success(`تم إضافة <@${targetId}> كأدمن`)));

                await sendLog(message.guild.id, CONFIG.THEME.LOG_MUTED,
                    'إضافة أدمن جديد',
                    `▸ المستخدم: <@${targetId}> \`${targetId}\``,
                    message.author.id
                );
            }

            // ── حذف Admin ──
            else if (choice === 'remove') {
                const gd = getGuild(message.guild.id);

                if (gd.admins.length === 0) {
                    return admInt.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`○ ما في أدمنز حالياً`))));
                }

                await admInt.update(v2Message(v2Container(CONFIG.THEME.GOLD, v2Text(`▸ جاري التحضير...`))));

                const resp = await collectText(message.channel, message.author.id, '▸ اكتب آيدي الأدمن اللي تبي تحذفه أو سوله منشن:');
                if (!resp) return;

                let removeId = resp.content.replace(/[<@!>]/g, '').trim();

                if (!gd.admins.includes(removeId)) {
                    return message.channel.send(v2Message(v2Error('هالمستخدم مو أدمن')));
                }

                gd.admins = gd.admins.filter(id => id !== removeId);
                saveGuild(message.guild.id, gd);

                await message.channel.send(v2Message(v2Success(`تم حذف <@${removeId}> من الأدمنز`)));

                await sendLog(message.guild.id, CONFIG.THEME.LOG_MUTED,
                    'حذف أدمن',
                    `▸ المستخدم: <@${removeId}> \`${removeId}\``,
                    message.author.id
                );
            }

            // ── قائمة الأدمنز ──
            else if (choice === 'list') {
                const gd = getGuild(message.guild.id);
                const admins = gd.admins;

                const components = [
                    v2Text(`### ⊡ قائمة الأدمنز`),
                    v2Separator(),
                    v2Text(`♛ **المالك:**\n╰ <@${CONFIG.OWNER_ID}> \`${CONFIG.OWNER_ID}\``),
                    v2Separator()
                ];

                if (admins.length === 0) {
                    components.push(v2Text(`○ ما في أدمنز مضافين`));
                } else {
                    components.push(v2Text(`⊡ **الأدمنز (${admins.length}):**`));
                    for (const id of admins) {
                        components.push(v2SectionButton(
                            `<@${id}>\n-# \`${id}\``,
                            new ButtonBuilder().setCustomId(`al_${id}`).setLabel('⊡').setStyle(ButtonStyle.Secondary).setDisabled(true)
                        ));
                    }
                }

                components.push(v2Separator(), v2Text(`-# ${message.guild.name}`));

                await admInt.update(v2Message(v2Container(CONFIG.THEME.GOLD, ...components)));
            }

        } catch {
            adminMsg.edit(v2Message(v2Error('انتهى الوقت'))).catch(() => { });
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  OWNER
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'owner') {
        if (!isOwner(message.author.id)) {
            return message.reply(v2Message(v2Error('هذا الأمر خاص بالمالك فقط')));
        }

        const guilds = client.guilds.cache;
        const data = loadData();

        let totalBc = 0, totalMem = 0;

        const components = [
            v2Text(`### ♛ لوحة تحكم المالك`),
            v2Separator(),

            v2Section(
                `**${client.user.username}**\n-# بوت البرودكاست`,
                client.user.displayAvatarURL({ dynamic: true, size: 64 })
            ),

            v2Separator(SeparatorSpacingSize.Large)
        ];

        // إحصائيات عامة
        guilds.forEach(g => {
            const gd = data[g.id];
            totalBc += gd?.stats?.totalBroadcasts || 0;
            totalMem += g.memberCount;
        });

        components.push(
            v2Text(
                `◆ السيرفرات: **${guilds.size}**\n` +
                `◉ الأعضاء: **${totalMem}**\n` +
                `⊳ البرودكاست: **${totalBc}**\n` +
                `✦ البينق: **${client.ws.ping}ms**\n` +
                `◷ التشغيل: **${formatUptime(client.uptime)}**`
            ),
            v2Separator(SeparatorSpacingSize.Large),
            v2Text(`\` السيرفرات \``),
            v2Separator()
        );

        // كل سيرفر
        guilds.forEach(g => {
            const gd = data[g.id];
            const bc = gd?.stats?.totalBroadcasts || 0;
            const adms = gd?.admins?.length || 0;
            const logSt = gd?.logChannelId ? `<#${gd.logChannelId}>` : '`معطل`';

            components.push(
                v2Section(
                    `**${g.name}**\n-# 👥 ${g.memberCount} • 📤 ${bc} • 🛡️ ${adms} • 📋 ${logSt}`,
                    g.iconURL({ dynamic: true, size: 64 }) || undefined
                )
            );
        });

        components.push(
            v2Separator(),
            v2Text(`-# ${message.author.tag} • ${formatDate(new Date())}`)
        );

        const container = v2Container(CONFIG.THEME.GOLD, ...components);
        await message.reply(v2Message(container));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  RESTART
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'restart') {
        if (!isOwner(message.author.id)) {
            return message.reply(v2Message(v2Error('هذا الأمر خاص بالمالك فقط')));
        }

        const ts = uid();

        const confirmBtn = new ButtonBuilder()
            .setCustomId(`rst_yes_${ts}`)
            .setLabel('أعد التشغيل')
            .setStyle(ButtonStyle.Danger);

        const cancelBtn = new ButtonBuilder()
            .setCustomId(`rst_no_${ts}`)
            .setLabel('إلغاء')
            .setStyle(ButtonStyle.Secondary);

        const container = v2Container(
            CONFIG.THEME.DANGER,
            v2Text(`### ⟳ إعادة تشغيل`),
            v2Separator(),
            v2Text(
                `▸ متأكد تبي تسوي ريستارت؟\n\n` +
                `│ البوت بيطفى ويرجع يشتغل\n` +
                `│ الجدولات المحفوظة ما بتتأثر\n` +
                `╰ وقت التشغيل: **${formatUptime(client.uptime)}**`
            ),
            v2Separator(),
            v2Text(`-# البوت بيرجع تلقائي لو على Railway أو PM2`),
            new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)
        );

        const rstMsg = await message.reply(v2Message(container));

        try {
            const int = await rstMsg.awaitMessageComponent({
                filter: i => i.user.id === message.author.id,
                componentType: ComponentType.Button,
                time: 30000
            });

            if (int.customId === `rst_yes_${ts}`) {
                await int.update(v2Message(v2Container(
                    CONFIG.THEME.SUCCESS,
                    v2Text(`### ⟳ جاري إعادة التشغيل...`),
                    v2Separator(),
                    v2Text(`▸ البوت بيرجع خلال ثواني`)
                )));

                await sendLog(message.guild.id, CONFIG.THEME.LOG_ERROR,
                    'إعادة تشغيل البوت',
                    '▸ تم طلب ريستارت',
                    message.author.id
                );

                await sleep(1500);
                process.exit(0);

            } else {
                await int.update(v2Message(v2Container(CONFIG.THEME.MUTED, v2Text(`▸ تم إلغاء إعادة التشغيل`))));
            }
        } catch {
            rstMsg.edit(v2Message(v2Error('انتهى الوقت'))).catch(() => { });
        }
    }
});

// ═══════════════════════════════════════════════════════════════
//  معالجة الأخطاء العامة
// ═══════════════════════════════════════════════════════════════

process.on('unhandledRejection', (err) => {
    console.error('[ERROR] Unhandled Rejection:', err?.message || err);
});

process.on('uncaughtException', (err) => {
    console.error('[ERROR] Uncaught Exception:', err?.message || err);
});

client.on('error', (err) => {
    console.error('[CLIENT] Error:', err.message);
});

client.on('shardReconnecting', () => {
    console.log('[SHARD] Reconnecting...');
});

client.on('shardResume', () => {
    console.log('[SHARD] Resumed');
});

// ═══════════════════════════════════════════════════════════════
//  تشغيل البوت
// ═══════════════════════════════════════════════════════════════

client.login(CONFIG.TOKEN).catch(err => {
    console.error('[LOGIN] Failed:', err.message);
    process.exit(1);
});

/*
  ═══════════════════════════════════
  متغيرات البيئة المطلوبة في Railway:
  ═══════════════════════════════════
  TOKEN     ← توكن البوت من Discord Developer Portal
  OWNER_ID  ← الآيدي الخاص فيك من ديسكورد
  ═══════════════════════════════════
*/
