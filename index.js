// ═══════════════════════════════════════════════════════
//  بوت البرودكاست الاحترافي — نسخة بتصميم بشري فاخر
//  كل التفاصيل مصممة يدوياً بعناية
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
    ComponentType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ─── الإعدادات الأساسية ───
const PREFIX = '#';
const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const DATA_FILE = path.join(__dirname, 'data.json');
const COLLECTOR_TIMEOUT = 300000; // 5 دقائق
const DM_DELAY = 1200; // تأخير بين كل DM

// ─── ثيم التصميم الموحد ───
// كل لون مختار بعناية ليعطي إحساس معين
const THEME = {
    MAIN: 0x2B2D31,       // رمادي غامق أنيق — اللون الأساسي
    ACCENT: 0x5865F2,     // أزرق ديسكورد — للعناصر المميزة
    GLOW: 0x57F287,       // أخضر ناعم — للنجاح
    WARM: 0xFEE75C,       // أصفر دافي — للتنبيهات
    ROSE: 0xED4245,       // أحمر وردي — للأخطاء
    SOFT: 0xEB459E,       // وردي ناعم — للجدولة
    FROST: 0x5865F2,      // أزرق ثلجي — للمعلومات
    GOLD: 0xF0B232,       // ذهبي — للإدارة
    NIGHT: 0x23272A       // أسود ليلي — للخلفيات
};

// ─── الرموز المخصصة (بدل الإيموجي العشوائية) ───
const IC = {
    dot: '▸',
    line: '─',
    corner: '╰',
    bar: '│',
    arrow: '➜',
    star: '✦',
    check: '✓',
    cross: '✗',
    clock: '◷',
    mail: '✉',
    lock: '⊘',
    user: '◉',
    chart: '◈',
    gear: '⟐',
    crown: '♛',
    shield: '⊡',
    pulse: '◆',
    ring: '○',
    filled: '●',
    spark: '∗',
    send: '⊳',
    pin: '⊿',
    wave: '〜'
};

// ─── إنشاء الكلاينت ───
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// مخزن المؤقتات النشطة
const activeSchedules = new Map();

// ═══════════════════════════════════════
//  دوال التخزين
// ═══════════════════════════════════════

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2), 'utf-8');
            return {};
        }
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (err) {
        console.error('[DATA] خطأ في القراءة:', err.message);
        return {};
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('[DATA] خطأ في الحفظ:', err.message);
    }
}

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

function updateGuildData(guildId, guildData) {
    const data = loadData();
    data[guildId] = guildData;
    saveData(data);
}

// ═══════════════════════════════════════
//  دوال الصلاحيات
// ═══════════════════════════════════════

function isOwner(userId) {
    return userId === OWNER_ID;
}

function isAdmin(userId, guildId) {
    if (isOwner(userId)) return true;
    const guildData = getGuildData(guildId);
    return guildData.admins.includes(userId);
}

// ═══════════════════════════════════════
//  دوال التصميم — هنا السحر
// ═══════════════════════════════════════

/**
 * خط فاصل أنيق
 */
function divider() {
    return `\`${IC.line.repeat(32)}\``;
}

/**
 * شريط تقدم بتصميم مخصص
 */
function progressBar(percent) {
    const total = 16;
    const filled = Math.round((percent / 100) * total);
    const empty = total - filled;
    return `\`[\`${'▰'.repeat(filled)}${'▱'.repeat(empty)}\`]\` **${percent}%**`;
}

/**
 * تنسيق التاريخ بتوقيت الرياض
 */
function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleString('en-US', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * تنسيق وقت التشغيل
 */
function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h % 24 > 0) parts.push(`${h % 24}h`);
    if (m % 60 > 0) parts.push(`${m % 60}m`);
    if (s % 60 > 0) parts.push(`${s % 60}s`);
    return parts.join(' ') || '0s';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Embed بالستايل الموحد — كل Embed يمر من هنا
 */
function styledEmbed(options = {}) {
    const embed = new EmbedBuilder()
        .setColor(options.color || THEME.MAIN)
        .setTimestamp();

    // العنوان بدون إيموجي زايدة — نظيف
    if (options.title) {
        embed.setAuthor({
            name: options.title,
            iconURL: options.icon || null
        });
    }

    if (options.description) {
        embed.setDescription(options.description);
    }

    if (options.fields) {
        embed.addFields(options.fields);
    }

    if (options.footer) {
        embed.setFooter({ text: options.footer });
    }

    if (options.thumbnail) {
        embed.setThumbnail(options.thumbnail);
    }

    if (options.image) {
        embed.setImage(options.image);
    }

    return embed;
}

/**
 * جمع رسالة من المستخدم
 */
async function collectMessage(channel, userId, promptText, timeout = COLLECTOR_TIMEOUT) {
    const promptEmbed = styledEmbed({
        color: THEME.FROST,
        description: `${promptText}\n\n\`${IC.clock} ${Math.floor(timeout / 60000)} دقائق للإجابة  ${IC.dot} اكتب "إلغاء" للخروج\``,
    });

    await channel.send({ embeds: [promptEmbed] });

    try {
        const filter = m => m.author.id === userId;
        const collected = await channel.awaitMessages({
            filter, max: 1, time: timeout, errors: ['time']
        });

        const response = collected.first();
        if (['إلغاء', 'الغاء', 'cancel'].includes(response.content.trim().toLowerCase())) {
            await channel.send({
                embeds: [styledEmbed({
                    color: THEME.WARM,
                    description: `${IC.dot} تم إلغاء العملية`
                })]
            });
            return null;
        }
        return response;
    } catch {
        await channel.send({
            embeds: [styledEmbed({
                color: THEME.ROSE,
                description: `${IC.cross} انتهى الوقت المخصص — حاول مرة ثانية`
            })]
        });
        return null;
    }
}

// ═══════════════════════════════════════
//  نظام البرودكاست
// ═══════════════════════════════════════

/**
 * إرسال البرودكاست مع تقدم مباشر
 */
async function sendBroadcast(guild, channel, broadcastContent, maxMembers = 0) {
    await guild.members.fetch();

    let members = guild.members.cache.filter(m => !m.user.bot).map(m => m);

    if (maxMembers > 0 && maxMembers < members.length) {
        members = members.sort(() => Math.random() - 0.5).slice(0, maxMembers);
    }

    const total = members.length;
    let delivered = 0;
    let failed = 0;
    let blocked = 0;

    // رسالة البداية
    const progressMsg = await channel.send({
        embeds: [styledEmbed({
            color: THEME.ACCENT,
            title: `${IC.send} جاري الإرسال`,
            description:
                `${divider()}\n` +
                `${IC.dot} الأعضاء: **${total}**\n` +
                `${IC.dot} الحالة: **بدأ الإرسال...**\n` +
                `${divider()}\n` +
                `${progressBar(0)}`
        })]
    });

    let updateCounter = 0;

    for (let i = 0; i < members.length; i++) {
        const member = members[i];

        try {
            const payload = {};

            if (broadcastContent.text) {
                payload.content = broadcastContent.text;
            }

            if (broadcastContent.embed) {
                payload.embeds = [EmbedBuilder.from(broadcastContent.embed)];
            }

            if (broadcastContent.image && !broadcastContent.embed) {
                payload.files = [broadcastContent.image];
            }

            await member.send(payload);
            delivered++;
        } catch (error) {
            if (error.code === 50007) {
                blocked++;
            } else {
                failed++;
            }
        }

        updateCounter++;

        // تحديث كل 8 أعضاء أو عند الانتهاء
        if (updateCounter >= 8 || i === members.length - 1) {
            updateCounter = 0;
            const percent = Math.round(((i + 1) / total) * 100);

            try {
                await progressMsg.edit({
                    embeds: [styledEmbed({
                        color: THEME.ACCENT,
                        title: `${IC.send} جاري الإرسال`,
                        description:
                            `${divider()}\n` +
                            `${IC.check} وصل: **${delivered}**\n` +
                            `${IC.cross} فشل: **${failed}**\n` +
                            `${IC.lock} مقفل: **${blocked}**\n` +
                            `${IC.clock} متبقي: **${total - (i + 1)}**\n` +
                            `${divider()}\n` +
                            `${progressBar(percent)}`
                    })]
                });
            } catch (e) { /* تجاهل */ }
        }

        if (i < members.length - 1) {
            await sleep(DM_DELAY);
        }
    }

    // التقرير النهائي — بتصميم فاخر
    const successRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    const finalEmbed = styledEmbed({
        color: delivered > 0 ? THEME.GLOW : THEME.ROSE,
        title: `${IC.chart} التقرير النهائي`,
        description:
            `${maxMembers > 0 ? `\`  تجربة  \`\n\n` : ''}` +
            `${divider()}\n\n` +

            `${IC.user}  الأعضاء المستهدفين\n` +
            `\`\`\`${total}\`\`\`\n` +

            `${IC.check}  وصلت بنجاح\n` +
            `\`\`\`${delivered}\`\`\`\n` +

            `${IC.cross}  فشل الإرسال\n` +
            `\`\`\`${failed}\`\`\`\n` +

            `${IC.lock}  الخاص مقفل\n` +
            `\`\`\`${blocked}\`\`\`\n` +

            `${divider()}\n\n` +
            `${IC.chart} نسبة الوصول: ${progressBar(successRate)}`,

        footer: `${guild.name} ${IC.dot} ${formatDate(new Date())}`
    });

    try {
        await progressMsg.edit({ embeds: [finalEmbed] });
    } catch {
        await channel.send({ embeds: [finalEmbed] });
    }

    // تحديث الإحصائيات
    const guildData = getGuildData(guild.id);
    guildData.stats.totalBroadcasts++;
    guildData.stats.totalDelivered += delivered;
    guildData.stats.totalFailed += failed;
    guildData.stats.totalBlocked += blocked;

    // تحويل الـ embed لشكل قابل للتخزين
    const storableContent = { ...broadcastContent };
    // التأكد إن المحتوى قابل للتخزين في JSON
    guildData.lastBroadcast = {
        content: storableContent,
        timestamp: new Date().toISOString(),
        stats: { delivered, failed, blocked, total }
    };
    updateGuildData(guild.id, guildData);

    return { delivered, failed, blocked, total };
}

// ═══════════════════════════════════════
//  Flow بناء البرودكاست التفاعلي
// ═══════════════════════════════════════

async function startBroadcastFlow(message, isTest = false) {
    const userId = message.author.id;
    const channel = message.channel;
    const guildId = message.guild.id;

    // ── المرحلة 1: نوع المحتوى ──
    const typeMenu = new StringSelectMenuBuilder()
        .setCustomId(`bc_type_${userId}_${Date.now()}`)
        .setPlaceholder('اختر نوع المحتوى...')
        .addOptions([
            {
                label: 'نص فقط',
                description: 'رسالة نصية بدون مرفقات',
                value: 'text_only',
                emoji: '📄'
            },
            {
                label: 'صورة فقط',
                description: 'صورة بدون نص',
                value: 'image_only',
                emoji: '🎨'
            },
            {
                label: 'نص مع صورة',
                description: 'رسالة نصية مرفقة بصورة',
                value: 'text_and_image',
                emoji: '📎'
            }
        ]);

    const typeMsg = await channel.send({
        embeds: [styledEmbed({
            color: THEME.ACCENT,
            title: isTest ? `${IC.spark} برودكاست تجريبي` : `${IC.send} برودكاست جديد`,
            description:
                `مرحباً <@${userId}>\n\n` +
                `${IC.dot} وش نوع الرسالة اللي تبي ترسلها؟\n` +
                `${IC.dot} اختر من القائمة تحت`,
            footer: `الخطوة 1 من 4`
        })],
        components: [new ActionRowBuilder().addComponents(typeMenu)]
    });

    let contentType;
    try {
        const typeInt = await typeMsg.awaitMessageComponent({
            filter: i => i.user.id === userId,
            componentType: ComponentType.StringSelect,
            time: COLLECTOR_TIMEOUT
        });

        contentType = typeInt.values[0];
        const typeLabel = contentType === 'text_only' ? 'نص فقط' :
            contentType === 'image_only' ? 'صورة فقط' : 'نص + صورة';

        await typeInt.update({
            embeds: [styledEmbed({
                color: THEME.MAIN,
                description: `${IC.check} تم اختيار: **${typeLabel}**`
            })],
            components: []
        });
    } catch {
        return await typeMsg.edit({
            embeds: [styledEmbed({ color: THEME.ROSE, description: `${IC.cross} انتهى الوقت` })],
            components: []
        });
    }

    // ── المرحلة 2: Embed أو عادي ──
    const embedMenu = new StringSelectMenuBuilder()
        .setCustomId(`bc_embed_${userId}_${Date.now()}`)
        .setPlaceholder('اختر شكل الرسالة...')
        .addOptions([
            {
                label: 'Embed منسق',
                description: 'رسالة مُنسّقة بإطار وألوان',
                value: 'yes',
                emoji: '✨'
            },
            {
                label: 'رسالة عادية',
                description: 'نص عادي بدون تنسيق',
                value: 'no',
                emoji: '💬'
            }
        ]);

    const embedMsg = await channel.send({
        embeds: [styledEmbed({
            color: THEME.ACCENT,
            title: `${IC.gear} شكل الرسالة`,
            description:
                `${IC.dot} تبي الرسالة تكون Embed منسق؟\n` +
                `${IC.dot} ولا رسالة عادية؟`,
            footer: 'الخطوة 2 من 4'
        })],
        components: [new ActionRowBuilder().addComponents(embedMenu)]
    });

    let useEmbed;
    try {
        const embedInt = await embedMsg.awaitMessageComponent({
            filter: i => i.user.id === userId,
            componentType: ComponentType.StringSelect,
            time: COLLECTOR_TIMEOUT
        });

        useEmbed = embedInt.values[0] === 'yes';

        await embedInt.update({
            embeds: [styledEmbed({
                color: THEME.MAIN,
                description: `${IC.check} تم اختيار: **${useEmbed ? 'Embed منسق' : 'رسالة عادية'}**`
            })],
            components: []
        });
    } catch {
        return await embedMsg.edit({
            embeds: [styledEmbed({ color: THEME.ROSE, description: `${IC.cross} انتهى الوقت` })],
            components: []
        });
    }

    // ── المرحلة 3: جمع المحتوى ──
    let broadcastContent = {
        text: null,
        image: null,
        embed: null,
        type: contentType,
        isEmbed: useEmbed
    };

    if (contentType === 'text_only' || contentType === 'text_and_image') {
        if (useEmbed) {
            // عنوان الـ Embed
            const titleResp = await collectMessage(channel, userId,
                `${IC.dot} اكتب **عنوان** الرسالة:`
            );
            if (!titleResp) return;

            // وصف الـ Embed
            const descResp = await collectMessage(channel, userId,
                `${IC.dot} اكتب **محتوى** الرسالة:`
            );
            if (!descResp) return;

            const bEmbed = new EmbedBuilder()
                .setColor(THEME.ACCENT)
                .setTitle(titleResp.content)
                .setDescription(descResp.content)
                .setTimestamp();

            // صورة لو مطلوبة
            if (contentType === 'text_and_image') {
                const imgResp = await collectMessage(channel, userId,
                    `${IC.dot} أرسل **الصورة** — رابط أو ارفق ملف:`
                );
                if (!imgResp) return;

                const imgUrl = extractImage(imgResp);
                if (imgUrl) {
                    bEmbed.setImage(imgUrl);
                    broadcastContent.image = imgUrl;
                }
            }

            broadcastContent.embed = bEmbed.toJSON();

        } else {
            // رسالة عادية
            const textResp = await collectMessage(channel, userId,
                `${IC.dot} اكتب **نص الرسالة**:`
            );
            if (!textResp) return;
            broadcastContent.text = textResp.content;

            if (contentType === 'text_and_image') {
                const imgResp = await collectMessage(channel, userId,
                    `${IC.dot} أرسل **الصورة** — رابط أو ارفق ملف:`
                );
                if (!imgResp) return;

                const imgUrl = extractImage(imgResp);
                if (imgUrl) broadcastContent.image = imgUrl;
            }
        }
    } else if (contentType === 'image_only') {
        if (useEmbed) {
            const titleResp = await collectMessage(channel, userId,
                `${IC.dot} اكتب **عنوان** الـ Embed — أو اكتب "تخطي":`
            );
            if (!titleResp) return;

            const imgResp = await collectMessage(channel, userId,
                `${IC.dot} أرسل **الصورة** — رابط أو ارفق ملف:`
            );
            if (!imgResp) return;

            const imgUrl = extractImage(imgResp);
            const bEmbed = new EmbedBuilder()
                .setColor(THEME.ACCENT)
                .setTimestamp();

            if (titleResp.content.toLowerCase() !== 'تخطي') {
                bEmbed.setTitle(titleResp.content);
            }

            if (imgUrl) {
                bEmbed.setImage(imgUrl);
                broadcastContent.image = imgUrl;
            }

            broadcastContent.embed = bEmbed.toJSON();
        } else {
            const imgResp = await collectMessage(channel, userId,
                `${IC.dot} أرسل **الصورة** — رابط أو ارفق ملف:`
            );
            if (!imgResp) return;

            const imgUrl = extractImage(imgResp);
            if (imgUrl) broadcastContent.image = imgUrl;
        }
    }

    // ── المرحلة 4: التوقيت ──
    const schedMenu = new StringSelectMenuBuilder()
        .setCustomId(`bc_sched_${userId}_${Date.now()}`)
        .setPlaceholder('متى ترسل؟')
        .addOptions([
            {
                label: 'أرسل الحين',
                description: 'إرسال فوري للجميع',
                value: 'now',
                emoji: '⚡'
            },
            {
                label: 'جدول لوقت ثاني',
                description: 'حدد تاريخ ووقت مستقبلي',
                value: 'later',
                emoji: '🗓️'
            }
        ]);

    const schedMsg = await channel.send({
        embeds: [styledEmbed({
            color: THEME.SOFT,
            title: `${IC.clock} وقت الإرسال`,
            description:
                `${IC.dot} تبي ترسل الحين ولا تجدولها؟`,
            footer: 'الخطوة 3 من 4'
        })],
        components: [new ActionRowBuilder().addComponents(schedMenu)]
    });

    let sendNow;
    let scheduledTime = null;

    try {
        const schedInt = await schedMsg.awaitMessageComponent({
            filter: i => i.user.id === userId,
            componentType: ComponentType.StringSelect,
            time: COLLECTOR_TIMEOUT
        });

        sendNow = schedInt.values[0] === 'now';

        await schedInt.update({
            embeds: [styledEmbed({
                color: THEME.MAIN,
                description: `${IC.check} ${sendNow ? 'إرسال فوري' : 'جدولة'}`
            })],
            components: []
        });
    } catch {
        return await schedMsg.edit({
            embeds: [styledEmbed({ color: THEME.ROSE, description: `${IC.cross} انتهى الوقت` })],
            components: []
        });
    }

    // لو جدولة — نطلب الوقت
    if (!sendNow) {
        const timeResp = await collectMessage(channel, userId,
            `${IC.clock} اكتب الوقت بتوقيت الرياض:\n\n` +
            `\`\`\`\nالصيغة: YYYY-MM-DD HH:MM\nمثال:  2025-06-20 15:30\n\`\`\``
        );
        if (!timeResp) return;

        const match = timeResp.content.trim().match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
        if (!match) {
            return channel.send({
                embeds: [styledEmbed({
                    color: THEME.ROSE,
                    description: `${IC.cross} صيغة الوقت غلط — استخدم: \`YYYY-MM-DD HH:MM\``
                })]
            });
        }

        const [, yr, mo, dy, hr, mn] = match;
        const riyadhDate = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:00+03:00`);

        if (riyadhDate <= new Date()) {
            return channel.send({
                embeds: [styledEmbed({
                    color: THEME.ROSE,
                    description: `${IC.cross} الوقت هذا في الماضي — اختر وقت مستقبلي`
                })]
            });
        }

        scheduledTime = riyadhDate.toISOString();
        broadcastContent.scheduledTime = scheduledTime;
    }

    // لو تجربة — نسأل عن العدد
    let testCount = 0;
    if (isTest) {
        const countResp = await collectMessage(channel, userId,
            `${IC.spark} كم عضو تبي ترسل لهم كتجربة؟`
        );
        if (!countResp) return;

        testCount = parseInt(countResp.content);
        if (isNaN(testCount) || testCount < 1) {
            return channel.send({
                embeds: [styledEmbed({
                    color: THEME.ROSE,
                    description: `${IC.cross} اكتب رقم صحيح أكبر من 0`
                })]
            });
        }
    }

    // ── المرحلة 5: المعاينة والتأكيد ──
    await channel.send({
        embeds: [styledEmbed({
            color: THEME.WARM,
            title: `${IC.star} معاينة الرسالة`,
            description: `هكذا بتوصل الرسالة للأعضاء:`,
            footer: 'الخطوة 4 من 4 — تأكد من كل شي'
        })]
    });

    // عرض المحتوى كما سيظهر
    const preview = buildMessagePayload(broadcastContent);
    await channel.send(preview);

    // معلومات إضافية
    let infoLines = [];
    if (scheduledTime) infoLines.push(`${IC.clock}  الموعد: **${formatDate(scheduledTime)}**`);
    if (isTest) infoLines.push(`${IC.spark}  عدد التجربة: **${testCount}** عضو`);

    // أزرار التأكيد
    const ts = Date.now();
    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bc_yes_${ts}`)
            .setLabel(sendNow ? 'أرسل الحين' : 'أكد الجدولة')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`bc_redo_${ts}`)
            .setLabel('من البداية')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`bc_no_${ts}`)
            .setLabel('إلغاء')
            .setStyle(ButtonStyle.Danger)
    );

    const confirmMsg = await channel.send({
        embeds: [styledEmbed({
            color: THEME.WARM,
            description:
                `${IC.dot} تأكيد ${sendNow ? 'الإرسال' : 'الجدولة'}؟\n\n` +
                (infoLines.length > 0 ? infoLines.join('\n') + '\n\n' : '') +
                `\`اضغط الزر المناسب\``
        })],
        components: [confirmRow]
    });

    try {
        const btnInt = await confirmMsg.awaitMessageComponent({
            filter: i => i.user.id === userId,
            componentType: ComponentType.Button,
            time: COLLECTOR_TIMEOUT
        });

        if (btnInt.customId === `bc_yes_${ts}`) {
            await btnInt.update({
                embeds: [styledEmbed({
                    color: THEME.GLOW,
                    description: sendNow
                        ? `${IC.send} جاري الإرسال...`
                        : `${IC.clock} جاري الجدولة...`
                })],
                components: []
            });

            if (sendNow) {
                await sendBroadcast(message.guild, channel, broadcastContent, isTest ? testCount : 0);
            } else {
                // حفظ الجدولة
                const scheduleId = `s_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                const guildData = getGuildData(guildId);

                const entry = {
                    id: scheduleId,
                    content: broadcastContent,
                    scheduledTime: scheduledTime,
                    channelId: channel.id,
                    createdBy: userId,
                    createdAt: new Date().toISOString(),
                    isTest,
                    testCount
                };

                guildData.scheduledMessages.push(entry);
                updateGuildData(guildId, guildData);
                scheduleMessageTimer(message.guild, entry);

                await channel.send({
                    embeds: [styledEmbed({
                        color: THEME.SOFT,
                        title: `${IC.check} تم جدولة البرودكاست`,
                        description:
                            `${divider()}\n\n` +
                            `${IC.pin}  المعرف: \`${scheduleId}\`\n` +
                            `${IC.clock}  الموعد: **${formatDate(scheduledTime)}**\n` +
                            `${IC.user}  بواسطة: <@${userId}>\n\n` +
                            `${divider()}\n\n` +
                            `\`يمكنك إلغاءها من ${PREFIX}scheduled\``,
                        footer: `${message.guild.name}`
                    })]
                });
            }

        } else if (btnInt.customId === `bc_redo_${ts}`) {
            await btnInt.update({
                embeds: [styledEmbed({
                    color: THEME.FROST,
                    description: `${IC.dot} تم الإلغاء — استخدم الأمر مرة ثانية`
                })],
                components: []
            });
        } else {
            await btnInt.update({
                embeds: [styledEmbed({
                    color: THEME.ROSE,
                    description: `${IC.cross} تم إلغاء البرودكاست`
                })],
                components: []
            });
        }

    } catch {
        await confirmMsg.edit({
            embeds: [styledEmbed({ color: THEME.ROSE, description: `${IC.cross} انتهى الوقت` })],
            components: []
        });
    }
}

/**
 * استخراج رابط الصورة من رسالة
 */
function extractImage(msg) {
    if (msg.attachments.size > 0) {
        return msg.attachments.first().url;
    }
    const urlMatch = msg.content.match(/https?:\/\/\S+\.(png|jpg|jpeg|gif|webp)(\?\S*)?/i);
    if (urlMatch) return urlMatch[0];

    const generalUrl = msg.content.match(/https?:\/\/\S+/);
    if (generalUrl) return generalUrl[0];

    return null;
}

/**
 * بناء payload الرسالة للإرسال أو المعاينة
 */
function buildMessagePayload(content) {
    const payload = {};

    if (content.text) {
        payload.content = content.text;
    }

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

// ═══════════════════════════════════════
//  نظام الجدولة
// ═══════════════════════════════════════

function scheduleMessageTimer(guild, entry) {
    const delay = new Date(entry.scheduledTime).getTime() - Date.now();

    if (delay <= 0) {
        executeScheduledMessage(guild, entry);
        return;
    }

    const timer = setTimeout(() => {
        executeScheduledMessage(guild, entry);
    }, delay);

    activeSchedules.set(entry.id, timer);
}

async function executeScheduledMessage(guild, entry) {
    try {
        const channel = await guild.channels.fetch(entry.channelId);
        if (!channel) return;

        await channel.send({
            embeds: [styledEmbed({
                color: THEME.SOFT,
                title: `${IC.clock} تنفيذ جدولة`,
                description:
                    `${IC.pin}  المعرف: \`${entry.id}\`\n` +
                    `${IC.user}  بواسطة: <@${entry.createdBy}>`
            })]
        });

        await sendBroadcast(guild, channel, entry.content, entry.isTest ? entry.testCount : 0);

        // حذف الجدولة
        const guildData = getGuildData(guild.id);
        guildData.scheduledMessages = guildData.scheduledMessages.filter(s => s.id !== entry.id);
        updateGuildData(guild.id, guildData);
        activeSchedules.delete(entry.id);

    } catch (err) {
        console.error('[SCHEDULE] خطأ:', err.message);
    }
}

async function loadScheduledMessages() {
    const data = loadData();

    for (const [guildId, guildData] of Object.entries(data)) {
        if (!guildData.scheduledMessages?.length) continue;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        const now = Date.now();
        const valid = [];

        for (const sched of guildData.scheduledMessages) {
            if (new Date(sched.scheduledTime).getTime() > now) {
                valid.push(sched);
                scheduleMessageTimer(guild, sched);
            } else {
                executeScheduledMessage(guild, sched);
            }
        }

        guildData.scheduledMessages = valid;
        updateGuildData(guildId, guildData);
    }

    console.log('[SCHEDULE] تم تحميل الجدولات');
}

// ═══════════════════════════════════════
//  معالجة الأوامر
// ═══════════════════════════════════════

client.once('ready', async () => {
    console.log(`\n  ${IC.star} البوت شغال: ${client.user.tag}`);
    console.log(`  ${IC.dot} السيرفرات: ${client.guilds.cache.size}`);
    console.log(`  ${IC.dot} الأعضاء: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}\n`);

    client.user.setPresence({
        activities: [{ name: `${PREFIX}help`, type: ActivityType.Watching }],
        status: 'online'
    });

    await loadScheduledMessages();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    // ━━━━━━ HELP ━━━━━━
    if (command === 'help') {
        const helpEmbed = styledEmbed({
            color: THEME.ACCENT,
            title: `${IC.star} الأوامر المتاحة`,
            thumbnail: client.user.displayAvatarURL({ dynamic: true }),
            description:
                `مرحباً <@${message.author.id}> ${IC.wave}\n` +
                `هذي كل الأوامر اللي تقدر تستخدمها:\n\n` +

                `${divider()}\n` +
                `\` البرودكاست \`\n` +
                `${divider()}\n\n` +

                `**${PREFIX}broadcast**\n` +
                `${IC.corner} إنشاء وإرسال برودكاست جديد\n\n` +

                `**${PREFIX}broadcast test**\n` +
                `${IC.corner} تجربة الإرسال لعدد محدد\n\n` +

                `**${PREFIX}scheduled**\n` +
                `${IC.corner} عرض وإدارة الرسائل المجدولة\n\n` +

                `**${PREFIX}resend**\n` +
                `${IC.corner} إعادة إرسال آخر برودكاست\n\n` +

                `**${PREFIX}stats**\n` +
                `${IC.corner} إحصائيات الإرسال\n\n` +

                `${divider()}\n` +
                `\` الإدارة \`\n` +
                `${divider()}\n\n` +

                `**${PREFIX}admin**\n` +
                `${IC.corner} إعدادات البوت والأدمنز ${IC.crown}\n\n` +

                `**${PREFIX}owner**\n` +
                `${IC.corner} لوحة تحكم المالك ${IC.crown}\n\n` +

                `${divider()}`,
            footer: `البادئة: ${PREFIX} ${IC.dot} التوقيت: الرياض`
        });

        await message.reply({ embeds: [helpEmbed] });
    }

    // ━━━━━━ BROADCAST ━━━━━━
    else if (command === 'broadcast') {
        if (!isAdmin(message.author.id, message.guild.id)) {
            return message.reply({
                embeds: [styledEmbed({
                    color: THEME.ROSE,
                    description: `${IC.lock} ما عندك صلاحية — لازم تكون Admin أو Owner`
                })]
            });
        }

        const isTest = args[0]?.toLowerCase() === 'test';
        await startBroadcastFlow(message, isTest);
    }

    // ━━━━━━ SCHEDULED ━━━━━━
    else if (command === 'scheduled') {
        if (!isAdmin(message.author.id, message.guild.id)) {
            return message.reply({
                embeds: [styledEmbed({
                    color: THEME.ROSE,
                    description: `${IC.lock} ما عندك صلاحية`
                })]
            });
        }

        const guildData = getGuildData(message.guild.id);
        const schedules = guildData.scheduledMessages || [];

        if (schedules.length === 0) {
            return message.reply({
                embeds: [styledEmbed({
                    color: THEME.MAIN,
                    title: `${IC.clock} الرسائل المجدولة`,
                    description: `${IC.ring} ما في رسائل مجدولة حالياً`
                })]
            });
        }

        let schedList = `${divider()}\n\n`;

        const buttons = [];

        schedules.forEach((s, i) => {
            const typeLabel = s.content.type === 'text_only' ? 'نص' :
                s.content.type === 'image_only' ? 'صورة' : 'نص + صورة';

            schedList +=
                `**${IC.pin} جدولة #${i + 1}**\n` +
                `${IC.bar}  المعرف: \`${s.id}\`\n` +
                `${IC.bar}  الموعد: **${formatDate(s.scheduledTime)}**\n` +
                `${IC.bar}  النوع: **${typeLabel}**\n` +
                `${IC.bar}  بواسطة: <@${s.createdBy}>\n` +
                `${IC.corner}  تجربة: **${s.isTest ? 'نعم' : 'لا'}**\n\n`;

            if (buttons.length < 25) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`csched_${s.id}`)
                        .setLabel(`إلغاء #${i + 1}`)
                        .setStyle(ButtonStyle.Danger)
                );
            }
        });

        schedList += divider();

        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) {
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        const schedMsg = await message.reply({
            embeds: [styledEmbed({
                color: THEME.SOFT,
                title: `${IC.clock} الرسائل المجدولة — ${schedules.length}`,
                description: schedList
            })],
            components: rows
        });

        const collector = schedMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            componentType: ComponentType.Button,
            time: COLLECTOR_TIMEOUT
        });

        collector.on('collect', async (int) => {
            const schedId = int.customId.replace('csched_', '');

            if (activeSchedules.has(schedId)) {
                clearTimeout(activeSchedules.get(schedId));
                activeSchedules.delete(schedId);
            }

            const currentData = getGuildData(message.guild.id);
            currentData.scheduledMessages = currentData.scheduledMessages.filter(s => s.id !== schedId);
            updateGuildData(message.guild.id, currentData);

            await int.update({
                embeds: [styledEmbed({
                    color: THEME.GLOW,
                    title: `${IC.check} تم الإلغاء`,
                    description: `تم إلغاء الجدولة: \`${schedId}\``
                })],
                components: []
            });

            // سجل العملية
            await message.channel.send({
                embeds: [styledEmbed({
                    color: THEME.WARM,
                    description:
                        `${IC.pin} **إلغاء جدولة**\n\n` +
                        `${IC.dot} المعرف: \`${schedId}\`\n` +
                        `${IC.dot} بواسطة: <@${int.user.id}>\n` +
                        `${IC.dot} الوقت: ${formatDate(new Date())}`
                })]
            });
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'time') {
                try { await schedMsg.edit({ components: [] }); } catch { }
            }
        });
    }

    // ━━━━━━ RESEND ━━━━━━
    else if (command === 'resend') {
        if (!isAdmin(message.author.id, message.guild.id)) {
            return message.reply({
                embeds: [styledEmbed({
                    color: THEME.ROSE,
                    description: `${IC.lock} ما عندك صلاحية`
                })]
            });
        }

        const guildData = getGuildData(message.guild.id);

        if (!guildData.lastBroadcast) {
            return message.reply({
                embeds: [styledEmbed({
                    color: THEME.MAIN,
                    title: `${IC.send} إعادة إرسال`,
                    description: `${IC.ring} ما في برودكاست سابق لإعادة إرساله`
                })]
            });
        }

        const last = guildData.lastBroadcast;

        await channel.send({
            embeds: [styledEmbed({
                color: THEME.WARM,
                title: `${IC.star} معاينة آخر برودكاست`,
                description:
                    `${IC.clock} تم إرساله: **${formatDate(last.timestamp)}**\n\n` +
                    `${IC.check} وصل: **${last.stats.delivered}**\n` +
                    `${IC.cross} فشل: **${last.stats.failed}**\n` +
                    `${IC.lock} مقفل: **${last.stats.blocked}**`
            })]
        });

        // عرض المحتوى
        const preview = buildMessagePayload(last.content);
        await message.channel.send(preview);

        // تأكيد
        const ts = Date.now();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`rs_yes_${ts}`)
                .setLabel('أعد الإرسال')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`rs_no_${ts}`)
                .setLabel('إلغاء')
                .setStyle(ButtonStyle.Danger)
        );

        const confirmMsg = await message.channel.send({
            embeds: [styledEmbed({
                color: THEME.WARM,
                description: `${IC.dot} تأكيد إعادة الإرسال لكل الأعضاء؟`
            })],
            components: [row]
        });

        try {
            const int = await confirmMsg.awaitMessageComponent({
                filter: i => i.user.id === message.author.id,
                componentType: ComponentType.Button,
                time: COLLECTOR_TIMEOUT
            });

            if (int.customId === `rs_yes_${ts}`) {
                await int.update({
                    embeds: [styledEmbed({
                        color: THEME.GLOW,
                        description: `${IC.send} جاري إعادة الإرسال...`
                    })],
                    components: []
                });

                await sendBroadcast(message.guild, message.channel, last.content, 0);
            } else {
                await int.update({
                    embeds: [styledEmbed({
                        color: THEME.ROSE,
                        description: `${IC.cross} تم الإلغاء`
                    })],
                    components: []
                });
            }
        } catch {
            await confirmMsg.edit({
                embeds: [styledEmbed({ color: THEME.ROSE, description: `${IC.cross} انتهى الوقت` })],
                components: []
            });
        }
    }

    // ━━━━━━ STATS ━━━━━━
    else if (command === 'stats') {
        const guildData = getGuildData(message.guild.id);
        const s = guildData.stats;
        const total = s.totalDelivered + s.totalFailed + s.totalBlocked;
        const rate = total > 0 ? Math.round((s.totalDelivered / total) * 100) : 0;

        const statsEmbed = styledEmbed({
            color: THEME.FROST,
            title: `${IC.chart} إحصائيات السيرفر`,
            thumbnail: message.guild.iconURL({ dynamic: true }),
            description:
                `${divider()}\n\n` +

                `${IC.send}  البرودكاست المرسلة\n` +
                `\`\`\`${s.totalBroadcasts}\`\`\`\n` +

                `${IC.check}  رسائل وصلت بنجاح\n` +
                `\`\`\`${s.totalDelivered}\`\`\`\n` +

                `${IC.cross}  رسائل فشلت\n` +
                `\`\`\`${s.totalFailed}\`\`\`\n` +

                `${IC.lock}  أعضاء خاصهم مقفل\n` +
                `\`\`\`${s.totalBlocked}\`\`\`\n` +

                `${IC.chart}  نسبة الوصول\n` +
                `${progressBar(rate)}\n\n` +

                `${IC.user}  أعضاء السيرفر: **${message.guild.memberCount}**\n` +
                `${IC.clock}  مجدولة: **${(guildData.scheduledMessages || []).length}**\n\n` +

                `${divider()}\n\n` +

                `${IC.pin}  آخر برودكاست:\n` +
                `${guildData.lastBroadcast
                    ? `\`${formatDate(guildData.lastBroadcast.timestamp)}\``
                    : `\`لم يتم الإرسال بعد\``
                }`,

            footer: `${message.guild.name}`
        });

        await message.reply({ embeds: [statsEmbed] });
    }

    // ━━━━━━ ADMIN ━━━━━━
    else if (command === 'admin') {
        if (!isOwner(message.author.id)) {
            return message.reply({
                embeds: [styledEmbed({
                    color: THEME.ROSE,
                    description: `${IC.crown} هذا الأمر خاص بالمالك فقط`
                })]
            });
        }

        const adminMenu = new StringSelectMenuBuilder()
            .setCustomId(`adm_menu_${Date.now()}`)
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

        const adminMsg = await message.reply({
            embeds: [styledEmbed({
                color: THEME.GOLD,
                title: `${IC.gear} لوحة الإعدادات`,
                description:
                    `مرحباً ${IC.crown} <@${message.author.id}>\n\n` +
                    `${IC.dot} اختر الإعداد اللي تبي تعدله من القائمة`,
                footer: 'الإعدادات تطبق على البوت بالكامل'
            })],
            components: [new ActionRowBuilder().addComponents(adminMenu)]
        });

        try {
            const admInt = await adminMsg.awaitMessageComponent({
                filter: i => i.user.id === message.author.id,
                componentType: ComponentType.StringSelect,
                time: COLLECTOR_TIMEOUT
            });

            const choice = admInt.values[0];

            // ── تغيير الاسم ──
            if (choice === 'name') {
                await admInt.update({
                    embeds: [styledEmbed({
                        color: THEME.GOLD,
                        description: `${IC.dot} جاري التحضير...`
                    })],
                    components: []
                });

                const resp = await collectMessage(message.channel, message.author.id,
                    `${IC.dot} اكتب الاسم الجديد للبوت:`
                );
                if (!resp) return;

                try {
                    await client.user.setUsername(resp.content);

                    await message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.GLOW,
                            description:
                                `${IC.check} تم تغيير الاسم إلى: **${resp.content}**\n\n` +
                                `\`${IC.user} ${message.author.tag} ${IC.dot} ${formatDate(new Date())}\``
                        })]
                    });
                } catch (err) {
                    await message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.ROSE,
                            description: `${IC.cross} فشل التغيير: ${err.message}\n\n\`تغيير الاسم محدود بمرتين كل ساعة\``
                        })]
                    });
                }
            }

            // ── تغيير الصورة ──
            else if (choice === 'avatar') {
                await admInt.update({
                    embeds: [styledEmbed({
                        color: THEME.GOLD,
                        description: `${IC.dot} جاري التحضير...`
                    })],
                    components: []
                });

                const resp = await collectMessage(message.channel, message.author.id,
                    `${IC.dot} أرسل الصورة الجديدة — رابط أو ارفق ملف:`
                );
                if (!resp) return;

                const url = extractImage(resp);
                if (!url) {
                    return message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.ROSE,
                            description: `${IC.cross} ما لقيت صورة صالحة`
                        })]
                    });
                }

                try {
                    await client.user.setAvatar(url);
                    await message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.GLOW,
                            description:
                                `${IC.check} تم تغيير صورة البوت\n\n` +
                                `\`${IC.user} ${message.author.tag} ${IC.dot} ${formatDate(new Date())}\``,
                            thumbnail: url
                        })]
                    });
                } catch (err) {
                    await message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.ROSE,
                            description: `${IC.cross} فشل التغيير: ${err.message}`
                        })]
                    });
                }
            }

            // ── تغيير البايو ──
            else if (choice === 'bio') {
                await admInt.update({
                    embeds: [styledEmbed({
                        color: THEME.GOLD,
                        description: `${IC.dot} جاري التحضير...`
                    })],
                    components: []
                });

                const resp = await collectMessage(message.channel, message.author.id,
                    `${IC.dot} اكتب البايو الجديد:`
                );
                if (!resp) return;

                try {
                    await client.rest.patch('/users/@me', {
                        body: { bio: resp.content }
                    });

                    await message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.GLOW,
                            description:
                                `${IC.check} تم تحديث البايو:\n\n` +
                                `> ${resp.content}\n\n` +
                                `\`${IC.user} ${message.author.tag} ${IC.dot} ${formatDate(new Date())}\``
                        })]
                    });
                } catch (err) {
                    await message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.ROSE,
                            description: `${IC.cross} فشل التحديث: ${err.message}`
                        })]
                    });
                }
            }

            // ── تغيير الستاتس ──
            else if (choice === 'status') {
                await admInt.update({
                    embeds: [styledEmbed({
                        color: THEME.GOLD,
                        description: `${IC.dot} جاري التحضير...`
                    })],
                    components: []
                });

                // نوع الأكتيفيتي
                const actMenu = new StringSelectMenuBuilder()
                    .setCustomId(`act_type_${Date.now()}`)
                    .setPlaceholder('نوع الأكتيفيتي...')
                    .addOptions([
                        { label: 'Playing', value: 'playing', emoji: '🎮' },
                        { label: 'Watching', value: 'watching', emoji: '👁️' },
                        { label: 'Listening', value: 'listening', emoji: '🎧' },
                        { label: 'Competing', value: 'competing', emoji: '🏅' },
                        { label: 'Custom', value: 'custom', emoji: '💫' }
                    ]);

                const actMsg = await message.channel.send({
                    embeds: [styledEmbed({
                        color: THEME.GOLD,
                        description: `${IC.dot} اختر نوع الأكتيفيتي:`
                    })],
                    components: [new ActionRowBuilder().addComponents(actMenu)]
                });

                try {
                    const actInt = await actMsg.awaitMessageComponent({
                        filter: i => i.user.id === message.author.id,
                        componentType: ComponentType.StringSelect,
                        time: COLLECTOR_TIMEOUT
                    });

                    const actType = actInt.values[0];

                    await actInt.update({
                        embeds: [styledEmbed({
                            color: THEME.MAIN,
                            description: `${IC.check} النوع: **${actType}**`
                        })],
                        components: []
                    });

                    // النص
                    const textResp = await collectMessage(message.channel, message.author.id,
                        `${IC.dot} اكتب نص الأكتيفيتي:`
                    );
                    if (!textResp) return;

                    // الحالة
                    const stMenu = new StringSelectMenuBuilder()
                        .setCustomId(`st_type_${Date.now()}`)
                        .setPlaceholder('الحالة...')
                        .addOptions([
                            { label: 'Online', value: 'online', emoji: '🟢' },
                            { label: 'DND', value: 'dnd', emoji: '🔴' },
                            { label: 'Idle', value: 'idle', emoji: '🟡' },
                            { label: 'Invisible', value: 'invisible', emoji: '⚫' }
                        ]);

                    const stMsg = await message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.GOLD,
                            description: `${IC.dot} اختر الحالة:`
                        })],
                        components: [new ActionRowBuilder().addComponents(stMenu)]
                    });

                    const stInt = await stMsg.awaitMessageComponent({
                        filter: i => i.user.id === message.author.id,
                        componentType: ComponentType.StringSelect,
                        time: COLLECTOR_TIMEOUT
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
                        activities: [{ name: textResp.content, type: typeMap[actType] }],
                        status: statusType
                    });

                    await stInt.update({
                        embeds: [styledEmbed({
                            color: THEME.GLOW,
                            description:
                                `${IC.check} تم تحديث الستاتس\n\n` +
                                `${IC.dot} النوع: **${actType}**\n` +
                                `${IC.dot} النص: **${textResp.content}**\n` +
                                `${IC.dot} الحالة: **${statusType}**\n\n` +
                                `\`${IC.user} ${message.author.tag} ${IC.dot} ${formatDate(new Date())}\``
                        })],
                        components: []
                    });

                } catch {
                    try { await actMsg.edit({ components: [] }); } catch { }
                }
            }

            // ── إضافة Admin ──
            else if (choice === 'add') {
                await admInt.update({
                    embeds: [styledEmbed({
                        color: THEME.GOLD,
                        description: `${IC.dot} جاري التحضير...`
                    })],
                    components: []
                });

                const resp = await collectMessage(message.channel, message.author.id,
                    `${IC.dot} اكتب آيدي المستخدم أو سوله منشن:`
                );
                if (!resp) return;

                let targetId = resp.content.replace(/[<@!>]/g, '').trim();

                if (!/^\d{17,19}$/.test(targetId)) {
                    return message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.ROSE,
                            description: `${IC.cross} آيدي غير صالح`
                        })]
                    });
                }

                try {
                    const user = await client.users.fetch(targetId);
                    if (user.bot) {
                        return message.channel.send({
                            embeds: [styledEmbed({
                                color: THEME.ROSE,
                                description: `${IC.cross} ما ينفع تضيف بوت كأدمن`
                            })]
                        });
                    }
                } catch {
                    return message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.ROSE,
                            description: `${IC.cross} ما لقيت هالمستخدم`
                        })]
                    });
                }

                const guildData = getGuildData(message.guild.id);

                if (guildData.admins.includes(targetId)) {
                    return message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.WARM,
                            description: `${IC.dot} هالمستخدم أدمن بالفعل`
                        })]
                    });
                }

                guildData.admins.push(targetId);
                updateGuildData(message.guild.id, guildData);

                await message.channel.send({
                    embeds: [styledEmbed({
                        color: THEME.GLOW,
                        description:
                            `${IC.check} تم إضافة <@${targetId}> كأدمن\n\n` +
                            `\`${IC.user} ${message.author.tag} ${IC.dot} ${formatDate(new Date())}\``
                    })]
                });
            }

            // ── حذف Admin ──
            else if (choice === 'remove') {
                const guildData = getGuildData(message.guild.id);

                if (guildData.admins.length === 0) {
                    return admInt.update({
                        embeds: [styledEmbed({
                            color: THEME.MAIN,
                            description: `${IC.ring} ما في أدمنز حالياً`
                        })],
                        components: []
                    });
                }

                await admInt.update({
                    embeds: [styledEmbed({
                        color: THEME.GOLD,
                        description: `${IC.dot} جاري التحضير...`
                    })],
                    components: []
                });

                const resp = await collectMessage(message.channel, message.author.id,
                    `${IC.dot} اكتب آيدي الأدمن اللي تبي تحذفه أو سوله منشن:`
                );
                if (!resp) return;

                let removeId = resp.content.replace(/[<@!>]/g, '').trim();

                if (!guildData.admins.includes(removeId)) {
                    return message.channel.send({
                        embeds: [styledEmbed({
                            color: THEME.ROSE,
                            description: `${IC.cross} هالمستخدم مو أدمن`
                        })]
                    });
                }

                guildData.admins = guildData.admins.filter(id => id !== removeId);
                updateGuildData(message.guild.id, guildData);

                await message.channel.send({
                    embeds: [styledEmbed({
                        color: THEME.GLOW,
                        description:
                            `${IC.check} تم حذف <@${removeId}> من الأدمنز\n\n` +
                            `\`${IC.user} ${message.author.tag} ${IC.dot} ${formatDate(new Date())}\``
                    })]
                });
            }

            // ── قائمة الأدمنز ──
            else if (choice === 'list') {
                const guildData = getGuildData(message.guild.id);
                const admins = guildData.admins;

                let list = '';
                if (admins.length === 0) {
                    list = `${IC.ring} ما في أدمنز مضافين`;
                } else {
                    admins.forEach((id, i) => {
                        list += `${IC.dot} **${i + 1}.** <@${id}> \`${id}\`\n`;
                    });
                }

                await admInt.update({
                    embeds: [styledEmbed({
                        color: THEME.GOLD,
                        title: `${IC.shield} قائمة الأدمنز`,
                        description:
                            `${divider()}\n\n` +
                            `${IC.crown} **المالك:**\n` +
                            `${IC.corner} <@${OWNER_ID}> \`${OWNER_ID}\`\n\n` +
                            `${IC.shield} **الأدمنز (${admins.length}):**\n` +
                            `${list}\n\n` +
                            `${divider()}`,
                        footer: message.guild.name
                    })],
                    components: []
                });
            }

        } catch {
            try {
                await adminMsg.edit({
                    embeds: [styledEmbed({ color: THEME.ROSE, description: `${IC.cross} انتهى الوقت` })],
                    components: []
                });
            } catch { }
        }
    }

    // ━━━━━━ OWNER ━━━━━━
    else if (command === 'owner') {
        if (!isOwner(message.author.id)) {
            return message.reply({
                embeds: [styledEmbed({
                    color: THEME.ROSE,
                    description: `${IC.crown} هذا الأمر خاص بالمالك فقط`
                })]
            });
        }

        const guilds = client.guilds.cache;
        const data = loadData();

        let totalBroadcasts = 0;
        let totalMembers = 0;
        let guildsList = '';

        guilds.forEach(guild => {
            const gd = data[guild.id];
            const bc = gd?.stats?.totalBroadcasts || 0;
            totalBroadcasts += bc;
            totalMembers += guild.memberCount;

            guildsList +=
                `**${IC.dot} ${guild.name}**\n` +
                `${IC.bar}  الأعضاء: **${guild.memberCount}**\n` +
                `${IC.bar}  البرودكاست: **${bc}**\n` +
                `${IC.corner}  الأدمنز: **${gd?.admins?.length || 0}**\n\n`;
        });

        if (!guildsList) guildsList = `${IC.ring} ما في سيرفرات`;

        const ownerEmbed = styledEmbed({
            color: THEME.GOLD,
            title: `${IC.crown} لوحة تحكم المالك`,
            thumbnail: client.user.displayAvatarURL({ dynamic: true }),
            description:
                `${divider()}\n` +
                `\` الإحصائيات العامة \`\n` +
                `${divider()}\n\n` +

                `${IC.pulse}  السيرفرات: **${guilds.size}**\n` +
                `${IC.user}  الأعضاء: **${totalMembers}**\n` +
                `${IC.send}  البرودكاست: **${totalBroadcasts}**\n` +
                `${IC.star}  البينق: **${client.ws.ping}ms**\n` +
                `${IC.clock}  التشغيل: **${formatUptime(client.uptime)}**\n\n` +

                `${divider()}\n` +
                `\` السيرفرات \`\n` +
                `${divider()}\n\n` +

                guildsList +

                divider(),

            footer: `${message.author.tag} ${IC.dot} ${formatDate(new Date())}`
        });

        await message.reply({ embeds: [ownerEmbed] });
    }
});

// ═══════════════════════════════════════
//  معالجة الأخطاء
// ═══════════════════════════════════════

process.on('unhandledRejection', (err) => {
    console.error('[ERROR] Unhandled:', err.message || err);
});

process.on('uncaughtException', (err) => {
    console.error('[ERROR] Uncaught:', err.message || err);
});

client.on('error', (err) => {
    console.error('[CLIENT] Error:', err.message);
});

client.on('shardReconnecting', () => console.log('[SHARD] Reconnecting...'));
client.on('shardResume', () => console.log('[SHARD] Resumed'));

// ═══════════════════════════════════════
//  تشغيل البوت
// ═══════════════════════════════════════

client.login(TOKEN).catch(err => {
    console.error('[LOGIN] Failed:', err.message);
    process.exit(1);
});

// ═══════════════════════════════════════════════════════
//  متغيرات البيئة المطلوبة في Railway:
//
//  TOKEN     ← توكن البوت من Discord Developer Portal
//  OWNER_ID  ← الآيدي الخاص فيك من ديسكورد
//  CLIENT_ID ← آيدي البوت من Discord Developer Portal
// ═══════════════════════════════════════════════════════
