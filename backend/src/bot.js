// bot.js — Telegram бот @body_remembers_bot
// Grammy + node-cron для ежедневных напоминаний

require('dotenv').config()
const { Bot, InlineKeyboard } = require('grammy')
const cron = require('node-cron')
const db = require('./db')
const { admissionError, requestAdmission, drainAdmissionNotifications } = require('./services/admission')

const bot = new Bot(process.env.BOT_TOKEN)
require('./services/access-bot').registerAccessBot(bot)
require('./services/access-demo').registerAccessDemo(bot)

// ─── Константы ────────────────────────────────────────────────────────────

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://tg-app-telo-pomnit.vercel.app/?v=startup-20261005'
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',').map(id => parseInt(id.trim())).filter(Boolean)

async function appUrlFor(id) {
  const user = await db.user.findUnique({where:{telegramId:BigInt(id)}})
  return user?.preferredAppUrl || MINI_APP_URL
}
async function updateAppMenu(ctx) {
  if (ctx.chat?.type !== 'private') return
  try {
    await ctx.api.setChatMenuButton({
      chat_id: ctx.chat.id,
      menu_button: { type: 'web_app', text: 'Открыть приложение', web_app: { url: await appUrlFor(ctx.from.id) } }
    })
  } catch (err) {
    console.error('[menu] Update failed:', err.description || err.message)
  }
}

// ─── /start ───────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;
  const tgUser = ctx.from
  if (!tgUser) return
  await updateAppMenu(ctx)

  try {
    // Deleted tombstones must not be repopulated from a new /start event.
    const existingUser = await db.user.findUnique({ where: { telegramId: BigInt(tgUser.id) } })
    if (existingUser?.deletedAt) return ctx.reply('Этот аккаунт удалён.')
    // Создаём или находим пользователя
    let user = await db.user.upsert({
      where: { telegramId: BigInt(tgUser.id) },
      create: {
        telegramId: BigInt(tgUser.id),
        firstName:  tgUser.first_name,
        lastName:   tgUser.last_name || null,
        username:   tgUser.username || null,
        role: ADMIN_IDS.includes(tgUser.id) ? 'HOST' : 'PARTICIPANT',
      },
      update: {},
    })
    if (existingUser) {
      user = await db.$transaction(async tx => {
        await tx.$queryRawUnsafe('SELECT id FROM users WHERE id = $1 FOR UPDATE', existingUser.id)
        const active = await tx.user.findUnique({ where: { id: existingUser.id } })
        if (!active || active.deletedAt) return active
        return tx.user.update({ where: { id: active.id }, data: { firstName: tgUser.first_name, username: tgUser.username || null } })
      })
    }

    if (!user || user.deletedAt) return ctx.reply('Этот аккаунт удалён.')
    await requestAdmission(user)
    const denied = admissionError(user)
    if (denied) {
      const keyboard = new InlineKeyboard().webApp('Проверить доступ', await appUrlFor(ctx.from.id))
      return ctx.reply(denied.error + '\n\n«Тело помнит» — закрытое приложение для одобренного круга участниц.', { reply_markup: keyboard })
    }
    // Проверяем ожидающую запись об оплате
    if (tgUser.username) {
      const pending = await db.pendingEnrollment.findFirst({
        where: { telegramUsername: { equals: tgUser.username, mode: 'insensitive' } }
      })

      if (pending) {
        const stream = pending.streamId ? await db.stream.findUnique({ where: { id: pending.streamId } }) : await db.stream.findFirst({
          where: { isActive: true },
          orderBy: { startDate: 'desc' }
        })

        if (stream) {
          const existing = await db.enrollment.findFirst({
            where: { userId: user.id, streamId: stream.id }
          })

          if (!existing || existing.status !== 'active') {
            if (existing) {
              await db.enrollment.update({
                where: { id: existing.id },
                data: { status: 'active', paymentId: pending.paymentId, paidAt: new Date() }
              })
            } else {
              await db.enrollment.create({
                data: {
                  userId: user.id,
                  streamId: stream.id,
                  status: 'active',
                  paymentId: pending.paymentId,
                  paidAt: new Date()
                }
              })
            }
          }

          // Удаляем ожидающую запись
          await db.pendingEnrollment.delete({ where: { id: pending.id } })

          const keyboard = new InlineKeyboard().webApp('Открыть приложение', await appUrlFor(ctx.from.id))
          return ctx.reply(
            `Добро пожаловать в поток «${stream.name}» 🌿\n\n` +
            `Ваша оплата подтверждена. Для входа в приложение нужен отдельный допуск Альмиры. Нажмите кнопку ниже, чтобы войти или отправить заявку:`,
            { reply_markup: keyboard }
          )
        }
      }
    }

    const name = tgUser.first_name
    const keyboard = new InlineKeyboard().webApp('Открыть приложение', await appUrlFor(ctx.from.id))

    await ctx.reply(
      `Привет, ${name}.\n\n` +
      `Это бот программы «Тело помнит» — интегративной группы для работы с телесными реакциями.\n\n` +
      `Приложение открыто для участниц, которым Альмира разрешила вход. Если допуска ещё нет, через кнопку ниже можно отправить заявку. Покупка программы оформляется отдельно.\n\n` +
      `Нажмите «Открыть приложение», чтобы войти или отправить заявку:`,
      { reply_markup: keyboard }
    )
  } catch (err) {
    console.error('[/start] Ошибка:', err)
    await ctx.reply('Что-то пошло не так. Попробуйте ещё раз через минуту.')
  }
})

// ─── /help ────────────────────────────────────────────────────────────────

bot.command('help', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('Открыть приложение', await appUrlFor(ctx.from.id))

  await ctx.reply(
    `Что умеет этот бот:\n\n` +
    `• Присылает напоминание о записи в дневнике\n` +
    `• Открывает приложение или заявку на допуск\n` +
    `• Сообщает о датах встреч\n\n` +
    `По всем вопросам — @almira_sultanova`,
    { reply_markup: keyboard }
  )
})

// ─── /app — открыть мини-апп ──────────────────────────────────────────────

bot.command('app', async (ctx) => {
  await updateAppMenu(ctx)
  const keyboard = new InlineKeyboard().webApp('Открыть дневник', await appUrlFor(ctx.from.id))
  await ctx.reply('Ваш дневник наблюдений:', { reply_markup: keyboard })
})

// ─── /reserve — проверить резервное мини-приложение (только ведущие) ─────

const RESERVE_APP_URL = 'https://tg-app-telo-pomnit.vercel.app/'

bot.command('reserve', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from?.id)) {
    return ctx.reply('Эта команда доступна только ведущим.')
  }
  const keyboard = new InlineKeyboard().webApp('Открыть резервное приложение', RESERVE_APP_URL)
  await ctx.reply('Резервное приложение для проверки:', { reply_markup: keyboard })
})

// ─── /admin — открыть админ-панель (только ведущие) ─────────────────────

const ADMIN_PANEL_URL = 'https://app.telo-pomnit.ru/access-admin.html'

bot.command('admin', async (ctx) => {
  try { await require('./services/access-management').actorByTelegram(ctx.from.id) }
  catch { return ctx.reply('Эта команда доступна только администраторам.') }
  const keyboard = new InlineKeyboard().webApp('Открыть панель управления', ADMIN_PANEL_URL)
  await ctx.reply(
    'Админ-панель «Тело помнит»\n\nЗаявки, люди, потоки, история решений и показатели. Авторизация — автоматически по вашему Telegram-аккаунту.',
    { reply_markup: keyboard }
  )
})

// ─── /activate — зачислить участницу (только ведущие) ───────────────────

bot.command('activate', async ctx => {
  try { await require('./services/access-management').actorByTelegram(ctx.from.id) }
  catch { return ctx.reply('Эта команда доступна только администраторам.') }
  await ctx.reply('Управление доступом теперь выполняется с выбором потока и подтверждением: /access @username или /access Telegram_ID. Бесплатный допуск и оплата учитываются отдельно.')
})

// ─── /deactivate — отозвать доступ (только ведущие) ──────────────────────

bot.command('deactivate', async ctx => {
  try { await require('./services/access-management').actorByTelegram(ctx.from.id) }
  catch { return ctx.reply('Эта команда доступна только администраторам.') }
  await ctx.reply('Управление доступом теперь выполняется с выбором потока и подтверждением: /access @username или /access Telegram_ID. Бесплатный допуск и оплата учитываются отдельно.')
})

// ─── /participants — список участниц потока (только ведущие) ─────────────

bot.command('participants', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from?.id)) {
    return ctx.reply('Эта команда доступна только ведущим.')
  }

  try {
    const stream = await db.stream.findFirst({
      where: { isActive: true },
      orderBy: { startDate: 'desc' },
    })
    if (!stream) return ctx.reply('Нет активного потока.')

    const enrollments = await db.enrollment.findMany({
      where: { streamId: stream.id },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })

    if (!enrollments.length) {
      return ctx.reply(`Поток «${stream.name}»: участниц пока нет.`)
    }

    const statusEmoji = { active: '✅', pending: '⏳', completed: '🏁', cancelled: '❌' }
    const lines = enrollments.map((e, i) => {
      const name = e.user.firstName || e.user.name || 'Без имени'
      const username = e.user.username ? `@${e.user.username}` : e.user.telegramUsername ? `@${e.user.telegramUsername}` : ''
      return `${i + 1}. ${statusEmoji[e.status] || '?'} ${name} ${username}`
    })

    await ctx.reply(
      `Поток «${stream.name}»\n` +
      `Участниц: ${enrollments.length}\n\n` +
      lines.join('\n')
    )
  } catch (err) {
    console.error('[/participants] Ошибка:', err)
    await ctx.reply('Не удалось загрузить список. Попробуйте ещё раз.')
  }
})

// ─── Ежедневное напоминание ───────────────────────────────────────────────

async function sendDailyReminder() {
  const enrollments = await db.enrollment.findMany({
    where: {
      status: 'active',
      user: { notificationsEnabled: true, accessStatus: 'approved', deletedAt: null },
    },
    include: { user: true },
    take: 500,
  })

  const keyboard = new InlineKeyboard().webApp('Сделать запись', MINI_APP_URL)

  const messages = [
    'Как тело чувствует себя сегодня?\n\nОдна минута внимания — и запись в дневнике.',
    'Время для короткой практики.\n\nЗамечаете что-то в теле прямо сейчас?',
    'Ежедневная минута с собой.\n\nЧто происходит в теле в этот момент?',
    'Маленький шаг каждый день — это и есть практика.\n\nОткройте дневник и сделайте запись.',
    'Тело говорит постоянно. Сегодня — день его послушать.',
  ]

  let sent = 0
  for (const enrollment of enrollments) {
    try {
      const text = messages[Math.floor(Math.random() * messages.length)]
      await bot.api.sendMessage(Number(enrollment.user.telegramId), text, {
        reply_markup: keyboard,
      })
      sent++
      if (sent % 20 === 0) await new Promise(r => setTimeout(r, 1000))
    } catch {
      // Пользователь мог заблокировать бота — пропускаем
    }
  }

  console.log(`[cron] Напоминания отправлены: ${sent} из ${enrollments.length}`)
}

// ─── Напоминание перед встречей ──────────────────────────────────────────

async function sendMeetingReminder() {
  const now = new Date()
  const from = new Date(now.getTime() + 55 * 60 * 1000)
  const to   = new Date(now.getTime() + 65 * 60 * 1000)

  const meetings = await db.meeting.findMany({
    where: { date: { gte: from, lte: to } },
    include: { stream: true }
  })

  for (const meeting of meetings) {
    const enrollments = await db.enrollment.findMany({
      where: { streamId: meeting.streamId, status: 'active', user: { accessStatus: 'approved', deletedAt: null } },
      include: { user: true }
    })

    const zoomLink = meeting.zoomLink || meeting.stream.zoomLink
    const topicLine = meeting.topic ? `📌 ${meeting.topic}` : ''
    const zoomLine  = zoomLink ? `\n🔗 Zoom: ${zoomLink}` : ''

    const keyboard = new InlineKeyboard().webApp('Открыть приложение', MINI_APP_URL)
    let sent = 0

    // ОТКЛЮЧЕНО: уведомления о занятиях временно не отправляются
    // for (const enrollment of enrollments) {
    //   try {
    //     await bot.api.sendMessage(
    //       Number(enrollment.user.telegramId),
    //       `Встреча ${meeting.number} начинается через час\n\n` +
    //       `${topicLine}${zoomLine}\n\n` +
    //       `Приложение для подготовки — ниже.`,
    //       { reply_markup: keyboard }
    //     )
    //     sent++
    //     if (sent % 20 === 0) await new Promise(r => setTimeout(r, 1000))
    //   } catch { /* пользователь заблокировал бота */ }
    // }

    // if (sent > 0) {
    //   console.log(`[cron] Напоминание о встрече ${meeting.number}: отправлено ${sent}`)
    // }
  }
}

// ─── Cron: 20:00 МСК (17:00 UTC) каждый день ──────────────────────────────

cron.schedule('0 17 * * *', sendDailyReminder, { timezone: 'UTC' })

// ─── Cron: каждый час — проверка встреч ────────────────────────────────────

cron.schedule('0 * * * *', sendMeetingReminder, { timezone: 'UTC' })

// ─── Напоминание заполнить анкету ─────────────────────────────────────────

async function sendQuestionnairReminder(dayNumber) {
  const messages = {
    1: `📋 Добро пожаловать в программу «Тело помнит»!\n\nПожалуйста, заполните короткую анкету участницы — займёт около 5 минут. Это поможет нам лучше вас узнать и сделать программу точнее.\n\nОткройте приложение → вкладка «Мой поток» → нажмите на баннер анкеты.`,
    3: `📋 Напоминание об анкете\n\nЕсли ещё не заполнили анкету участницы — самое время. Это займёт 5 минут и поможет нам подготовить программу именно для вашей группы.\n\nОткройте приложение → вкладка «Мой поток».`,
    5: `📋 Последнее напоминание\n\nАнкета участницы ждёт вас в приложении. После этого напоминания больше не будем беспокоить — но анкету всегда можно заполнить в разделе «Мой поток».`
  }

  const text = messages[dayNumber]
  if (!text) return

  // Находим всех активных участниц, у кого нет заполненной анкеты
  const enrollments = await db.enrollment.findMany({
    where: { status: 'active', user: { accessStatus: 'approved', deletedAt: null } },
    include: {
      user: true,
      stream: true
    }
  })

  let sent = 0
  for (const en of enrollments) {
    const user = en.user
    if (!user || user.deletedAt) continue

    // Проверяем, что участница зачислена именно N дней назад
    const daysSinceEnroll = Math.floor(
      (Date.now() - new Date(en.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceEnroll !== dayNumber) continue

    // Проверяем, не заполнена ли уже анкета
    const existing = await db.questionnaire.findFirst({
      where: { userId: user.id, streamId: en.streamId, type: 'pre' }
    })
    if (existing) continue

    try {
      await bot.api.sendMessage(Number(user.telegramId), text)
      sent++
    } catch (e) {
      console.warn(`[cron] Не удалось отправить напоминание об анкете ${user.telegramId}:`, e.message)
    }
  }

  if (sent > 0) console.log(`[cron] Напоминание об анкете (день ${dayNumber}): отправлено ${sent}`)
}

// Cron: каждый день в 10:00 МСК (07:00 UTC) — проверяем дни 1, 3, 5
cron.schedule('0 7 * * *', async () => {
  await sendQuestionnairReminder(1)
  await sendQuestionnairReminder(3)
  await sendQuestionnairReminder(5)
}, { timezone: 'UTC' })

// Cron: каждую ночь в 03:00 МСК (00:00 UTC) — чистим незавершённые оплаты старше 60 дней
cron.schedule('0 0 * * *', async () => {
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    const { count } = await db.pendingEnrollment.deleteMany({
      where: { createdAt: { lt: cutoff } }
    })
    if (count > 0) console.log(`[cron] Удалено устаревших pending_enrollments: ${count}`)
  } catch (e) {
    console.error('[cron] Ошибка чистки pending_enrollments:', e.message)
  }
}, { timezone: 'UTC' })

// Legacy deletion requests: cleanup remains as a fallback for requests predating
// immediate transactional purge. No backup/provider deletion promise; User and
// financial Enrollment/PaymentOrder are not deleted by this job.
cron.schedule('15 0 * * *', async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const users = await db.user.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true }
    })
    if (users.length === 0) return
    const userIds = users.map(u => u.id)

    const [diary, triggers, checkins, diagnostic, questionnaires, feedback, aiChats] =
      await Promise.all([
        db.diaryEntry.deleteMany({ where: { userId: { in: userIds } } }),
        db.triggerEntry.deleteMany({ where: { userId: { in: userIds } } }),
        db.checkin.deleteMany({ where: { userId: { in: userIds } } }),
        db.diagnosticResult.deleteMany({ where: { userId: { in: userIds } } }),
        db.questionnaire.deleteMany({ where: { userId: { in: userIds } } }),
        db.feedback.deleteMany({ where: { userId: { in: userIds } } }),
        db.aiChatSession.deleteMany({ where: { userId: { in: userIds } } })
      ])

    const total = diary.count + triggers.count + checkins.count + diagnostic.count +
      questionnaires.count + feedback.count + aiChats.count
    console.log(`[cron] GDPR hard-delete: ${users.length} аккаунтов, ${total} записей стёрто`)
  } catch (e) {
    console.error('[cron] Ошибка GDPR hard-delete:', e.message)
  }
}, { timezone: 'UTC' })

// ─── Регистрация публичных команд в Telegram ──────────────────────────────

bot.api.setMyCommands([
  { command: 'start', description: 'Открыть приложение' },
  { command: 'app',   description: 'Открыть дневник' },
  { command: 'help',  description: 'Помощь' },
]).catch(() => {})

// ─── Уведомления админам о новых отзывах ──────────────────────────────────

async function notifyAdminsAboutFeedback(feedback, user) {
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',').map(id => id.trim()).filter(Boolean)
  if (!adminIds.length) return

  const stars = feedback.rating ? '⭐'.repeat(feedback.rating) : '—'
  const who = user.name || user.firstName || (user.telegramUsername ? '@' + user.telegramUsername : 'участница')
  const text = `📝 Новый отзыв\n\nОт: ${who}\nОценка: ${stars}\n\n${feedback.text}`

  for (const id of adminIds) {
    try {
      await bot.api.sendMessage(Number(id), text)
    } catch (err) {
      console.error('[bot] notify admin failed:', id, err.message)
    }
  }
}

// ─── Уведомления админам о заявках в лист ожидания ────────────────────────

async function notifyAdminsAboutWaitlist(entry) {
  const now = new Date()
  const leaseUntil = new Date(now.getTime() + 10 * 60 * 1000)
  // An atomic lease prevents the immediate send and cron from sending together.
  const claimed = await db.waitlistEntry.updateMany({
    where: { id: entry.id, notificationPending: true, notificationRetryAt: { lte: now } },
    data: { notificationRetryAt: leaseUntil, notificationAttempts: { increment: 1 } }
  })
  if (!claimed.count) return

  try {
    const current = await db.waitlistEntry.findUnique({ where: { id: entry.id } })
    if (!current) return
    const adminIds = [...new Set((process.env.ADMIN_TELEGRAM_IDS || '')
      .split(',').map(id => id.trim()).filter(id => /^\d+$/.test(id)))]
    if (!adminIds.length) throw new Error('No waitlist notification recipients configured')
    const delivered = new Set(current.notifiedAdminIds)
    const text = `📋 Новая заявка на участие\n\nEmail: ${current.email}\nTelegram: @${current.telegramUsername}\nЗаявка: ${current.id}`

    for (const id of adminIds) {
      if (delivered.has(id)) continue
      try {
        await bot.api.sendMessage(Number(id), text, {}, AbortSignal.timeout(15000))
      } catch (err) {
        console.error('[waitlist] delivery failed:', current.id, id, err.error_code || err.name)
        continue
      }
      // Persist each recipient separately, so retries don't notify successful recipients again.
      await db.waitlistEntry.update({ where: { id: current.id }, data: { notifiedAdminIds: { push: id } } })
      delivered.add(id)
    }
    if (adminIds.every(id => delivered.has(id))) {
      await db.waitlistEntry.update({
        where: { id: current.id }, data: { notificationPending: false, notificationRetryAt: null }
      })
      return
    }
    throw new Error('Some waitlist notification recipients remain pending')
  } catch (err) {
    console.error('[waitlist] will retry:', entry.id, err.message)
    const current = await db.waitlistEntry.findUnique({ where: { id: entry.id } })
    if (!current) return
    const minutes = [1, 5, 15, 60, 360][Math.min(Math.max(current.notificationAttempts - 1, 0), 4)]
    await db.waitlistEntry.update({
      where: { id: entry.id }, data: { notificationRetryAt: new Date(Date.now() + minutes * 60 * 1000) }
    })
  }
}

let waitlistDrainRunning = false
async function retryWaitlistNotifications() {
  if (waitlistDrainRunning) return
  waitlistDrainRunning = true
  try {
    const entries = await db.waitlistEntry.findMany({
      where: { notificationPending: true, notificationRetryAt: { lte: new Date() } },
      orderBy: [{ notificationRetryAt: 'asc' }, { id: 'asc' }], take: 20, select: { id: true }
    })
    for (const entry of entries) {
      try { await notifyAdminsAboutWaitlist(entry) }
      catch (err) { console.error('[waitlist] retry failed:', entry.id, err.message) }
    }
  } catch (err) {
    console.error('[waitlist] queue unavailable:', err.message)
  } finally {
    waitlistDrainRunning = false
  }
}
cron.schedule('* * * * *', retryWaitlistNotifications, { timezone: 'UTC' })
cron.schedule('* * * * *', drainAdmissionNotifications, { timezone: 'UTC' })
cron.schedule('* * * * *', require('./services/access-notices').drainAccessNotices, { timezone: 'UTC' })

// ─── Запуск ───────────────────────────────────────────────────────────────

module.exports = { bot, sendDailyReminder, notifyAdminsAboutFeedback, notifyAdminsAboutWaitlist, retryWaitlistNotifications }
