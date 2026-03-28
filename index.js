// ═══════════════════════════════════════════════════════
//  بوت البرودكاست الاحترافي — Discord.js v14
//  Embeds تقليدية احترافية — بدون Components V2
//  كل embed يستخدم setAuthor بدل setTitle
// ═══════════════════════════════════════════════════════

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActivityType,
    MessageFlags,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config();

// ═══════════════════════════════════════════════════════
//  CONFIG — كل الإعدادات في مكان واحد
// ═══════════════════════════════════════════════════════

const CONFIG = {
    PREFIX: '#',
    OWNER_ID: process.env.OWNER_ID,
    TOKEN: process.env.TOKEN,
    DM_DELAY: 1200,
    COLLECTOR_TIMEOUT: 300000,
    DATA_FILE: path.join(__dirname, 'data.json'),
    COLORS: {
        PRIMARY: 0x2B2D31,
        SUCCESS: 0x57F287,
        ERROR: 0xED4245,
        WARNING: 0xFEE75C,
        INFO: 0x5865F2,
        GOLD: 0xF0B232
    },
    ORIGINAL_COMMANDS: [
        'broadcast', 'scheduled', 'resend', 'stats',
        'help', 'admin', 'setlog', 'owner', 'restart',
        'addemoji', 'addcmd', 'remind', 'reminders'
    ]
};

// ═══════════════════════════════════════════════════════
//  إنشاء الكلاينت
// ═══════════════════════════════════════════════════════

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

const activeTimers = new Map();

// ═══════════════════════════════════════════════════════
//  التخزين المحلي — data.json
// ═══════════════════════════════════════════════════════

function loadData() {
    try {
        if (!fs.existsSync(CONFIG.DATA_FILE)) {
            fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify({}, null, 2));
            return {};
        }
        return JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[DATA] فشل الحفظ:', e.message);
    }
}

function getGuild(guildId) {
    const data = loadData();
    if (!data[guildId]) {
        data[guildId] = {
            admins: [],
            owners: [],
            scheduledMessages: [],
            reminders: [],
            lastBroadcast: null,
            logChannelId: null,
            aliases: {},
            stats: { totalBroadcasts: 0, totalDelivered: 0, totalFailed: 0, totalBlocked: 0 }
        };
        saveData(data);
    }
    let needsSave = false;
    if (!data[guildId].aliases) { data[guildId].aliases = {}; needsSave = true; }
    if (!data[guildId].reminders) { data[guildId].reminders = []; needsSave = true; }
    if (!data[guildId].owners) { data[guildId].owners = []; needsSave = true; }
    if (needsSave) saveData(data);
    return data[guildId];
}

function saveGuild(guildId, guildData) {
    const data = loadData();
    data[guildId] = guildData;
    saveData(data);
}

// ═══════════════════════════════════════════════════════
//  الصلاحيات — مع دعم Owners متعددين
// ═══════════════════════════════════════════════════════

function isOwner(userId, guildId) {
    if (userId === CONFIG.OWNER_ID) return true;
    if (!guildId) return false;
    return getGuild(guildId).owners?.includes(userId) || false;
}

function isAdmin(userId, guildId) {
    if (isOwner(userId, guildId)) return true;
    return getGuild(guildId).admins.includes(userId);
}

// ═══════════════════════════════════════════════════════
//  أدوات مساعدة
// ═══════════════════════════════════════════════════════

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function uid() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    if (d) parts.push(`${d} يوم`);
    if (h % 24) parts.push(`${h % 24} ساعة`);
    if (m % 60) parts.push(`${m % 60} دقيقة`);
    if (s % 60) parts.push(`${s % 60} ثانية`);
    return parts.join(' و ') || '0 ثانية';
}

function progressBar(percent) {
    const total = 16;
    const filled = Math.round((percent / 100) * total);
    return '▰'.repeat(filled) + '▱'.repeat(total - filled) + ` **${percent}%**`;
}

function extractImage(msg) {
    if (msg.attachments.size > 0) return msg.attachments.first().url;
    const match = msg.content.match(/https?:\/\/\S+\.(png|jpg|jpeg|gif|webp)(\?\S*)?/i);
    if (match) return match[0];
    const general = msg.content.match(/https?:\/\/\S+/);
    return general ? general[0] : null;
}

function fetchImageAsBase64(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchImageAsBase64(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const contentType = res.headers['content-type'] || 'image/png';
                let mimeType = 'image/png';
                if (contentType.includes('gif')) mimeType = 'image/gif';
                else if (contentType.includes('jpeg') || contentType.includes('jpg')) mimeType = 'image/jpeg';
                else if (contentType.includes('webp')) mimeType = 'image/webp';
                else if (contentType.includes('png')) mimeType = 'image/png';
                const base64 = buffer.toString('base64');
                resolve(`data:${mimeType};base64,${base64}`);
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

// ═══════════════════════════════════════════════════════
//  بناء الـ Embeds — القالب الموحد
// ═══════════════════════════════════════════════════════

function makeEmbed(guild, options = {}) {
    const embed = new EmbedBuilder()
        .setColor(options.color || CONFIG.COLORS.PRIMARY)
        .setTimestamp();

    if (options.author) {
        embed.setAuthor({
            name: options.author,
            iconURL: options.authorIcon || client.user.displayAvatarURL({ dynamic: true })
        });
    }

    if (options.description) embed.setDescription(options.description);
    if (options.fields) embed.addFields(options.fields);
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);

    if (guild) {
        embed.setFooter({
            text: `${client.user.username} • ${guild.name}`,
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        });
    } else if (options.footer) {
        embed.setFooter({ text: options.footer });
    }

    return embed;
}

function errorEmbed(guild, text) {
    return makeEmbed(guild, { author: '✗ خطأ', color: CONFIG.COLORS.ERROR, description: text });
}

function successEmbed(guild, text) {
    return makeEmbed(guild, { author: '✓ تم', color: CONFIG.COLORS.SUCCESS, description: text });
}

function infoEmbed(guild, title, text) {
    return makeEmbed(guild, { author: title, color: CONFIG.COLORS.INFO, description: text });
}

// ═══════════════════════════════════════════════════════
//  نظام اللوق
// ═══════════════════════════════════════════════════════

async function sendLog(guildId, color, action, details, userId) {
    try {
        const gd = getGuild(guildId);
        if (!gd.logChannelId) return;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        const ch = await guild.channels.fetch(gd.logChannelId).catch(() => null);
        if (!ch) return;
        const embed = makeEmbed(guild, {
            author: '📋 سجل العمليات',
            color: color,
            fields: [
                { name: '📌 العملية', value: action, inline: true },
                { name: '👤 بواسطة', value: userId === 'system' ? '`النظام`' : `<@${userId}>`, inline: true },
                { name: '🕐 الوقت', value: `\`${formatDate(new Date())}\``, inline: true }
            ],
            description: details || undefined
        });
        await ch.send({ embeds: [embed] });
    } catch { }
}

// ═══════════════════════════════════════════════════════
//  جمع رسالة نصية من الشات
// ═══════════════════════════════════════════════════════

async function collectText(channel, userId, prompt, guild, timeout = CONFIG.COLLECTOR_TIMEOUT) {
    const embed = infoEmbed(guild, '📝 مطلوب إدخال', `${prompt}\n\n\`⏱️ ${Math.floor(timeout / 60000)} دقائق • اكتب "إلغاء" للخروج\``);
    await channel.send({ embeds: [embed] });
    try {
        const collected = await channel.awaitMessages({
            filter: m => m.author.id === userId,
            max: 1,
            time: timeout,
            errors: ['time']
        });
        const resp = collected.first();
        if (['إلغاء', 'الغاء', 'cancel'].includes(resp.content.trim().toLowerCase())) {
            await channel.send({ embeds: [makeEmbed(guild, { author: '↩️ إلغاء', color: CONFIG.COLORS.WARNING, description: 'تم إلغاء العملية' })] });
            return null;
        }
        return resp;
    } catch {
        await channel.send({ embeds: [errorEmbed(guild, '⏱️ انتهى الوقت — حاول مرة ثانية')] });
        return null;
    }
}

// ═══════════════════════════════════════════════════════
//  بناء Payload رسالة الـ DM
// ═══════════════════════════════════════════════════════

function buildDmPayload(content) {
    const payload = {};
    if (content.text) payload.content = content.text;
    if (content.embed) payload.embeds = [EmbedBuilder.from(content.embed)];
    if (content.image && !content.embed) payload.files = [content.image];
    if (!payload.content && !payload.embeds && !payload.files) payload.content = '*(فارغ)*';
    return payload;
}

// ═══════════════════════════════════════════════════════
//  حالة البرودكاست — نفس طريقة بوت اللعبة بالضبط
// ═══════════════════════════════════════════════════════

let broadcastState = {
    active: false,
    stopped: false,
    totalMembers: 0,
    sent: 0,
    failed: 0,
    blocked: 0,
    remaining: 0,
    failedMembers: [],
    statusMessage: null,
    lastPayload: null,
    startTime: 0
};

// ═══════════════════════════════════════════════════════
//  تنفيذ البرودكاست — نفس طريقة بوت اللعبة بالضبط
// ═══════════════════════════════════════════════════════

async function executeBroadcast(guild, channel, broadcastContent, maxMembers = 0) {
    broadcastState.startTime = Date.now();

    // جلب كل الأعضاء
    await guild.members.fetch();

    let members = guild.members.cache.filter(m => !m.user.bot).map(m => m);

    if (maxMembers > 0 && maxMembers < members.length) {
        for (let i = members.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [members[i], members[j]] = [members[j], members[i]];
        }
        members = members.slice(0, maxMembers);
    }

    const total = members.length;

    if (total === 0) {
        await channel.send({ embeds: [errorEmbed(guild, '❌ ما لقيت أعضاء للإرسال لهم!')] });
        return { delivered: 0, failed: 0, blocked: 0, total: 0 };
    }

    // تجهيز الحالة
    broadcastState.active = true;
    broadcastState.stopped = false;
    broadcastState.totalMembers = total;
    broadcastState.sent = 0;
    broadcastState.failed = 0;
    broadcastState.blocked = 0;
    broadcastState.remaining = total;
    broadcastState.failedMembers = [];
    broadcastState.lastPayload = broadcastContent;

    const dmPayload = buildDmPayload(broadcastContent);

    console.log(`[BROADCAST] بدأ — ${total} عضو`);

    // إرسال رسالة الحالة الأولى
    const statusEmbed = buildBroadcastStatusEmbed(guild);
    broadcastState.statusMessage = await channel.send(statusEmbed);

    // الإرسال واحد واحد — نفس بوت اللعبة بالضبط
    for (let i = 0; i < members.length; i++) {
        // لو الأدمن وقف الإرسال
        if (broadcastState.stopped) {
            broadcastState.remaining = members.length - i;
            break;
        }

        const member = members[i];

        try {
            await member.send(dmPayload);
            broadcastState.sent++;
        } catch (e) {
            if (e.code === 50007) {
                broadcastState.blocked++;
            } else {
                broadcastState.failed++;
            }
            broadcastState.failedMembers.push(member);
        }

        broadcastState.remaining = members.length - (i + 1);

        // تحديث الستاتس كل 5 رسائل أو آخر رسالة
        if ((i + 1) % 5 === 0 || i === members.length - 1) {
            try {
                await broadcastState.statusMessage.edit(buildBroadcastStatusEmbed(guild));
            } catch (e) { }
        }

        // تأخير بين كل رسالة
        if (i < members.length - 1) {
            await sleep(CONFIG.DM_DELAY);
        }
    }

    // انتهى الإرسال
    broadcastState.active = false;

    const elapsed = Date.now() - broadcastState.startTime;
    const elapsedFormatted = formatUptime(elapsed);
    const rate = total > 0 ? Math.round((broadcastState.sent / total) * 100) : 0;

    console.log(`[BROADCAST] انتهى — وصل: ${broadcastState.sent} | فشل: ${broadcastState.failed} | مقفول: ${broadcastState.blocked} | النسبة: ${rate}% | الوقت: ${elapsedFormatted}`);

    // التقرير النهائي
    try {
        await broadcastState.statusMessage.edit(buildBroadcastStatusEmbed(guild, true, elapsedFormatted));
    } catch (e) {
        await channel.send(buildBroadcastStatusEmbed(guild, true, elapsedFormatted));
    }

    // حفظ الإحصائيات
    const gd = getGuild(guild.id);
    gd.stats.totalBroadcasts++;
    gd.stats.totalDelivered += broadcastState.sent;
    gd.stats.totalFailed += broadcastState.failed;
    gd.stats.totalBlocked += broadcastState.blocked;
    gd.lastBroadcast = {
        content: { ...broadcastContent },
        timestamp: new Date().toISOString(),
        stats: { delivered: broadcastState.sent, failed: broadcastState.failed, blocked: broadcastState.blocked, total }
    };
    saveGuild(guild.id, gd);

    await sendLog(guild.id, CONFIG.COLORS.SUCCESS,
        maxMembers > 0 ? 'برودكاست تجريبي' : 'برودكاست تم إرساله',
        `🟢 وصل: **${broadcastState.sent}** | 🔴 فشل: **${broadcastState.failed}** | ⛔ مقفول: **${broadcastState.blocked}** | 📊 النسبة: **${rate}%** | ⏱️ الوقت: **${elapsedFormatted}**`,
        'system'
    );

    return { delivered: broadcastState.sent, failed: broadcastState.failed, blocked: broadcastState.blocked, total };
}

// ═══════════════════════════════════════════════════════
//  بناء إمبد حالة البرودكاست — نفس طريقة بوت اللعبة
// ═══════════════════════════════════════════════════════

function buildBroadcastStatusEmbed(guild, isFinal = false, elapsedTime = null) {
    const { totalMembers, sent, failed, blocked, remaining, active, stopped } = broadcastState;
    const processed = sent + failed + blocked;
    const pct = totalMembers > 0 ? Math.round((processed / totalMembers) * 100) : 0;
    const rate = processed > 0 ? Math.round((sent / processed) * 100) : 0;

    let statusText, statusColor;
    if (stopped) {
        statusText = '⏹️ تم إيقاف الإرسال';
        statusColor = CONFIG.COLORS.ERROR;
    } else if (isFinal || (!active && processed > 0)) {
        statusText = '✅ اكتمل الإرسال';
        statusColor = sent > 0 ? CONFIG.COLORS.SUCCESS : CONFIG.COLORS.ERROR;
    } else {
        statusText = '🔄 جاري الإرسال...';
        statusColor = CONFIG.COLORS.INFO;
    }

    const fields = [
        { name: '🟢 وصل', value: `\`${sent}\``, inline: true },
        { name: '🔴 فشل', value: `\`${failed}\``, inline: true },
        { name: '⛔ مقفول', value: `\`${blocked}\``, inline: true },
        { name: '⏳ متبقي', value: `\`${remaining}\``, inline: true },
        { name: '📊 التقدم', value: progressBar(pct), inline: true },
        { name: '👥 الإجمالي', value: `\`${totalMembers}\``, inline: true }
    ];

    if (isFinal && elapsedTime) {
        fields.push({ name: '⏱️ الوقت المستغرق', value: `\`${elapsedTime}\``, inline: true });
        fields.push({ name: '📬 نسبة النجاح', value: progressBar(rate), inline: true });
    }

    let description = statusText;
    if (isFinal && rate < 50 && totalMembers > 0) {
        description += '\n\n⚠️ **تحذير: نسبة النجاح أقل من 50%!**\nأغلب الأعضاء مقفلين الخاص.';
    }

    const embed = makeEmbed(guild, {
        author: isFinal ? '📊 التقرير النهائي' : '📤 جاري الإرسال...',
        color: statusColor,
        description: description,
        fields: fields
    });

    return { embeds: [embed] };
}

// ═══════════════════════════════════════════════════════
//  Flow البرودكاست التفاعلي
// ═══════════════════════════════════════════════════════

async function broadcastFlow(message, isTest = false) {
    const userId = message.author.id;
    const channel = message.channel;
    const guild = message.guild;
    const guildId = guild.id;

    // تأكد ما فيه برودكاست شغال
    if (broadcastState.active) {
        return message.reply({ embeds: [errorEmbed(guild, '❌ فيه برودكاست شغال حالياً — انتظر يخلص!')] });
    }

    // ═══ الخطوة 1: نوع المحتوى ═══
    const ts1 = uid();
    const typeMenu = new StringSelectMenuBuilder()
        .setCustomId(`bc_type_${ts1}`)
        .setPlaceholder('اختر نوع المحتوى...')
        .addOptions([
            { label: 'نص فقط', description: 'رسالة نصية بدون مرفقات', value: 'text_only', emoji: '📄' },
            { label: 'صورة فقط', description: 'صورة بدون نص', value: 'image_only', emoji: '🖼️' },
            { label: 'نص + صورة', description: 'رسالة نصية مع صورة', value: 'text_and_image', emoji: '📎' }
        ]);

    const step1Embed = makeEmbed(guild, {
        author: isTest ? '🧪 برودكاست تجريبي' : '📤 برودكاست جديد',
        color: CONFIG.COLORS.INFO,
        description: `مرحباً <@${userId}>\n\nاختر نوع الرسالة اللي تبي ترسلها:`,
        footer: 'الخطوة 1 من 5'
    });

    const step1Msg = await channel.send({
        embeds: [step1Embed],
        components: [new ActionRowBuilder().addComponents(typeMenu)]
    });

    let contentType;
    try {
        const typeInt = await step1Msg.awaitMessageComponent({
            filter: i => i.user.id === userId && i.customId === `bc_type_${ts1}`,
            componentType: ComponentType.StringSelect,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        contentType = typeInt.values[0];
        const typeLabel = contentType === 'text_only' ? '📄 نص فقط' :
            contentType === 'image_only' ? '🖼️ صورة فقط' : '📎 نص + صورة';

        await typeInt.update({
            embeds: [makeEmbed(guild, { author: '✓ تم الاختيار', color: CONFIG.COLORS.PRIMARY, description: `النوع: **${typeLabel}**` })],
            components: []
        });
    } catch {
        return step1Msg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { });
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

    const step2Embed = makeEmbed(guild, {
        author: '🎨 شكل الرسالة',
        color: CONFIG.COLORS.INFO,
        description: 'تبي الرسالة تكون Embed منسق ولا رسالة عادية؟',
        footer: 'الخطوة 2 من 5'
    });

    const step2Msg = await channel.send({
        embeds: [step2Embed],
        components: [new ActionRowBuilder().addComponents(styleMenu)]
    });

    let useEmbed;
    try {
        const styleInt = await step2Msg.awaitMessageComponent({
            filter: i => i.user.id === userId && i.customId === `bc_style_${ts2}`,
            componentType: ComponentType.StringSelect,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        useEmbed = styleInt.values[0] === 'embed';

        await styleInt.update({
            embeds: [makeEmbed(guild, { author: '✓ تم الاختيار', color: CONFIG.COLORS.PRIMARY, description: `الشكل: **${useEmbed ? '✨ Embed' : '💬 عادي'}**` })],
            components: []
        });
    } catch {
        return step2Msg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { });
    }

    // ═══ الخطوة 3: جمع المحتوى ═══
    let broadcastContent = { text: null, image: null, embed: null, type: contentType, isEmbed: useEmbed };

    if (contentType === 'text_only' || contentType === 'text_and_image') {
        if (useEmbed) {
            const ts3 = uid();
            const triggerBtn = new ButtonBuilder()
                .setCustomId(`bc_modal_${ts3}`)
                .setLabel('✏️ اكتب المحتوى')
                .setStyle(ButtonStyle.Primary);

            const step3Embed = makeEmbed(guild, {
                author: '✏️ محتوى الرسالة',
                color: CONFIG.COLORS.INFO,
                description: 'اضغط الزر عشان تكتب العنوان والمحتوى',
                footer: 'الخطوة 3 من 5'
            });

            const triggerMsg = await channel.send({
                embeds: [step3Embed],
                components: [new ActionRowBuilder().addComponents(triggerBtn)]
            });

            try {
                const btnInt = await triggerMsg.awaitMessageComponent({
                    filter: i => i.user.id === userId && i.customId === `bc_modal_${ts3}`,
                    componentType: ComponentType.Button,
                    time: CONFIG.COLLECTOR_TIMEOUT
                });

                const modal = new ModalBuilder()
                    .setCustomId(`bc_embed_modal_${ts3}`)
                    .setTitle('محتوى البرودكاست');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('embed_title').setLabel('العنوان').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('embed_desc').setLabel('المحتوى').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)
                    )
                );

                await btnInt.showModal(modal);

                const modalInt = await btnInt.awaitModalSubmit({
                    filter: i => i.customId === `bc_embed_modal_${ts3}`,
                    time: CONFIG.COLLECTOR_TIMEOUT
                });

                const embedTitle = modalInt.fields.getTextInputValue('embed_title');
                const embedDesc = modalInt.fields.getTextInputValue('embed_desc');

                const bEmbed = new EmbedBuilder()
                    .setColor(CONFIG.COLORS.INFO)
                    .setAuthor({ name: embedTitle })
                    .setDescription(embedDesc)
                    .setTimestamp();

                broadcastContent.embed = bEmbed.toJSON();

                await modalInt.update({
                    embeds: [makeEmbed(guild, { author: '✓ تم حفظ المحتوى', color: CONFIG.COLORS.PRIMARY, description: `العنوان: **${embedTitle}**` })],
                    components: []
                });

                if (contentType === 'text_and_image') {
                    const imgResp = await collectText(channel, userId, '🖼️ أرسل **الصورة** — رابط أو ارفق ملف:', guild);
                    if (!imgResp) return;
                    const imgUrl = extractImage(imgResp);
                    if (imgUrl) {
                        const updated = EmbedBuilder.from(broadcastContent.embed).setImage(imgUrl);
                        broadcastContent.embed = updated.toJSON();
                        broadcastContent.image = imgUrl;
                    }
                }

            } catch {
                return triggerMsg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت أو حدث خطأ')], components: [] }).catch(() => { });
            }

        } else {
            const textResp = await collectText(channel, userId, '📝 اكتب **نص الرسالة**:', guild);
            if (!textResp) return;
            broadcastContent.text = textResp.content;

            if (contentType === 'text_and_image') {
                const imgResp = await collectText(channel, userId, '🖼️ أرسل **الصورة** — رابط أو ارفق ملف:', guild);
                if (!imgResp) return;
                const imgUrl = extractImage(imgResp);
                if (imgUrl) broadcastContent.image = imgUrl;
            }
        }
    } else if (contentType === 'image_only') {
        if (useEmbed) {
            const ts3i = uid();
            const modalBtn = new ButtonBuilder().setCustomId(`bc_img_modal_${ts3i}`).setLabel('✏️ إضافة عنوان').setStyle(ButtonStyle.Primary);
            const skipBtn = new ButtonBuilder().setCustomId(`bc_img_skip_${ts3i}`).setLabel('تخطي العنوان').setStyle(ButtonStyle.Secondary);

            const step3iEmbed = makeEmbed(guild, {
                author: '🖼️ صورة بـ Embed',
                color: CONFIG.COLORS.INFO,
                description: 'تبي تضيف عنوان للـ Embed ولا تتخطى؟',
                footer: 'الخطوة 3 من 5'
            });

            const triggerMsg = await channel.send({
                embeds: [step3iEmbed],
                components: [new ActionRowBuilder().addComponents(modalBtn, skipBtn)]
            });

            let embedTitle = null;

            try {
                const trigInt = await triggerMsg.awaitMessageComponent({
                    filter: i => i.user.id === userId,
                    componentType: ComponentType.Button,
                    time: CONFIG.COLLECTOR_TIMEOUT
                });

                if (trigInt.customId === `bc_img_modal_${ts3i}`) {
                    const modal = new ModalBuilder()
                        .setCustomId(`bc_img_title_modal_${ts3i}`)
                        .setTitle('عنوان الـ Embed');

                    modal.addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('img_title').setLabel('العنوان').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256)
                    ));

                    await trigInt.showModal(modal);

                    const modalInt = await trigInt.awaitModalSubmit({
                        filter: i => i.customId === `bc_img_title_modal_${ts3i}`,
                        time: CONFIG.COLLECTOR_TIMEOUT
                    });

                    embedTitle = modalInt.fields.getTextInputValue('img_title');
                    await modalInt.update({
                        embeds: [makeEmbed(guild, { author: '✓ العنوان', color: CONFIG.COLORS.PRIMARY, description: `**${embedTitle}**` })],
                        components: []
                    });
                } else {
                    await trigInt.update({
                        embeds: [makeEmbed(guild, { author: '✓ بدون عنوان', color: CONFIG.COLORS.PRIMARY })],
                        components: []
                    });
                }
            } catch {
                return triggerMsg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { });
            }

            const imgResp = await collectText(channel, userId, '🖼️ أرسل **الصورة** — رابط أو ارفق ملف:', guild);
            if (!imgResp) return;
            const imgUrl = extractImage(imgResp);

            const bEmbed = new EmbedBuilder().setColor(CONFIG.COLORS.INFO).setTimestamp();
            if (embedTitle) bEmbed.setAuthor({ name: embedTitle });
            if (imgUrl) { bEmbed.setImage(imgUrl); broadcastContent.image = imgUrl; }
            broadcastContent.embed = bEmbed.toJSON();

        } else {
            const imgResp = await collectText(channel, userId, '🖼️ أرسل **الصورة** — رابط أو ارفق ملف:', guild);
            if (!imgResp) return;
            const imgUrl = extractImage(imgResp);
            if (imgUrl) broadcastContent.image = imgUrl;
        }
    }

    // ═══ الخطوة 4: وقت الإرسال ═══
    const ts4 = uid();
    const schedMenu = new StringSelectMenuBuilder()
        .setCustomId(`bc_sched_${ts4}`)
        .setPlaceholder('متى تبي ترسل؟')
        .addOptions([
            { label: 'الحين', description: 'إرسال فوري', value: 'now', emoji: '⚡' },
            { label: 'تاريخ محدد', description: 'حدد اليوم والساعة والدقيقة', value: 'schedule', emoji: '📅' }
        ]);

    const step4Embed = makeEmbed(guild, {
        author: '⏰ وقت الإرسال',
        color: CONFIG.COLORS.INFO,
        description: 'متى تبي ترسل البرودكاست؟',
        footer: 'الخطوة 4 من 5 • التوقيت: الرياض'
    });

    const step4Msg = await channel.send({
        embeds: [step4Embed],
        components: [new ActionRowBuilder().addComponents(schedMenu)]
    });

    let sendNow = false;
    let scheduledTime = null;

    try {
        const schedInt = await step4Msg.awaitMessageComponent({
            filter: i => i.user.id === userId && i.customId === `bc_sched_${ts4}`,
            componentType: ComponentType.StringSelect,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        const choice = schedInt.values[0];

        if (choice === 'now') {
            sendNow = true;
            await schedInt.update({
                embeds: [makeEmbed(guild, { author: '✓ إرسال فوري', color: CONFIG.COLORS.PRIMARY })],
                components: []
            });
        } else {
            await schedInt.update({
                embeds: [makeEmbed(guild, { author: '📅 تحديد الموعد', color: CONFIG.COLORS.INFO, description: 'بنسألك 3 أسئلة بسيطة...' })],
                components: []
            });

            const daysResp = await collectText(channel, userId, '📅 **بعد كم يوم؟**\n\n• اكتب `0` لو اليوم\n• اكتب `1` لو بكرة\n• وهكذا...', guild);
            if (!daysResp) return;
            const days = parseInt(daysResp.content.trim());
            if (isNaN(days) || days < 0) return channel.send({ embeds: [errorEmbed(guild, 'اكتب رقم صحيح 0 أو أكثر')] });

            const hourResp = await collectText(channel, userId, '🕐 **الساعة كم؟** (0-23)\n\nبتوقيت الرياض\n• مثال: `14` = 2 الظهر\n• مثال: `21` = 9 الليل', guild);
            if (!hourResp) return;
            const hour = parseInt(hourResp.content.trim());
            if (isNaN(hour) || hour < 0 || hour > 23) return channel.send({ embeds: [errorEmbed(guild, 'اكتب رقم من 0 إلى 23')] });

            const minResp = await collectText(channel, userId, '⏱️ **الدقيقة كم؟** (0-59)\n\n• مثال: `0` = على رأس الساعة\n• مثال: `30` = والنص', guild);
            if (!minResp) return;
            const minute = parseInt(minResp.content.trim());
            if (isNaN(minute) || minute < 0 || minute > 59) return channel.send({ embeds: [errorEmbed(guild, 'اكتب رقم من 0 إلى 59')] });

            const nowRiyadh = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
            const targetDate = new Date(nowRiyadh);
            targetDate.setDate(targetDate.getDate() + days);
            targetDate.setHours(hour, minute, 0, 0);

            const yr = targetDate.getFullYear();
            const mo = String(targetDate.getMonth() + 1).padStart(2, '0');
            const dy = String(targetDate.getDate()).padStart(2, '0');
            const hr = String(hour).padStart(2, '0');
            const mn = String(minute).padStart(2, '0');

            const riyadhISO = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:00+03:00`);
            if (riyadhISO <= new Date()) return channel.send({ embeds: [errorEmbed(guild, 'الوقت هذا في الماضي — اختر وقت مستقبلي')] });

            scheduledTime = riyadhISO.toISOString();

            const dayLabel = days === 0 ? 'اليوم' : days === 1 ? 'بكرة' : `بعد ${days} أيام`;
            const timeLabel12 = hour > 12 ? `${hour - 12}:${mn} مساءً` : hour === 0 ? `12:${mn} صباحاً` : hour === 12 ? `12:${mn} ظهراً` : `${hour}:${mn} صباحاً`;

            await channel.send({
                embeds: [makeEmbed(guild, {
                    author: '📅 موعد الإرسال',
                    color: CONFIG.COLORS.WARNING,
                    fields: [
                        { name: '📆 اليوم', value: `\`${dayLabel}\``, inline: true },
                        { name: '🕐 الوقت', value: `\`${timeLabel12}\``, inline: true },
                        { name: '📋 التاريخ الكامل', value: `\`${formatDate(scheduledTime)}\``, inline: true }
                    ],
                    description: '⚠️ **تأكد من هذا الموعد قبل التأكيد النهائي**'
                })]
            });

            broadcastContent.scheduledTime = scheduledTime;
        }
    } catch {
        return step4Msg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { });
    }

    // ═══ لو تجربة — عدد الأعضاء ═══
    let testCount = 0;
    if (isTest) {
        const countResp = await collectText(channel, userId, '🧪 كم عضو تبي ترسل لهم كتجربة؟', guild);
        if (!countResp) return;
        testCount = parseInt(countResp.content);
        if (isNaN(testCount) || testCount < 1) return channel.send({ embeds: [errorEmbed(guild, 'اكتب رقم صحيح أكبر من 0')] });
    }

    // ═══ الخطوة 5: Preview + تأكيد ═══
    await channel.send({ embeds: [infoEmbed(guild, '👁️ معاينة الرسالة', 'هكذا بتوصل الرسالة للأعضاء:')] });
    await channel.send(buildDmPayload(broadcastContent));

    const typeLabel = contentType === 'text_only' ? '📄 نص' : contentType === 'image_only' ? '🖼️ صورة' : '📎 نص + صورة';
    const timeLabel = sendNow ? '⚡ الحين' : `🕐 ${formatDate(scheduledTime)}`;

    const ts5 = uid();
    const confirmBtn = new ButtonBuilder().setCustomId(`bc_confirm_${ts5}`).setLabel(sendNow ? '✅ أرسل' : '✅ أكد الجدولة').setStyle(ButtonStyle.Success);
    const cancelBtn = new ButtonBuilder().setCustomId(`bc_cancel_${ts5}`).setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger);

    const previewEmbed = makeEmbed(guild, {
        author: '⚡ تأكيد الإرسال',
        color: CONFIG.COLORS.WARNING,
        description: 'كل شي جاهز — تأكد من المعلومات:',
        fields: [
            { name: '📋 النوع', value: typeLabel, inline: true },
            { name: '⏰ الوقت', value: timeLabel, inline: true },
            { name: '👥 المستهدفين', value: `\`${isTest ? testCount + ' (تجربة)' : guild.memberCount}\``, inline: true }
        ],
        footer: 'الخطوة 5 من 5'
    });

    const confirmMsg = await channel.send({
        embeds: [previewEmbed],
        components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)]
    });

    try {
        const confInt = await confirmMsg.awaitMessageComponent({
            filter: i => i.user.id === userId,
            componentType: ComponentType.Button,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        if (confInt.customId === `bc_confirm_${ts5}`) {
            await confInt.update({
                embeds: [makeEmbed(guild, { author: sendNow ? '🚀 جاري الإرسال...' : '⏰ جاري الجدولة...', color: CONFIG.COLORS.SUCCESS })],
                components: []
            });

            if (sendNow) {
                await sendLog(guildId, CONFIG.COLORS.WARNING, 'بدء إرسال برودكاست',
                    `النوع: **${typeLabel}** | تجربة: **${isTest ? '🟢 نعم — ' + testCount : '🔴 لا'}**`, userId);
                await executeBroadcast(guild, channel, broadcastContent, isTest ? testCount : 0);
            } else {
                const schedId = `s_${uid()}`;
                const gd = getGuild(guildId);
                const entry = {
                    id: schedId, content: broadcastContent, scheduledTime,
                    channelId: channel.id, createdBy: userId,
                    createdAt: new Date().toISOString(), isTest, testCount
                };
                gd.scheduledMessages.push(entry);
                saveGuild(guildId, gd);
                startTimer(guild, entry);

                await channel.send({
                    embeds: [makeEmbed(guild, {
                        author: '✓ تم جدولة البرودكاست', color: CONFIG.COLORS.SUCCESS,
                        fields: [
                            { name: '🆔 المعرف', value: `\`${schedId}\``, inline: true },
                            { name: '🕐 الموعد', value: `\`${formatDate(scheduledTime)}\``, inline: true },
                            { name: '👤 بواسطة', value: `<@${userId}>`, inline: true }
                        ]
                    })]
                });
                await sendLog(guildId, CONFIG.COLORS.WARNING, 'تم جدولة برودكاست',
                    `🆔 المعرف: \`${schedId}\` | 🕐 الموعد: \`${formatDate(scheduledTime)}\``, userId);
            }
        } else {
            await confInt.update({ embeds: [makeEmbed(guild, { author: '❌ تم الإلغاء', color: CONFIG.COLORS.ERROR })], components: [] });
        }
    } catch {
        confirmMsg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { });
    }
}

// ═══════════════════════════════════════════════════════
//  نظام الجدولة — برودكاست
// ═══════════════════════════════════════════════════════

function startTimer(guild, entry) {
    const delay = new Date(entry.scheduledTime).getTime() - Date.now();
    if (delay <= 0) { runScheduled(guild, entry); return; }
    const timer = setTimeout(() => runScheduled(guild, entry), delay);
    activeTimers.set(entry.id, timer);
}

async function runScheduled(guild, entry) {
    try {
        const ch = await guild.channels.fetch(entry.channelId).catch(() => null);
        if (!ch) return;
        await ch.send({
            embeds: [makeEmbed(guild, {
                author: '⏰ تنفيذ جدولة', color: CONFIG.COLORS.INFO,
                fields: [
                    { name: '🆔 المعرف', value: `\`${entry.id}\``, inline: true },
                    { name: '👤 بواسطة', value: `<@${entry.createdBy}>`, inline: true }
                ]
            })]
        });
        await sendLog(guild.id, CONFIG.COLORS.WARNING, 'تنفيذ جدولة تلقائي', `🆔 المعرف: \`${entry.id}\``, entry.createdBy);
        await executeBroadcast(guild, ch, entry.content, entry.isTest ? entry.testCount : 0);
        const gd = getGuild(guild.id);
        gd.scheduledMessages = gd.scheduledMessages.filter(s => s.id !== entry.id);
        saveGuild(guild.id, gd);
        activeTimers.delete(entry.id);
    } catch (err) {
        console.error('[SCHEDULE] خطأ:', err.message);
    }
}

// ═══════════════════════════════════════════════════════
//  نظام التذكيرات
// ═══════════════════════════════════════════════════════

function startReminderTimer(guild, reminder) {
    const delay = new Date(reminder.scheduledTime).getTime() - Date.now();
    if (delay <= 0) { executeReminder(guild, reminder); return; }
    const timer = setTimeout(() => executeReminder(guild, reminder), delay);
    activeTimers.set(reminder.id, timer);
}

async function executeReminder(guild, reminder) {
    try {
        const ch = await guild.channels.fetch(reminder.channelId).catch(() => null);
        if (!ch) return;
        await ch.send({ content: reminder.text });
        await sendLog(guild.id, CONFIG.COLORS.SUCCESS, 'تنفيذ تذكير',
            `📌 الروم: <#${reminder.channelId}>\n💬 الرسالة: ${reminder.text.slice(0, 100)}${reminder.text.length > 100 ? '...' : ''}`,
            reminder.createdBy);
        const gd = getGuild(guild.id);
        gd.reminders = gd.reminders.filter(r => r.id !== reminder.id);
        saveGuild(guild.id, gd);
        activeTimers.delete(reminder.id);
    } catch (err) {
        console.error('[REMINDER] خطأ:', err.message);
    }
}

// ═══════════════════════════════════════════════════════
//  تحميل كل الجدولات والتذكيرات عند الـ startup
// ═══════════════════════════════════════════════════════

async function loadAllSchedules() {
    const data = loadData();
    for (const [guildId, gd] of Object.entries(data)) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const now = Date.now();

        if (gd.scheduledMessages?.length) {
            const valid = [];
            for (const sched of gd.scheduledMessages) {
                if (new Date(sched.scheduledTime).getTime() > now) { valid.push(sched); startTimer(guild, sched); }
                else runScheduled(guild, sched);
            }
            gd.scheduledMessages = valid;
        }

        if (gd.reminders?.length) {
            const validR = [];
            for (const rem of gd.reminders) {
                if (new Date(rem.scheduledTime).getTime() > now) { validR.push(rem); startReminderTimer(guild, rem); }
                else executeReminder(guild, rem);
            }
            gd.reminders = validR;
        }

        saveGuild(guildId, gd);
    }
    console.log('[SCHEDULE] تم تحميل الجدولات والتذكيرات');
}

// ═══════════════════════════════════════════════════════
//  البوت جاهز
// ═══════════════════════════════════════════════════════

client.once('ready', async () => {
    console.log(`\n  ✦ البوت شغال: ${client.user.tag}`);
    console.log(`  ▸ السيرفرات: ${client.guilds.cache.size}`);
    console.log(`  ▸ الأعضاء: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}\n`);

    client.user.setPresence({
        activities: [{ name: `${CONFIG.PREFIX}help`, type: ActivityType.Watching }],
        status: 'online'
    });

    await loadAllSchedules();

    const data = loadData();
    for (const [guildId, gd] of Object.entries(data)) {
        if (gd.logChannelId) {
            await sendLog(guildId, CONFIG.COLORS.SUCCESS, 'البوت شغال',
                `🖥️ السيرفرات: **${client.guilds.cache.size}** | ⚡ البينق: **${client.ws.ping}ms**`, 'system');
        }
    }
});

// ═══════════════════════════════════════════════════════
//  معالجة الأوامر
// ═══════════════════════════════════════════════════════

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(CONFIG.PREFIX)) return;

    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/\s+/);
    let cmd = args.shift().toLowerCase();
    const guild = message.guild;

    // ── معالجة الاختصارات ──
    const guildAliases = getGuild(guild.id).aliases || {};
    if (guildAliases[cmd]) {
        const originalCmd = guildAliases[cmd];
        if (originalCmd === 'broadcast test') { cmd = 'broadcast'; args.unshift('test'); }
        else cmd = originalCmd;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  HELP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    if (cmd === 'help') {
        const ts = uid();
        const helpMenu = new StringSelectMenuBuilder()
            .setCustomId(`help_${ts}`)
            .setPlaceholder('اختر القسم...')
            .addOptions([
                { label: 'البرودكاست', description: 'أوامر الإرسال والجدولة', value: 'broadcast', emoji: '📢' },
                { label: 'الإحصائيات', description: 'عرض الإحصائيات', value: 'stats', emoji: '📊' },
                { label: 'الإدارة', description: 'إعدادات البوت', value: 'admin', emoji: '⚙️' },
                { label: 'المالك', description: 'أوامر المالك', value: 'owner', emoji: '👑' }
            ]);

        const helpEmbed = makeEmbed(guild, {
            author: '📖 مساعدة البوت',
            color: CONFIG.COLORS.INFO,
            description: `مرحباً <@${message.author.id}>!\n\nبوت البرودكاست الاحترافي — يساعدك ترسل رسائل لكل أعضاء السيرفر عبر DM.\n\n**اختر القسم من القائمة تحت:**`,
            thumbnail: client.user.displayAvatarURL({ dynamic: true })
        });

        const helpMsg = await message.reply({
            embeds: [helpEmbed],
            components: [new ActionRowBuilder().addComponents(helpMenu)]
        });

        const collector = helpMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            componentType: ComponentType.StringSelect,
            time: CONFIG.COLLECTOR_TIMEOUT
        });

        collector.on('collect', async (int) => {
            const cat = int.values[0];
            let fields = [];
            if (cat === 'broadcast') {
                fields = [
                    { name: `\`${CONFIG.PREFIX}broadcast\``, value: '📤 إنشاء وإرسال برودكاست جديد', inline: true },
                    { name: `\`${CONFIG.PREFIX}broadcast test\``, value: '🧪 تجربة الإرسال لعدد محدد', inline: true },
                    { name: `\`${CONFIG.PREFIX}scheduled\``, value: '⏰ عرض وإدارة الجدولات', inline: true },
                    { name: `\`${CONFIG.PREFIX}resend\``, value: '🔄 إعادة إرسال آخر برودكاست', inline: true },
                    { name: `\`${CONFIG.PREFIX}remind\``, value: '🔔 جدولة رسالة لروم محدد', inline: true },
                    { name: `\`${CONFIG.PREFIX}reminders\``, value: '📋 عرض وإدارة التذكيرات', inline: true }
                ];
            } else if (cat === 'stats') {
                fields = [{ name: `\`${CONFIG.PREFIX}stats\``, value: '📊 إحصائيات السيرفر الكاملة', inline: true }];
            } else if (cat === 'admin') {
                fields = [
                    { name: `\`${CONFIG.PREFIX}admin\``, value: '⚙️ إعدادات البوت والأدمنز 👑', inline: true },
                    { name: `\`${CONFIG.PREFIX}setlog\``, value: '📋 تحديد قناة السجل 👑', inline: true },
                    { name: `\`${CONFIG.PREFIX}addemoji\``, value: '😀 إضافة إيموجي للسيرفر 👑', inline: true },
                    { name: `\`${CONFIG.PREFIX}addcmd\``, value: '🔗 إضافة اختصار لأمر 👑', inline: true }
                ];
            } else if (cat === 'owner') {
                fields = [
                    { name: `\`${CONFIG.PREFIX}owner\``, value: '🖥️ لوحة تحكم المالك 👑', inline: true },
                    { name: `\`${CONFIG.PREFIX}restart\``, value: '🔁 إعادة تشغيل البوت 👑', inline: true }
                ];
            }
            await int.update({
                embeds: [makeEmbed(guild, {
                    author: cat === 'broadcast' ? '📢 أوامر البرودكاست' : cat === 'stats' ? '📊 الإحصائيات' : cat === 'admin' ? '⚙️ الإدارة' : '👑 المالك',
                    color: CONFIG.COLORS.INFO, fields
                })]
            });
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'time') try { await helpMsg.edit({ components: [] }); } catch { }
        });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  BROADCAST
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'broadcast') {
        if (!isAdmin(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '🔒 ما عندك صلاحية — لازم تكون Admin أو Owner')] });
        await broadcastFlow(message, args[0]?.toLowerCase() === 'test');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SCHEDULED
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'scheduled') {
        if (!isAdmin(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '🔒 ما عندك صلاحية')] });

        const gd = getGuild(guild.id);
        const scheds = gd.scheduledMessages || [];
        if (scheds.length === 0) return message.reply({ embeds: [makeEmbed(guild, { author: '⏰ الرسائل المجدولة', color: CONFIG.COLORS.PRIMARY, description: '📭 لا توجد جدولات نشطة' })] });

        const fields = scheds.map((s, i) => {
            const tl = s.content.type === 'text_only' ? '📄 نص' : s.content.type === 'image_only' ? '🖼️ صورة' : '📎 نص + صورة';
            return { name: `جدولة #${i + 1} | 🆔 ${s.id.slice(0, 12)}...`, value: `🕐 \`${formatDate(s.scheduledTime)}\`\n📋 ${tl}\n👤 <@${s.createdBy}>`, inline: true };
        });

        const buttons = scheds.slice(0, 5).map((s, i) => new ButtonBuilder().setCustomId(`csched_${s.id}`).setLabel(`إلغاء #${i + 1}`).setStyle(ButtonStyle.Danger));
        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));

        const schedMsg = await message.reply({ embeds: [makeEmbed(guild, { author: `⏰ الرسائل المجدولة — ${scheds.length}`, color: CONFIG.COLORS.INFO, fields })], components: rows });

        const collector = schedMsg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, componentType: ComponentType.Button, time: CONFIG.COLLECTOR_TIMEOUT });
        collector.on('collect', async (int) => {
            const schedId = int.customId.replace('csched_', '');
            if (activeTimers.has(schedId)) { clearTimeout(activeTimers.get(schedId)); activeTimers.delete(schedId); }
            const currentGd = getGuild(guild.id);
            currentGd.scheduledMessages = currentGd.scheduledMessages.filter(s => s.id !== schedId);
            saveGuild(guild.id, currentGd);
            await int.update({ embeds: [successEmbed(guild, `تم إلغاء الجدولة: \`${schedId}\``)], components: [] });
            await sendLog(guild.id, CONFIG.COLORS.ERROR, 'إلغاء جدولة', `🆔 المعرف: \`${schedId}\``, int.user.id);
            collector.stop();
        });
        collector.on('end', async (_, reason) => { if (reason === 'time') try { await schedMsg.edit({ components: [] }); } catch { } });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  RESEND
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'resend') {
        if (!isAdmin(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '🔒 ما عندك صلاحية')] });
        const gd = getGuild(guild.id);
        if (!gd.lastBroadcast) return message.reply({ embeds: [makeEmbed(guild, { author: '🔄 إعادة إرسال', color: CONFIG.COLORS.PRIMARY, description: '📭 ما في برودكاست سابق' })] });

        const last = gd.lastBroadcast;
        await message.channel.send({
            embeds: [makeEmbed(guild, {
                author: '👁️ آخر برودكاست', color: CONFIG.COLORS.WARNING,
                fields: [
                    { name: '📅 التاريخ', value: `\`${formatDate(last.timestamp)}\``, inline: true },
                    { name: '🟢 وصل', value: `\`${last.stats.delivered}\``, inline: true },
                    { name: '🔴 فشل', value: `\`${last.stats.failed}\``, inline: true },
                    { name: '⛔ مقفول', value: `\`${last.stats.blocked}\``, inline: true }
                ]
            })]
        });
        await message.channel.send(buildDmPayload(last.content));

        const ts = uid();
        const confirmMsg = await message.channel.send({
            embeds: [makeEmbed(guild, { author: '⚡ تأكيد إعادة الإرسال', color: CONFIG.COLORS.WARNING, description: 'تأكيد إعادة الإرسال لكل الأعضاء؟' })],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rs_yes_${ts}`).setLabel('✅ أعد الإرسال').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`rs_no_${ts}`).setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger)
            )]
        });

        try {
            const int = await confirmMsg.awaitMessageComponent({ filter: i => i.user.id === message.author.id, componentType: ComponentType.Button, time: CONFIG.COLLECTOR_TIMEOUT });
            if (int.customId === `rs_yes_${ts}`) {
                await int.update({ embeds: [makeEmbed(guild, { author: '🚀 جاري إعادة الإرسال...', color: CONFIG.COLORS.SUCCESS })], components: [] });
                await sendLog(guild.id, CONFIG.COLORS.WARNING, 'إعادة إرسال برودكاست', null, message.author.id);
                await executeBroadcast(guild, message.channel, last.content, 0);
            } else {
                await int.update({ embeds: [makeEmbed(guild, { author: '❌ تم الإلغاء', color: CONFIG.COLORS.ERROR })], components: [] });
            }
        } catch { confirmMsg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { }); }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  STATS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'stats') {
        const gd = getGuild(guild.id);
        const st = gd.stats;
        const total = st.totalDelivered + st.totalFailed + st.totalBlocked;
        const rate = total > 0 ? Math.round((st.totalDelivered / total) * 100) : 0;

        await message.reply({
            embeds: [makeEmbed(guild, {
                author: `📊 إحصائيات ${guild.name}`,
                authorIcon: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL(),
                color: CONFIG.COLORS.INFO,
                thumbnail: guild.iconURL({ dynamic: true }),
                fields: [
                    { name: '📢 إجمالي البرودكاست', value: `\`${st.totalBroadcasts}\``, inline: true },
                    { name: '🟢 إجمالي الوصول', value: `\`${st.totalDelivered}\``, inline: true },
                    { name: '🔴 إجمالي الفشل', value: `\`${st.totalFailed}\``, inline: true },
                    { name: '⛔ إجمالي المقفول', value: `\`${st.totalBlocked}\``, inline: true },
                    { name: '📊 نسبة النجاح', value: progressBar(rate), inline: true },
                    { name: '👥 أعضاء السيرفر', value: `\`${guild.memberCount}\``, inline: true },
                    { name: '⏰ مجدولة نشطة', value: `\`${(gd.scheduledMessages || []).length}\``, inline: true },
                    { name: '🔔 تذكيرات نشطة', value: `\`${(gd.reminders || []).length}\``, inline: true },
                    { name: '📅 آخر برودكاست', value: gd.lastBroadcast ? `\`${formatDate(gd.lastBroadcast.timestamp)}\`` : '`لم يتم بعد`', inline: true }
                ]
            })]
        });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  REMIND
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'remind') {
        if (!isAdmin(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '🔒 ما عندك صلاحية — لازم تكون Admin أو Owner')] });

        const userId = message.author.id;
        const channel = message.channel;

        const chResp = await collectText(channel, userId, '📌 اكتب **منشن الروم** أو **آيديه**:', guild);
        if (!chResp) return;
        const targetChannelId = chResp.content.replace(/[<#>]/g, '').trim();
        const targetChannel = await guild.channels.fetch(targetChannelId).catch(() => null);
        if (!targetChannel) return channel.send({ embeds: [errorEmbed(guild, '❌ ما لقيت هالروم')] });
        const botPerms = targetChannel.permissionsFor(client.user);
        if (!botPerms?.has('SendMessages')) return channel.send({ embeds: [errorEmbed(guild, `🔒 ما أقدر أرسل في <#${targetChannelId}>`)] });

        const daysResp = await collectText(channel, userId, '📅 **بعد كم يوم؟** (اكتب `0` لو اليوم)', guild);
        if (!daysResp) return;
        const days = parseInt(daysResp.content.trim());
        if (isNaN(days) || days < 0) return channel.send({ embeds: [errorEmbed(guild, 'اكتب رقم صحيح 0 أو أكثر')] });

        const hourResp = await collectText(channel, userId, '🕐 **الساعة كم؟** (0-23) — توقيت الرياض', guild);
        if (!hourResp) return;
        const hour = parseInt(hourResp.content.trim());
        if (isNaN(hour) || hour < 0 || hour > 23) return channel.send({ embeds: [errorEmbed(guild, 'اكتب رقم من 0 إلى 23')] });

        const minResp = await collectText(channel, userId, '⏱️ **الدقيقة كم؟** (0-59)', guild);
        if (!minResp) return;
        const minute = parseInt(minResp.content.trim());
        if (isNaN(minute) || minute < 0 || minute > 59) return channel.send({ embeds: [errorEmbed(guild, 'اكتب رقم من 0 إلى 59')] });

        const textResp = await collectText(channel, userId, '💬 اكتب **نص الرسالة** اللي تبي ترسلها:', guild);
        if (!textResp) return;
        const reminderText = textResp.content;

        const nowRiyadh = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
        const targetDate = new Date(nowRiyadh);
        targetDate.setDate(targetDate.getDate() + days);
        targetDate.setHours(hour, minute, 0, 0);
        const yr = targetDate.getFullYear();
        const mo = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dy = String(targetDate.getDate()).padStart(2, '0');
        const hr = String(hour).padStart(2, '0');
        const mn = String(minute).padStart(2, '0');
        const riyadhISO = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:00+03:00`);
        if (riyadhISO <= new Date()) return channel.send({ embeds: [errorEmbed(guild, 'الوقت هذا في الماضي')] });
        const scheduledTime = riyadhISO.toISOString();

        const dayLabel = days === 0 ? 'اليوم' : days === 1 ? 'بكرة' : `بعد ${days} أيام`;
        const timeLabel12 = hour > 12 ? `${hour - 12}:${mn} مساءً` : hour === 0 ? `12:${mn} صباحاً` : hour === 12 ? `12:${mn} ظهراً` : `${hour}:${mn} صباحاً`;

        const ts = uid();
        const confirmMsg = await channel.send({
            embeds: [makeEmbed(guild, {
                author: '🔔 ملخص التذكير', color: CONFIG.COLORS.WARNING,
                description: '⚠️ **تأكد من كل المعلومات**',
                fields: [
                    { name: '📌 الروم', value: `<#${targetChannelId}>`, inline: true },
                    { name: '📆 اليوم', value: `\`${dayLabel}\``, inline: true },
                    { name: '🕐 الوقت', value: `\`${timeLabel12}\``, inline: true },
                    { name: '📋 التاريخ الكامل', value: `\`${formatDate(scheduledTime)}\``, inline: true },
                    { name: '💬 الرسالة', value: reminderText.length > 1024 ? reminderText.slice(0, 1021) + '...' : reminderText, inline: false }
                ]
            })],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rem_yes_${ts}`).setLabel('✅ تأكيد').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`rem_no_${ts}`).setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger)
            )]
        });

        try {
            const int = await confirmMsg.awaitMessageComponent({ filter: i => i.user.id === userId, componentType: ComponentType.Button, time: CONFIG.COLLECTOR_TIMEOUT });
            if (int.customId === `rem_yes_${ts}`) {
                const reminderId = `r_${uid()}`;
                const gd = getGuild(guild.id);
                const reminder = { id: reminderId, channelId: targetChannelId, scheduledTime, text: reminderText, createdBy: userId, createdAt: new Date().toISOString() };
                gd.reminders.push(reminder);
                saveGuild(guild.id, gd);
                startReminderTimer(guild, reminder);
                await int.update({
                    embeds: [makeEmbed(guild, {
                        author: '✓ تم جدولة التذكير', color: CONFIG.COLORS.SUCCESS,
                        fields: [
                            { name: '🆔 المعرف', value: `\`${reminderId}\``, inline: true },
                            { name: '📌 الروم', value: `<#${targetChannelId}>`, inline: true },
                            { name: '🕐 الموعد', value: `\`${formatDate(scheduledTime)}\``, inline: true }
                        ]
                    })],
                    components: []
                });
                await sendLog(guild.id, CONFIG.COLORS.WARNING, 'جدولة تذكير', `🆔 \`${reminderId}\` | 📌 <#${targetChannelId}> | 🕐 \`${formatDate(scheduledTime)}\``, userId);
            } else {
                await int.update({ embeds: [makeEmbed(guild, { author: '❌ تم الإلغاء', color: CONFIG.COLORS.ERROR })], components: [] });
            }
        } catch { confirmMsg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { }); }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  REMINDERS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'reminders') {
        if (!isAdmin(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '🔒 ما عندك صلاحية')] });

        const gd = getGuild(guild.id);
        const reminders = gd.reminders || [];
        if (reminders.length === 0) return message.reply({ embeds: [makeEmbed(guild, { author: '🔔 التذكيرات', color: CONFIG.COLORS.PRIMARY, description: '📭 لا توجد تذكيرات نشطة' })] });

        const fields = reminders.map((r, i) => ({
            name: `تذكير #${i + 1} | 🆔 ${r.id.slice(0, 12)}...`,
            value: `📌 <#${r.channelId}>\n🕐 \`${formatDate(r.scheduledTime)}\`\n💬 \`${r.text.length > 50 ? r.text.slice(0, 47) + '...' : r.text}\`\n👤 <@${r.createdBy}>`,
            inline: true
        }));

        const buttons = reminders.slice(0, 5).map((r, i) => new ButtonBuilder().setCustomId(`crem_${r.id}`).setLabel(`إلغاء #${i + 1}`).setStyle(ButtonStyle.Danger));
        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));

        const remMsg = await message.reply({ embeds: [makeEmbed(guild, { author: `🔔 التذكيرات النشطة — ${reminders.length}`, color: CONFIG.COLORS.INFO, fields })], components: rows });

        const collector = remMsg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, componentType: ComponentType.Button, time: CONFIG.COLLECTOR_TIMEOUT });
        collector.on('collect', async (int) => {
            const remId = int.customId.replace('crem_', '');
            if (activeTimers.has(remId)) { clearTimeout(activeTimers.get(remId)); activeTimers.delete(remId); }
            const currentGd = getGuild(guild.id);
            currentGd.reminders = currentGd.reminders.filter(r => r.id !== remId);
            saveGuild(guild.id, currentGd);
            await int.update({ embeds: [successEmbed(guild, `تم إلغاء التذكير: \`${remId}\``)], components: [] });
            await sendLog(guild.id, CONFIG.COLORS.ERROR, 'إلغاء تذكير', `🆔 المعرف: \`${remId}\``, int.user.id);
            collector.stop();
        });
        collector.on('end', async (_, reason) => { if (reason === 'time') try { await remMsg.edit({ components: [] }); } catch { } });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SETLOG
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'setlog') {
        if (!isOwner(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '👑 هذا الأمر خاص بالمالك فقط')] });

        const gd = getGuild(guild.id);
        const currentStatus = gd.logChannelId ? `🟢 القناة الحالية: <#${gd.logChannelId}>` : '🔴 لا توجد قناة لوق';

        const ts = uid();
        const logMenu = new StringSelectMenuBuilder().setCustomId(`setlog_${ts}`).setPlaceholder('اختر...').addOptions([
            { label: 'هذي القناة', value: 'current', emoji: '📌' },
            { label: 'قناة ثانية', value: 'other', emoji: '🔗' },
            { label: 'إلغاء اللوق', value: 'disable', emoji: '🚫' }
        ]);

        const logMsg = await message.reply({
            embeds: [makeEmbed(guild, { author: '📋 إعداد قناة السجل', color: CONFIG.COLORS.GOLD, description: `${currentStatus}\n\nاختر وين تبي تنرسل السجلات:` })],
            components: [new ActionRowBuilder().addComponents(logMenu)]
        });

        try {
            const logInt = await logMsg.awaitMessageComponent({ filter: i => i.user.id === message.author.id && i.customId === `setlog_${ts}`, componentType: ComponentType.StringSelect, time: CONFIG.COLLECTOR_TIMEOUT });
            const choice = logInt.values[0];
            if (choice === 'current') {
                gd.logChannelId = message.channel.id; saveGuild(guild.id, gd);
                await logInt.update({ embeds: [successEmbed(guild, `🟢 تم تحديد <#${message.channel.id}> كقناة سجل`)], components: [] });
                await sendLog(guild.id, CONFIG.COLORS.SUCCESS, 'تفعيل قناة السجل', null, message.author.id);
            } else if (choice === 'other') {
                await logInt.update({ embeds: [makeEmbed(guild, { author: '🔗 قناة ثانية', color: CONFIG.COLORS.GOLD })], components: [] });
                const chResp = await collectText(message.channel, message.author.id, '📌 اكتب **آيدي القناة** أو **منشن** (#channel):', guild);
                if (!chResp) return;
                const channelId = chResp.content.replace(/[<#>]/g, '').trim();
                const targetCh = await guild.channels.fetch(channelId).catch(() => null);
                if (!targetCh) return message.channel.send({ embeds: [errorEmbed(guild, 'ما لقيت هالقناة')] });
                if (!targetCh.permissionsFor(client.user)?.has('SendMessages')) return message.channel.send({ embeds: [errorEmbed(guild, 'ما أقدر أرسل في هالقناة')] });
                gd.logChannelId = channelId; saveGuild(guild.id, gd);
                await message.channel.send({ embeds: [successEmbed(guild, `🟢 تم تحديد <#${channelId}> كقناة سجل`)] });
                await sendLog(guild.id, CONFIG.COLORS.SUCCESS, 'تفعيل قناة السجل', null, message.author.id);
            } else {
                gd.logChannelId = null; saveGuild(guild.id, gd);
                await logInt.update({ embeds: [makeEmbed(guild, { author: '🔴 تم إلغاء قناة السجل', color: CONFIG.COLORS.WARNING, description: `تقدر تفعلها مرة ثانية بـ \`${CONFIG.PREFIX}setlog\`` })], components: [] });
            }
        } catch { logMsg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { }); }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADMIN
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'admin') {
        if (!isOwner(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '👑 هذا الأمر خاص بالمالك فقط')] });

        const ts = uid();
        const botSettingsMenu = new StringSelectMenuBuilder().setCustomId(`adm_bot_${ts}`).setPlaceholder('⚙️ إعدادات البوت...').addOptions([
            { label: 'تغيير اسم البوت', value: 'name', emoji: '✏️' }, { label: 'تغيير صورة البوت', value: 'avatar', emoji: '🖼️' },
            { label: 'تغيير بنر البوت', value: 'banner', emoji: '🏞️' }, { label: 'تغيير البايو', value: 'bio', emoji: '📝' },
            { label: 'تغيير الستاتس والأكتيفيتي', value: 'status', emoji: '🎯' }, { label: 'تغيير الحالة فقط', value: 'presence', emoji: '🟢' }
        ]);
        const usersMenu = new StringSelectMenuBuilder().setCustomId(`adm_users_${ts}`).setPlaceholder('👥 إدارة المستخدمين...').addOptions([
            { label: 'إضافة Admin', value: 'add', emoji: '➕' }, { label: 'حذف Admin', value: 'remove', emoji: '➖' },
            { label: 'إضافة Owner', value: 'add_owner', emoji: '👑' }, { label: 'حذف Owner', value: 'remove_owner', emoji: '🗑️' },
            { label: 'قائمة الأدمنز والـ Owners', value: 'list', emoji: '📋' }
        ]);

        const adminMsg = await message.reply({
            embeds: [makeEmbed(guild, { author: '⚙️ لوحة الإعدادات', color: CONFIG.COLORS.GOLD, description: `مرحباً 👑 <@${message.author.id}>\n\n**القائمة الأولى:** إعدادات البوت\n**القائمة الثانية:** إدارة المستخدمين` })],
            components: [new ActionRowBuilder().addComponents(botSettingsMenu), new ActionRowBuilder().addComponents(usersMenu)]
        });

        try {
            const admInt = await adminMsg.awaitMessageComponent({ filter: i => i.user.id === message.author.id && (i.customId === `adm_bot_${ts}` || i.customId === `adm_users_${ts}`), componentType: ComponentType.StringSelect, time: CONFIG.COLLECTOR_TIMEOUT });
            const choice = admInt.values[0];

            if (choice === 'name') { const mTs = uid(); const modal = new ModalBuilder().setCustomId(`adm_name_${mTs}`).setTitle('تغيير اسم البوت'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel('الاسم الجديد').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(client.user.username))); await admInt.showModal(modal); try { const modalInt = await admInt.awaitModalSubmit({ filter: i => i.customId === `adm_name_${mTs}`, time: CONFIG.COLLECTOR_TIMEOUT }); const newName = modalInt.fields.getTextInputValue('new_name'); const oldName = client.user.username; try { await client.user.setUsername(newName); await modalInt.update({ embeds: [successEmbed(guild, `تم تغيير الاسم: **${oldName}** → **${newName}**`)], components: [] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'تغيير اسم البوت', `**${oldName}** → **${newName}**`, message.author.id); } catch (err) { await modalInt.update({ embeds: [errorEmbed(guild, `فشل: ${err.message}\n\`تغيير الاسم محدود بمرتين/ساعة\``)], components: [] }); } } catch { } }
            else if (choice === 'avatar') { await admInt.update({ embeds: [makeEmbed(guild, { author: '🖼️ تغيير الصورة', color: CONFIG.COLORS.GOLD })], components: [] }); const resp = await collectText(message.channel, message.author.id, '🖼️ أرسل الصورة الجديدة — رابط أو ارفق ملف:', guild); if (!resp) return; const url = extractImage(resp); if (!url) return message.channel.send({ embeds: [errorEmbed(guild, 'ما لقيت صورة صالحة')] }); try { await client.user.setAvatar(url); await message.channel.send({ embeds: [successEmbed(guild, 'تم تغيير صورة البوت')] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'تغيير صورة البوت', null, message.author.id); } catch (err) { await message.channel.send({ embeds: [errorEmbed(guild, `فشل: ${err.message}`)] }); } }
            else if (choice === 'banner') { await admInt.update({ embeds: [makeEmbed(guild, { author: '🏞️ تغيير البنر', color: CONFIG.COLORS.GOLD, description: '⚠️ البنر يحتاج البوت يكون عنده Nitro أو مطور تطبيقات نشط' })], components: [] }); const resp = await collectText(message.channel, message.author.id, '🏞️ أرسل صورة البنر — رابط أو ارفق ملف:', guild); if (!resp) return; const url = extractImage(resp); if (!url) return message.channel.send({ embeds: [errorEmbed(guild, 'ما لقيت صورة صالحة')] }); try { await message.channel.send({ embeds: [makeEmbed(guild, { author: '⏳ جاري تحميل وتطبيق البنر...', color: CONFIG.COLORS.INFO })] }); const dataURI = await fetchImageAsBase64(url); await client.rest.patch('/users/@me', { body: { banner: dataURI } }); await message.channel.send({ embeds: [successEmbed(guild, '✅ تم تغيير بنر البوت بنجاح!')] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'تغيير بنر البوت', null, message.author.id); } catch (err) { let errorMsg = `فشل تغيير البنر: ${err.message}`; if (err.message?.includes('BASE_TYPE_BAD_LENGTH') || err.code === 50006) errorMsg = '❌ فشل تغيير البنر — تأكد إن الصورة صالحة وحجمها مناسب'; else if (err.status === 400) errorMsg = '❌ فشل — البوت قد ما يدعم البنر'; await message.channel.send({ embeds: [errorEmbed(guild, errorMsg)] }); } }
            else if (choice === 'bio') { const mTs = uid(); const modal = new ModalBuilder().setCustomId(`adm_bio_${mTs}`).setTitle('تغيير البايو'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_bio').setLabel('البايو الجديد').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(190))); await admInt.showModal(modal); try { const modalInt = await admInt.awaitModalSubmit({ filter: i => i.customId === `adm_bio_${mTs}`, time: CONFIG.COLLECTOR_TIMEOUT }); const newBio = modalInt.fields.getTextInputValue('new_bio'); try { await client.rest.patch('/users/@me', { body: { bio: newBio } }); await modalInt.update({ embeds: [successEmbed(guild, `تم تحديث البايو:\n> ${newBio}`)], components: [] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'تغيير بايو البوت', newBio, message.author.id); } catch (err) { await modalInt.update({ embeds: [errorEmbed(guild, `فشل: ${err.message}`)], components: [] }); } } catch { } }
            else if (choice === 'status') { const tsAct = uid(); const actMenu = new StringSelectMenuBuilder().setCustomId(`act_${tsAct}`).setPlaceholder('نوع الأكتيفيتي...').addOptions([{ label: 'Playing', value: 'playing', emoji: '🎮' }, { label: 'Watching', value: 'watching', emoji: '👁️' }, { label: 'Listening', value: 'listening', emoji: '🎧' }, { label: 'Competing', value: 'competing', emoji: '🏅' }, { label: 'Streaming', value: 'streaming', emoji: '🔴' }, { label: 'Custom', value: 'custom', emoji: '💫' }]); await admInt.update({ embeds: [makeEmbed(guild, { author: '🎯 نوع الأكتيفيتي', color: CONFIG.COLORS.GOLD, description: 'اختر النوع:' })], components: [new ActionRowBuilder().addComponents(actMenu)] }); try { const actInt = await message.channel.awaitMessageComponent({ filter: i => i.user.id === message.author.id && i.customId === `act_${tsAct}`, componentType: ComponentType.StringSelect, time: CONFIG.COLLECTOR_TIMEOUT }); const actType = actInt.values[0]; const mTs = uid(); const modal = new ModalBuilder().setCustomId(`status_text_${mTs}`).setTitle('نص الأكتيفيتي'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('status_text').setLabel('النص').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(128))); await actInt.showModal(modal); const modalInt = await actInt.awaitModalSubmit({ filter: i => i.customId === `status_text_${mTs}`, time: CONFIG.COLLECTOR_TIMEOUT }); const statusText = modalInt.fields.getTextInputValue('status_text'); if (actType === 'streaming') { await modalInt.update({ embeds: [makeEmbed(guild, { author: '🔴 Streaming', color: CONFIG.COLORS.GOLD, description: `النص: **${statusText}**\n\nالحين نحتاج رابط البث...` })], components: [] }); const urlResp = await collectText(message.channel, message.author.id, '🔴 أرسل **رابط البث** (Twitch أو YouTube):', guild); if (!urlResp) return; const streamUrl = urlResp.content.trim(); const typeMap = { playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening, competing: ActivityType.Competing, streaming: ActivityType.Streaming, custom: ActivityType.Custom }; client.user.setPresence({ activities: [{ name: statusText, type: typeMap[actType], url: streamUrl }], status: client.user.presence?.status || 'online' }); await message.channel.send({ embeds: [successEmbed(guild, `تم تحديث الستاتس\n\n**النوع:** Streaming 🔴\n**النص:** ${statusText}\n**الرابط:** ${streamUrl}`)] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'تغيير ستاتس البوت', `النوع: **Streaming** | النص: **${statusText}** | الرابط: ${streamUrl}`, message.author.id); return; } const tsSt = uid(); const stMenu = new StringSelectMenuBuilder().setCustomId(`st_${tsSt}`).setPlaceholder('الحالة...').addOptions([{ label: 'Online', value: 'online', emoji: '🟢' }, { label: 'DND', value: 'dnd', emoji: '🔴' }, { label: 'Idle', value: 'idle', emoji: '🟡' }, { label: 'Invisible', value: 'invisible', emoji: '⚫' }]); await modalInt.update({ embeds: [makeEmbed(guild, { author: '🎯 اختر الحالة', color: CONFIG.COLORS.GOLD, description: `النوع: **${actType}** | النص: **${statusText}**` })], components: [new ActionRowBuilder().addComponents(stMenu)] }); const stInt = await message.channel.awaitMessageComponent({ filter: i => i.user.id === message.author.id && i.customId === `st_${tsSt}`, componentType: ComponentType.StringSelect, time: CONFIG.COLLECTOR_TIMEOUT }); const statusType = stInt.values[0]; const typeMap = { playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening, competing: ActivityType.Competing, streaming: ActivityType.Streaming, custom: ActivityType.Custom }; client.user.setPresence({ activities: [{ name: statusText, type: typeMap[actType] }], status: statusType }); await stInt.update({ embeds: [successEmbed(guild, `تم تحديث الستاتس\n\n**النوع:** ${actType}\n**النص:** ${statusText}\n**الحالة:** ${statusType}`)], components: [] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'تغيير ستاتس البوت', `النوع: **${actType}** | النص: **${statusText}** | الحالة: **${statusType}**`, message.author.id); } catch { } }
            else if (choice === 'presence') { const tsP = uid(); const presenceMenu = new StringSelectMenuBuilder().setCustomId(`pres_${tsP}`).setPlaceholder('اختر الحالة...').addOptions([{ label: 'Online', value: 'online', emoji: '🟢' }, { label: 'DND', value: 'dnd', emoji: '🔴' }, { label: 'Idle', value: 'idle', emoji: '🟡' }, { label: 'Invisible', value: 'invisible', emoji: '⚫' }]); await admInt.update({ embeds: [makeEmbed(guild, { author: '🟢 تغيير الحالة', color: CONFIG.COLORS.GOLD, description: 'اختر الحالة الجديدة:\n\n*الأكتيفيتي الحالية ما بتتغير*' })], components: [new ActionRowBuilder().addComponents(presenceMenu)] }); try { const presInt = await message.channel.awaitMessageComponent({ filter: i => i.user.id === message.author.id && i.customId === `pres_${tsP}`, componentType: ComponentType.StringSelect, time: CONFIG.COLLECTOR_TIMEOUT }); const newStatus = presInt.values[0]; const currentActivities = client.user.presence?.activities || []; client.user.setPresence({ activities: currentActivities.length > 0 ? currentActivities : [], status: newStatus }); const statusLabels = { online: '🟢 Online', dnd: '🔴 DND', idle: '🟡 Idle', invisible: '⚫ Invisible' }; await presInt.update({ embeds: [successEmbed(guild, `تم تغيير الحالة إلى: **${statusLabels[newStatus]}**`)], components: [] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'تغيير حالة البوت', `الحالة: **${statusLabels[newStatus]}**`, message.author.id); } catch { } }
            else if (choice === 'add') { await admInt.update({ embeds: [makeEmbed(guild, { author: '➕ إضافة Admin', color: CONFIG.COLORS.GOLD })], components: [] }); const resp = await collectText(message.channel, message.author.id, '👤 اكتب آيدي المستخدم أو سوله منشن:', guild); if (!resp) return; let targetId = resp.content.replace(/[<@!>]/g, '').trim(); if (!/^\d{17,19}$/.test(targetId)) return message.channel.send({ embeds: [errorEmbed(guild, 'آيدي غير صالح')] }); try { const user = await client.users.fetch(targetId); if (user.bot) return message.channel.send({ embeds: [errorEmbed(guild, 'ما ينفع تضيف بوت')] }); } catch { return message.channel.send({ embeds: [errorEmbed(guild, 'ما لقيت هالمستخدم')] }); } const gd = getGuild(guild.id); if (gd.admins.includes(targetId)) return message.channel.send({ embeds: [makeEmbed(guild, { author: '⚠️ موجود', color: CONFIG.COLORS.WARNING, description: 'هالمستخدم أدمن بالفعل' })] }); gd.admins.push(targetId); saveGuild(guild.id, gd); await message.channel.send({ embeds: [successEmbed(guild, `🟢 تم إضافة <@${targetId}> كأدمن`)] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'إضافة أدمن', `<@${targetId}> \`${targetId}\``, message.author.id); }
            else if (choice === 'remove') { const gd = getGuild(guild.id); if (gd.admins.length === 0) return admInt.update({ embeds: [makeEmbed(guild, { author: '📋 الأدمنز', color: CONFIG.COLORS.PRIMARY, description: '📭 ما في أدمنز حالياً' })], components: [] }); await admInt.update({ embeds: [makeEmbed(guild, { author: '➖ حذف Admin', color: CONFIG.COLORS.GOLD })], components: [] }); const resp = await collectText(message.channel, message.author.id, '👤 اكتب آيدي الأدمن أو سوله منشن:', guild); if (!resp) return; let removeId = resp.content.replace(/[<@!>]/g, '').trim(); if (!gd.admins.includes(removeId)) return message.channel.send({ embeds: [errorEmbed(guild, 'هالمستخدم مو أدمن')] }); gd.admins = gd.admins.filter(id => id !== removeId); saveGuild(guild.id, gd); await message.channel.send({ embeds: [successEmbed(guild, `🔴 تم حذف <@${removeId}> من الأدمنز`)] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'حذف أدمن', `<@${removeId}> \`${removeId}\``, message.author.id); }
            else if (choice === 'add_owner') { await admInt.update({ embeds: [makeEmbed(guild, { author: '👑 إضافة Owner', color: CONFIG.COLORS.GOLD })], components: [] }); const resp = await collectText(message.channel, message.author.id, '👑 اكتب آيدي المستخدم أو سوله منشن:', guild); if (!resp) return; let targetId = resp.content.replace(/[<@!>]/g, '').trim(); if (!/^\d{17,19}$/.test(targetId)) return message.channel.send({ embeds: [errorEmbed(guild, 'آيدي غير صالح')] }); if (targetId === CONFIG.OWNER_ID) return message.channel.send({ embeds: [makeEmbed(guild, { author: '⚠️ موجود', color: CONFIG.COLORS.WARNING, description: 'هذا المالك الأصلي — بالفعل Owner!' })] }); try { const user = await client.users.fetch(targetId); if (user.bot) return message.channel.send({ embeds: [errorEmbed(guild, 'ما ينفع تضيف بوت')] }); } catch { return message.channel.send({ embeds: [errorEmbed(guild, 'ما لقيت هالمستخدم')] }); } const gd = getGuild(guild.id); if (gd.owners.includes(targetId)) return message.channel.send({ embeds: [makeEmbed(guild, { author: '⚠️ موجود', color: CONFIG.COLORS.WARNING, description: 'هالمستخدم Owner بالفعل' })] }); gd.owners.push(targetId); saveGuild(guild.id, gd); await message.channel.send({ embeds: [successEmbed(guild, `👑 تم إضافة <@${targetId}> كـ Owner`)] }); await sendLog(guild.id, CONFIG.COLORS.GOLD, 'إضافة Owner', `👑 <@${targetId}> \`${targetId}\``, message.author.id); }
            else if (choice === 'remove_owner') { const gd = getGuild(guild.id); if (gd.owners.length === 0) return admInt.update({ embeds: [makeEmbed(guild, { author: '👑 الـ Owners', color: CONFIG.COLORS.PRIMARY, description: '📭 ما في Owners مضافين (بس المالك الأصلي)' })], components: [] }); await admInt.update({ embeds: [makeEmbed(guild, { author: '🗑️ حذف Owner', color: CONFIG.COLORS.GOLD })], components: [] }); const resp = await collectText(message.channel, message.author.id, '👑 اكتب آيدي الـ Owner اللي تبي تحذفه:', guild); if (!resp) return; let removeId = resp.content.replace(/[<@!>]/g, '').trim(); if (removeId === CONFIG.OWNER_ID) return message.channel.send({ embeds: [errorEmbed(guild, '❌ ما ينفع تحذف المالك الأصلي!')] }); if (!gd.owners.includes(removeId)) return message.channel.send({ embeds: [errorEmbed(guild, 'هالمستخدم مو في قائمة الـ Owners')] }); gd.owners = gd.owners.filter(id => id !== removeId); saveGuild(guild.id, gd); await message.channel.send({ embeds: [successEmbed(guild, `🗑️ تم حذف <@${removeId}> من الـ Owners`)] }); await sendLog(guild.id, CONFIG.COLORS.GOLD, 'حذف Owner', `🗑️ <@${removeId}> \`${removeId}\``, message.author.id); }
            else if (choice === 'list') { const gd = getGuild(guild.id); const admins = gd.admins; const owners = gd.owners || []; const fields = []; fields.push({ name: '👑 المالك الأصلي', value: `<@${CONFIG.OWNER_ID}>\n\`${CONFIG.OWNER_ID}\``, inline: true }); if (owners.length > 0) owners.forEach((id, i) => fields.push({ name: `👑 Owner #${i + 1}`, value: `<@${id}>\n\`${id}\``, inline: true })); fields.push({ name: '\u200b', value: '─'.repeat(30), inline: false }); if (admins.length === 0) fields.push({ name: '🛡️ الأدمنز', value: '📭 لا يوجد', inline: true }); else admins.forEach((id, i) => fields.push({ name: `🛡️ أدمن #${i + 1}`, value: `<@${id}>\n\`${id}\``, inline: true })); await admInt.update({ embeds: [makeEmbed(guild, { author: `📋 الأدمنز والـ Owners — ${1 + owners.length + admins.length}`, color: CONFIG.COLORS.GOLD, fields })], components: [] }); }
        } catch { adminMsg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { }); }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADDEMOJI
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'addemoji') {
        if (!isOwner(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '👑 هذا الأمر خاص بالمالك فقط')] });
        const emojiResp = await collectText(message.channel, message.author.id, '😀 أرسل **الإيموجي** المخصص اللي تبي تضيفه\n`<:name:id>` أو `<a:name:id>`', guild);
        if (!emojiResp) return;
        const emojiMatch = emojiResp.content.match(/<(a?):(\w+):(\d+)>/);
        if (!emojiMatch) return message.channel.send({ embeds: [errorEmbed(guild, '❌ هذا مو إيموجي مخصص!')] });
        const isAnimated = emojiMatch[1] === 'a'; const emojiName = emojiMatch[2]; const emojiId = emojiMatch[3];
        const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${isAnimated ? 'gif' : 'png'}?size=128`;
        const ts = uid();
        const confirmMsg = await message.channel.send({ embeds: [makeEmbed(guild, { author: '😀 معاينة الإيموجي', color: CONFIG.COLORS.WARNING, thumbnail: emojiUrl, description: 'تأكد من الإيموجي قبل الإضافة:', fields: [{ name: '📌 الاسم', value: `\`${emojiName}\``, inline: true }, { name: '🆔 الآيدي', value: `\`${emojiId}\``, inline: true }, { name: '🎞️ النوع', value: isAnimated ? '🟢 متحرك' : '🔴 ثابت', inline: true }] })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`emoji_yes_${ts}`).setLabel('✅ أضف').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`emoji_no_${ts}`).setLabel('❌ إلغاء').setStyle(ButtonStyle.Danger))] });
        try { const int = await confirmMsg.awaitMessageComponent({ filter: i => i.user.id === message.author.id, componentType: ComponentType.Button, time: CONFIG.COLLECTOR_TIMEOUT }); if (int.customId === `emoji_yes_${ts}`) { await int.update({ embeds: [makeEmbed(guild, { author: '⏳ جاري الإضافة...', color: CONFIG.COLORS.INFO })], components: [] }); try { const botMember = await guild.members.fetch(client.user.id); if (!botMember.permissions.has('ManageGuildExpressions')) return message.channel.send({ embeds: [errorEmbed(guild, '🔒 البوت ما عنده صلاحية **Manage Expressions**')] }); const newEmoji = await guild.emojis.create({ attachment: emojiUrl, name: emojiName }); const useCode = newEmoji.animated ? `<a:${newEmoji.name}:${newEmoji.id}>` : `<:${newEmoji.name}:${newEmoji.id}>`; await message.channel.send({ embeds: [makeEmbed(guild, { author: '✓ تم إضافة الإيموجي', color: CONFIG.COLORS.SUCCESS, thumbnail: newEmoji.url, description: `${useCode} تم إضافته بنجاح!`, fields: [{ name: '📌 الاسم', value: `\`${newEmoji.name}\``, inline: true }, { name: '🆔 الآيدي', value: `\`${newEmoji.id}\``, inline: true }, { name: '💬 كود الاستخدام', value: `\`${useCode}\``, inline: true }] })] }); await sendLog(guild.id, CONFIG.COLORS.SUCCESS, 'إضافة إيموجي', `📌 **${newEmoji.name}** | 🆔 \`${newEmoji.id}\``, message.author.id); } catch (err) { let errorMsg = `فشل: ${err.message}`; if (err.code === 30008) errorMsg = '❌ السيرفر وصل الحد الأقصى!'; else if (err.code === 50013) errorMsg = '🔒 صلاحية كافية ما عنده'; await message.channel.send({ embeds: [errorEmbed(guild, errorMsg)] }); } } else { await int.update({ embeds: [makeEmbed(guild, { author: '❌ تم الإلغاء', color: CONFIG.COLORS.ERROR })], components: [] }); } } catch { confirmMsg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { }); }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ADDCMD
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'addcmd') {
        if (!isOwner(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '👑 هذا الأمر خاص بالمالك فقط')] });
        const gd = getGuild(guild.id); const aliases = gd.aliases || {}; const currentAliases = Object.entries(aliases);
        let aliasListText = currentAliases.length === 0 ? '📭 لا توجد اختصارات' : currentAliases.map(([a, o]) => `\`${CONFIG.PREFIX}${a}\` → \`${CONFIG.PREFIX}${o}\``).join('\n');
        const ts = uid();
        const cmdMenu = new StringSelectMenuBuilder().setCustomId(`addcmd_${ts}`).setPlaceholder('اختر الأمر...').addOptions([{ label: 'broadcast', value: 'broadcast', emoji: '📤' }, { label: 'broadcast test', value: 'broadcast test', emoji: '🧪' }, { label: 'scheduled', value: 'scheduled', emoji: '⏰' }, { label: 'resend', value: 'resend', emoji: '🔄' }, { label: 'stats', value: 'stats', emoji: '📊' }, { label: 'help', value: 'help', emoji: '📖' }, { label: 'admin', value: 'admin', emoji: '⚙️' }, { label: 'setlog', value: 'setlog', emoji: '📋' }, { label: 'addemoji', value: 'addemoji', emoji: '😀' }, { label: 'addcmd', value: 'addcmd', emoji: '🔗' }, { label: 'remind', value: 'remind', emoji: '🔔' }, { label: 'reminders', value: 'reminders', emoji: '📋' }]);
        const components = [new ActionRowBuilder().addComponents(cmdMenu)];
        if (currentAliases.length > 0) { const tsD = uid(); components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`delcmd_${tsD}`).setPlaceholder('🗑️ أو احذف اختصار...').addOptions(currentAliases.map(([a, o]) => ({ label: `حذف: ${a}`, description: `→ ${o}`, value: a, emoji: '🗑️' }))))); }
        const addcmdMsg = await message.reply({ embeds: [makeEmbed(guild, { author: '🔗 إدارة الاختصارات', color: CONFIG.COLORS.GOLD, description: `**الاختصارات الحالية:**\n${aliasListText}` })], components });
        const collector = addcmdMsg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, componentType: ComponentType.StringSelect, time: CONFIG.COLLECTOR_TIMEOUT });
        collector.on('collect', async (int) => { if (int.customId.startsWith('delcmd_')) { const aliasDel = int.values[0]; const freshGd = getGuild(guild.id); if (freshGd.aliases?.[aliasDel]) { const orig = freshGd.aliases[aliasDel]; delete freshGd.aliases[aliasDel]; saveGuild(guild.id, freshGd); await int.update({ embeds: [successEmbed(guild, `🗑️ تم حذف: \`${CONFIG.PREFIX}${aliasDel}\` → \`${CONFIG.PREFIX}${orig}\``)], components: [] }); await sendLog(guild.id, CONFIG.COLORS.WARNING, 'حذف اختصار', `🗑️ \`${CONFIG.PREFIX}${aliasDel}\``, message.author.id); } collector.stop(); return; } const selectedCmd = int.values[0]; await int.update({ embeds: [makeEmbed(guild, { author: '🔗 إضافة اختصار', color: CONFIG.COLORS.INFO, description: `الأمر: \`${CONFIG.PREFIX}${selectedCmd}\`` })], components: [] }); collector.stop(); const aliasResp = await collectText(message.channel, message.author.id, `✏️ اكتب **الاختصار** بدون \`${CONFIG.PREFIX}\`:`, guild); if (!aliasResp) return; const newAlias = aliasResp.content.trim().toLowerCase(); if (newAlias.includes(' ')) return message.channel.send({ embeds: [errorEmbed(guild, 'كلمة وحدة بدون مسافات')] }); if (newAlias.length < 1 || newAlias.length > 20) return message.channel.send({ embeds: [errorEmbed(guild, 'بين 1 و 20 حرف')] }); if (CONFIG.ORIGINAL_COMMANDS.includes(newAlias)) return message.channel.send({ embeds: [errorEmbed(guild, `\`${newAlias}\` أمر أصلي!`)] }); const freshGd = getGuild(guild.id); if (!freshGd.aliases) freshGd.aliases = {}; if (freshGd.aliases[newAlias]) return message.channel.send({ embeds: [errorEmbed(guild, `\`${newAlias}\` مستخدم بالفعل`)] }); freshGd.aliases[newAlias] = selectedCmd; saveGuild(guild.id, freshGd); await message.channel.send({ embeds: [makeEmbed(guild, { author: '✓ تم إضافة الاختصار', color: CONFIG.COLORS.SUCCESS, fields: [{ name: '🔗 الاختصار', value: `\`${CONFIG.PREFIX}${newAlias}\``, inline: true }, { name: '📌 الأصلي', value: `\`${CONFIG.PREFIX}${selectedCmd}\``, inline: true }] })] }); await sendLog(guild.id, CONFIG.COLORS.INFO, 'إضافة اختصار', `🔗 \`${CONFIG.PREFIX}${newAlias}\` → \`${CONFIG.PREFIX}${selectedCmd}\``, message.author.id); });
        collector.on('end', async (_, reason) => { if (reason === 'time') try { await addcmdMsg.edit({ components: [] }); } catch { } });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  OWNER
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'owner') {
        if (!isOwner(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '👑 هذا الأمر خاص بالمالك فقط')] });
        const guilds = client.guilds.cache; const data = loadData(); let totalBc = 0, totalMem = 0; const guildFields = [];
        guilds.forEach(g => { const gd = data[g.id]; const bc = gd?.stats?.totalBroadcasts || 0; totalBc += bc; totalMem += g.memberCount; guildFields.push({ name: g.name, value: `👥 \`${g.memberCount}\` | 📢 \`${bc}\` | 🛡️ \`${gd?.admins?.length || 0}\` | 👑 \`${(gd?.owners?.length || 0) + 1}\` | 🔔 ${gd?.logChannelId ? '🟢' : '🔴'}`, inline: false }); });
        await message.reply({ embeds: [makeEmbed(guild, { author: '👑 لوحة تحكم المالك', authorIcon: client.user.displayAvatarURL({ dynamic: true }), color: CONFIG.COLORS.GOLD, thumbnail: client.user.displayAvatarURL({ dynamic: true }), fields: [{ name: '🖥️ السيرفرات', value: `\`${guilds.size}\``, inline: true }, { name: '👥 إجمالي الأعضاء', value: `\`${totalMem}\``, inline: true }, { name: '📢 إجمالي البرودكاست', value: `\`${totalBc}\``, inline: true }, { name: '⚡ البينق', value: `\`${client.ws.ping}ms\``, inline: true }, { name: '⏱️ وقت التشغيل', value: `\`${formatUptime(client.uptime)}\``, inline: true }, { name: '📦 الإصدار', value: '`v2.1.0`', inline: true }, ...guildFields] })] });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  RESTART
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    else if (cmd === 'restart') {
        if (!isOwner(message.author.id, guild.id)) return message.reply({ embeds: [errorEmbed(guild, '👑 هذا الأمر خاص بالمالك فقط')] });
        const ts = uid();
        const rstMsg = await message.reply({ embeds: [makeEmbed(guild, { author: '⚠️ إعادة تشغيل', color: CONFIG.COLORS.ERROR, description: `متأكد تبي تسوي ريستارت؟\n\n• البوت بيطفى ويرجع يشتغل\n• الجدولات المحفوظة ما بتتأثر\n• وقت التشغيل: **${formatUptime(client.uptime)}**`, footer: 'البوت بيرجع تلقائي لو على Railway أو PM2' })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rst_yes_${ts}`).setLabel('🔁 أعد التشغيل').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`rst_no_${ts}`).setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary))] });
        try { const int = await rstMsg.awaitMessageComponent({ filter: i => i.user.id === message.author.id, componentType: ComponentType.Button, time: 30000 }); if (int.customId === `rst_yes_${ts}`) { await int.update({ embeds: [makeEmbed(guild, { author: '🔁 جاري إعادة التشغيل...', color: CONFIG.COLORS.SUCCESS, description: 'البوت بيرجع خلال ثواني' })], components: [] }); await sendLog(guild.id, CONFIG.COLORS.ERROR, 'إعادة تشغيل البوت', null, message.author.id); await sleep(1500); process.exit(0); } else { await int.update({ embeds: [makeEmbed(guild, { author: '✓ تم الإلغاء', color: CONFIG.COLORS.PRIMARY })], components: [] }); } } catch { rstMsg.edit({ embeds: [errorEmbed(guild, 'انتهى الوقت')], components: [] }).catch(() => { }); }
    }
});

// ═══════════════════════════════════════════════════════
//  معالجة الأخطاء
// ═══════════════════════════════════════════════════════

process.on('unhandledRejection', (err) => { console.error('[ERROR] Unhandled Rejection:', err?.message || err); });
process.on('uncaughtException', (err) => { console.error('[ERROR] Uncaught Exception:', err?.message || err); });
client.on('error', (err) => { console.error('[CLIENT] Error:', err.message); });
client.on('shardReconnecting', () => { console.log('[SHARD] Reconnecting...'); });
client.on('shardResume', () => { console.log('[SHARD] Resumed'); });

// ═══════════════════════════════════════════════════════
//  تشغيل البوت
// ═══════════════════════════════════════════════════════

client.login(CONFIG.TOKEN).catch(err => { console.error('[LOGIN] Failed:', err.message); process.exit(1); });
