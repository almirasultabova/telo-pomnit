// bot.js — Telegram бот @body_remembers_bot
// Grammy + node-cron для ежедневных напоминаний

require('dotenv').config()
const { Bot, InlineKeyboard } = require('grammy')
const cron = require('node-cron')
const db = require('./db')

const bot = new Bot(process.env.BOT_TOKEN)

// ─── Константы ────────────────────────────────────────────────────────────

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://telo-pomnit.vercel.app/tg-app/'
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',').map(id => parseInt(id.trim())).filter(Boolean)

// ─── /start ───────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const tgUser = ctx.from
  if (!tgUser) return

  // Создаём или находим пользователя
  const user = await db.user.upsert({
    where: { telegramId: BigInt(tgUser.id) },
    create: {
      telegramId: BigInt(tgUser.id),
      firstName: tgUser.first_name,
      lastName: tgUser.last_name || null,
      username: tgUser.username || null,
      role: ADMIN_IDS.includes(tgUser.id) ? 'HOST' : 'PARTICIPANT',
    },
    update: {
      firstName: tgUser.first_name,
      username: tgUser.username || null,
    },
  })

  const name = tgUser.first_name

  const keyboard = new InlineKeyboard()
    .webApp('Открыть приложение', MINI_APP_URL)

  await ctx.reply(
    `Привет, ${name}.\n\n` +
    `Это бот программы «Тело помнит» — интегративной группы для работы с телесными реакциями.\n\n` +
    `Здесь вы будете получать напоминания о ежедневных практиках и новостях программы.\n\n` +
    `Нажмите кнопку ниже, чтобы открыть дневник наблюдений:`,
    { reply_markup: keyboard }
  )
})

// ─── /help ────────────────────────────────────────────────────────────────

bot.command('help', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp('Открыть приложение', MINI_APP_URL)

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
  const keyboard = new InlineKeyboard()
    .webApp('Открыть дневник', MINI_APP_URL)
  await ctx.reply('Ваш дневник наблюдений:', { reply_markup: keyboard })
})

// ─── Ежедневное напоминание ───────────────────────────────────────────────
// Запускается каждый день в 20:00 по московскому времени

async function sendDailyReminder() {
  // Получаем всех активных участников с уведомлениями
  const enrollments = await db.enrollment.findMany({
    where: {
      status: 'ACTIVE',
      user: { notificationsEnabled: true },
    },
    include: { user: true },
    take: 500,
  })

  const keyboard = new InlineKeyboard()
    .webApp('Сделать запись', MINI_APP_URL)

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
      // Небольшая пауза чтобы не превысить лимит Telegram (30 msg/sec)
      if (sent % 20 === 0) await new Promise(r => setTimeout(r, 1000))
    } catch {
      // Пользователь мог заблокировать бота — пропускаем
    }
  }

  console.log(`[cron] Напоминания отправлены: ${sent} из ${enrollments.length}`)
}

// ─── Cron: 20:00 МСК (17:00 UTC) каждый день ──────────────────────────────

cron.schedule('0 17 * * *', sendDailyReminder, {
  timezone: 'UTC',
})

// ─── Запуск ───────────────────────────────────────────────────────────────

module.exports = { bot, sendDailyReminder }
