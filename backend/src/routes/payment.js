const { sendWelcomeEmail } = require('../services/email')
const https = require('https')
const { randomUUID } = require('crypto')
const db = require('../db')

function yukassaRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const auth = Buffer.from(`${process.env.YUKASSA_SHOP_ID}:${process.env.YUKASSA_SECRET_KEY}`).toString('base64')
    const options = {
      hostname: 'api.yookassa.ru',
      port: 443,
      path: `/v3${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        'Idempotence-Key': randomUUID(),
        'Content-Length': Buffer.byteLength(data)
      }
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', chunk => raw += chunk)
      res.on('end', () => resolve(JSON.parse(raw)))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function paymentRoutes(app) {
  // Создать платёж в ЮКассе
  app.post('/create-payment', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'telegramUsername'],
        properties: {
          email:            { type: 'string', format: 'email' },
          name:             { type: 'string' },
          telegramUsername: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, name, telegramUsername } = request.body

    const price = '15000.00'
    const payment = await yukassaRequest('POST', '/payments', {
      amount: { value: price, currency: 'RUB' },
      confirmation: {
        type: 'redirect',
        return_url: `${process.env.APP_URL || 'https://telo-pomnit.ru'}/thanks.html`
      },
      capture: true,
      description: 'Программа «Тело помнит»',
      metadata: { email, name: name || '', telegramUsername },
      receipt: {
        customer: { email },
        items: [{
          description: 'Программа «Тело помнит»',
          quantity: '1',
          amount: { value: price, currency: 'RUB' },
          vat_code: 1
        }]
      }
    })

    if (!payment.confirmation?.confirmation_url) {
      request.log.error(payment, 'ЮКасса не вернула ссылку')
      return reply.code(500).send({ error: 'Не удалось создать платёж' })
    }

    return { url: payment.confirmation.confirmation_url }
  })

  // Webhook от ЮКассы — вызывается автоматически после успешной оплаты
  app.post('/webhook/yukassa', async (request, reply) => {
    const event = request.body

    if (event.event !== 'payment.succeeded') {
      return reply.code(200).send({ ok: true })
    }

    const payment = event.object
    const email           = payment?.metadata?.email || payment?.receipt?.customer?.email
    const name            = payment?.metadata?.name || payment?.receipt?.customer?.full_name || ''
    const telegramUsername = payment?.metadata?.telegramUsername || null
    const paymentId       = payment?.id

    // Отправляем welcome-письмо
    if (email) {
      try {
        await sendWelcomeEmail(email, name)
      } catch (err) {
        request.log.error({ err, email }, 'Не удалось отправить welcome-письмо')
      }
    }

    // Авто-зачисление по Telegram username
    if (telegramUsername && paymentId) {
      try {
        await enrollOrPend({ telegramUsername, email, name, paymentId, log: request.log })
      } catch (err) {
        request.log.error({ err, telegramUsername }, 'Ошибка авто-зачисления')
      }
    }

    return reply.code(200).send({ ok: true })
  })
}

// Найти пользователя и зачислить, или сохранить как ожидающего
async function enrollOrPend({ telegramUsername, email, name, paymentId, log }) {
  // Ищем по username в обоих полях (grammy сохраняет в username, старый код — в telegramUsername)
  const user = await db.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { username: telegramUsername },
        { telegramUsername: telegramUsername }
      ]
    }
  })

  const stream = await db.stream.findFirst({
    where: { isActive: true },
    orderBy: { startDate: 'desc' }
  })

  if (!stream) {
    log.warn('Нет активного потока для зачисления')
    return
  }

  if (user) {
    // Пользователь уже есть — зачисляем сразу
    const existing = await db.enrollment.findFirst({
      where: { userId: user.id, streamId: stream.id }
    })
    if (existing?.status === 'active') return // уже активен

    if (existing) {
      await db.enrollment.update({
        where: { id: existing.id },
        data: { status: 'active', paymentId, paidAt: new Date() }
      })
    } else {
      await db.enrollment.create({
        data: { userId: user.id, streamId: stream.id, status: 'active', paymentId, paidAt: new Date() }
      })
    }

    // Уведомляем через бота
    try {
      const { bot } = require('../bot')
      const { InlineKeyboard } = require('grammy')
      const MINI_APP_URL = process.env.MINI_APP_URL || 'https://almirasultabova.github.io/telo-pomnit/tg-app/'
      const keyboard = new InlineKeyboard().webApp('Открыть приложение', MINI_APP_URL)
      await bot.api.sendMessage(
        Number(user.telegramId),
        `Оплата прошла успешно 🌿\n\nДобро пожаловать в поток «${stream.name}».\n\nВаш дневник тела и AI-ассистент — в приложении:`,
        { reply_markup: keyboard }
      )
    } catch (e) {
      log.warn({ e }, 'Не удалось отправить бот-уведомление')
    }

    log.info({ telegramUsername }, 'Участница зачислена автоматически после оплаты')
  } else {
    // Пользователь ещё не открывал бота — сохраняем ожидающую запись
    await db.pendingEnrollment.upsert({
      where: { paymentId },
      create: { telegramUsername, email, name, paymentId },
      update: { telegramUsername, email, name }
    })
    log.info({ telegramUsername }, 'Создана ожидающая запись — пользователь ещё не в боте')
  }
}

module.exports = paymentRoutes
