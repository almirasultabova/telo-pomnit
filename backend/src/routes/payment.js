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
          email:            { type: 'string', format: 'email', maxLength: 254 },
          name:             { type: 'string', maxLength: 100 },
          telegramUsername: { type: 'string', maxLength: 64, pattern: '^@?[a-zA-Z0-9_]{3,32}$' }
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
  // IP-адреса ЮКассы: https://yookassa.ru/developers/using-api/webhooks
  const YUKASSA_IPS = [
    '185.71.76.0/27',
    '185.71.77.0/27',
    '77.75.153.0/25',
    '77.75.156.11',
    '77.75.156.35',
    '77.75.154.128/25',
    '2a02:5180::/32'
  ]

  function isYukassaIP(ip) {
    // Точные IP
    const exact = ['77.75.156.11', '77.75.156.35']
    if (exact.includes(ip)) return true
    // CIDR-диапазоны (упрощённая проверка для IPv4 /25 и /27)
    const ranges = [
      { base: [185, 71, 76, 0],   mask: 27 },
      { base: [185, 71, 77, 0],   mask: 27 },
      { base: [77, 75, 153, 0],   mask: 25 },
      { base: [77, 75, 154, 128], mask: 25 }
    ]
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4) return false
    for (const { base, mask } of ranges) {
      const bits = 32 - mask
      const ipNum   = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]
      const baseNum = (base[0]  << 24) | (base[1]  << 16) | (base[2]  << 8) | base[3]
      if ((ipNum >>> bits) === (baseNum >>> bits)) return true
    }
    return false
  }

  app.post('/webhook/yukassa', async (request, reply) => {
    const clientIP = request.headers['x-forwarded-for']?.split(',')[0].trim() || request.ip
    if (!isYukassaIP(clientIP)) {
      request.log.warn({ clientIP }, 'Webhook отклонён: неизвестный IP')
      return reply.code(403).send({ error: 'Forbidden' })
    }

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
