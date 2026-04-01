// bot.js — Telegram бот @body_remembers_bot
// Grammy + node-cron для ежедневных напоминаний

require('dotenv').config()
const { Bot, InlineKeyboard } = require('grammy')
const cron = require('node-cron')
const db = require('./db')

const bot = new Bot(process.env.BOT_TOKEN)

// ─── Константы ────────────────────────────────────────────────────────────

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://almirasultabova.github.io/telo-pomnit/tg-app/'
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',').map(id => parseInt(id.trim())).filter(Boolean)

// ─── /start ───────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const tgUser = ctx.from
  if (!tgUser) return

  try {
    // Создаём или находим пользователя
    const user = await db.user.upsert({
      where: { telegramId: BigInt(tgUser.id) },
      create: {
        telegramId: BigInt(tgUser.id),
        firstName:  tgUser.first_name,
        lastName:   tgUser.last_name || null,
        username:   tgUser.username || null,
        role: ADMIN_IDS.includes(tgUser.id) ? 'HOST' : 'PARTICIPANT',
      },
      update: {
        firstName: tgUser.first_name,
        username:  tgUser.username || null,
      },
    })

    // Проверяем ожидающую запись об оплате
    if (tgUser.username) {
      const pending = await db.pendingEnrollment.findFirst({
        where: { telegramUsername: tgUser.username }
      })

      if (pending) {
        const stream = await db.stream.findFirst({
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

          const keyboard = new InlineKeyboard().webApp('Открыть приложение', MINI_APP_URL)
          return ctx.reply(
            `Добро пожаловать в поток «${stream.name}» 🌿\n\n` +
            `Ваша оплата подтверждена. Доступ к приложению открыт — нажмите кнопку ниже:`,
            { reply_markup: keyboard }
          )
        }
      }
    }

    const name = tgUser.first_name
    const keyboard = new InlineKeyboard().webApp('Открыть приложение', MINI_APP_URL)

    await ctx.reply(
      `Привет, ${name}.\n\n` +
      `Это бот программы «Тело помнит» — интегративной группы для работы с телесными реакциями.\n\n` +
      `Здесь вы будете получать напоминания о ежедневных практиках и новостях программы.\n\n` +
      `Нажмите кнопку ниже, чтобы открыть дневник наблюдений:`,
      { reply_markup: keyboard }
    )
  } catch (err) {
    console.error('[/start] Ошибка:', err)
    await ctx.reply('Что-то пошло не так. Попробуйте ещё раз через минуту.')
  }
})

// ─── /help ────────────────────────────────────────────────────────────────

bot.command('help', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('Открыть приложение', MINI_APP_URL)

  await ctx.reply(
    `Что умеет этот бот:\n\n` +
    `• Присылает ежедневное напоминание о практике\n` +
    `• Даёт доступ к дневнику наблюдений\n` +
    `• Сообщает о датах встреч\n\n` +
    `По всем вопросам — @almirasultabova`,
    { reply_markup: keyboard }
  )
})

// ─── /app — открыть мини-апп ──────────────────────────────────────────────

bot.command('app', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('Открыть дневник', MINI_APP_URL)
  await ctx.reply('Ваш дневник наблюдений:', { reply_markup: keyboard })
})

// ─── /activate — зачислить участницу (только ведущие) ───────────────────

bot.command('activate', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from?.id)) {
    return ctx.reply('Эта команда доступна только ведущим.')
  }

  const usernameRaw = ctx.message?.text?.split(' ')[1]?.replace('@', '')
  if (!usernameRaw) {
    return ctx.reply('Использование: /activate @username\n\nНапример: /activate @ivanova_anna')
  }

  try {
    const user = await db.user.findFirst({
      where: {
        OR: [{ username: usernameRaw }, { telegramUsername: usernameRaw }],
        deletedAt: null,
      },
    })
    if (!user) {
      return ctx.reply(
        `Пользователь @${usernameRaw} не найден.\n\n` +
        `Убедитесь, что она открыла бот и нажала /start.`
      )
    }

    const stream = await db.stream.findFirst({
      where: { isActive: true },
      orderBy: { startDate: 'desc' },
    })
    if (!stream) {
      return ctx.reply('Нет активного потока. Создайте поток через API.')
    }

    const existing = await db.enrollment.findFirst({
      where: { userId: user.id, streamId: stream.id },
    })
    if (existing?.status === 'active') {
      return ctx.reply(`@${usernameRaw} уже зачислена в поток «${stream.name}».`)
    }

    if (existing) {
      await db.enrollment.update({
        where: { id: existing.id },
        data: { status: 'active', paidAt: new Date() },
      })
    } else {
      await db.enrollment.create({
        data: { userId: user.id, streamId: stream.id, status: 'active', paidAt: new Date() },
      })
    }

    const keyboard = new InlineKeyboard().webApp('Открыть приложение', MINI_APP_URL)
    await bot.api.sendMessage(
      Number(user.telegramId),
      `Добро пожаловать в поток «${stream.name}» 🌿\n\n` +
      `Ваш доступ открыт. Здесь — ваш личный дневник тела, трекер состояния и AI-ассистент.\n\n` +
      `Приложение работает прямо в Telegram — нажмите кнопку ниже:`,
      { reply_markup: keyboard }
    )

    await ctx.reply(`✅ @${usernameRaw} зачислена в поток «${stream.name}». Уведомление отправлено.`)
  } catch (err) {
    console.error('[/activate] Ошибка:', err)
    await ctx.reply('Не удалось выполнить команду. Попробуйте ещё раз.')
  }
})

// ─── /deactivate — отозвать доступ (только ведущие) ──────────────────────

bot.command('deactivate', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from?.id)) {
    return ctx.reply('Эта команда доступна только ведущим.')
  }

  const usernameRaw = ctx.message?.text?.split(' ')[1]?.replace('@', '')
  if (!usernameRaw) {
    return ctx.reply('Использование: /deactivate @username')
  }

  try {
    const user = await db.user.findFirst({
      where: {
        OR: [{ username: usernameRaw }, { telegramUsername: usernameRaw }],
        deletedAt: null,
      },
    })
    if (!user) return ctx.reply(`Пользователь @${usernameRaw} не найден.`)

    const enrollment = await db.enrollment.findFirst({
      where: { userId: user.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
    })
    if (!enrollment) {
      return ctx.reply(`@${usernameRaw} не имеет активного доступа.`)
    }

    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { status: 'cancelled' },
    })

    await ctx.reply(`❌ Доступ @${usernameRaw} отозван.`)
  } catch (err) {
    console.error('[/deactivate] Ошибка:', err)
    await ctx.reply('Не удалось выполнить команду. Попробуйте ещё раз.')
  }
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
      user: { notificationsEnabled: true },
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
      where: { streamId: meeting.streamId, status: 'active' },
      include: { user: true }
    })

    const zoomLink = meeting.zoomLink || meeting.stream.zoomLink
    const topicLine = meeting.topic ? `📌 ${meeting.topic}` : ''
    const zoomLine  = zoomLink ? `\n🔗 Zoom: ${zoomLink}` : ''

    const keyboard = new InlineKeyboard().webApp('Открыть приложение', MINI_APP_URL)
    let sent = 0

    for (const enrollment of enrollments) {
      try {
        await bot.api.sendMessage(
          Number(enrollment.user.telegramId),
          `Встреча ${meeting.number} начинается через час\n\n` +
          `${topicLine}${zoomLine}\n\n` +
          `Приложение для подготовки — ниже.`,
          { reply_markup: keyboard }
        )
        sent++
        if (sent % 20 === 0) await new Promise(r => setTimeout(r, 1000))
      } catch { /* пользователь заблокировал бота */ }
    }

    if (sent > 0) {
      console.log(`[cron] Напоминание о встрече ${meeting.number}: отправлено ${sent}`)
    }
  }
}

// ─── Cron: 20:00 МСК (17:00 UTC) каждый день ──────────────────────────────

cron.schedule('0 17 * * *', sendDailyReminder, { timezone: 'UTC' })

// ─── Cron: каждый час — проверка встреч ────────────────────────────────────

cron.schedule('0 * * * *', sendMeetingReminder, { timezone: 'UTC' })

// ─── Регистрация публичных команд в Telegram ──────────────────────────────

bot.api.setMyCommands([
  { command: 'start', description: 'Открыть приложение' },
  { command: 'app',   description: 'Открыть дневник' },
  { command: 'help',  description: 'Помощь' },
]).catch(() => {})

// ─── Запуск ───────────────────────────────────────────────────────────────

module.exports = { bot, sendDailyReminder }
