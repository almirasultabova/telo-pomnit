const { sendWelcomeEmail } = require('../services/email')
const https = require('https')
const { randomUUID } = require('crypto')
const db = require('../db')

function yukassaRequest(method, path, body, idempotenceKey = randomUUID()) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const auth = Buffer.from(`${process.env.YUKASSA_SHOP_ID}:${process.env.YUKASSA_SECRET_KEY}`).toString('base64')
    const headers = { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` }
    if (data) { headers['Idempotence-Key'] = idempotenceKey; headers['Content-Length'] = Buffer.byteLength(data) }
    const req = https.request({ hostname: 'api.yookassa.ru', port: 443, path: `/v3${path}`, method, headers }, res => {
      let raw = ''
      res.on('data', chunk => { raw += chunk; if (raw.length > 1048576) req.destroy(new Error('Provider response too large')) })
      res.on('error', reject)
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Provider HTTP ${res.statusCode}`))
        try { resolve(JSON.parse(raw)) } catch { reject(new Error('Invalid provider response')) }
      })
    })
    req.setTimeout(10000, () => req.destroy(new Error('Provider timeout')))
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function paymentRoutes(app) {
  app.post('/create-payment', {
    schema: { body: { type: 'object', required: ['email', 'telegramUsername'], properties: {
      email: { type: 'string', format: 'email', maxLength: 254 }, name: { type: 'string', maxLength: 100 },
      telegramUsername: { type: 'string', maxLength: 64, pattern: '^@?[a-zA-Z0-9_]{3,32}$' }
    } } }
  }, async (request, reply) => {
    if (!process.env.YUKASSA_SHOP_ID || !process.env.YUKASSA_SECRET_KEY) return reply.code(503).send({ error: 'Оплата временно недоступна' })
    const { email, name } = request.body
    const telegramUsername = request.body.telegramUsername.replace(/^@/, '').toLowerCase()
    const moscowDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
    const dateKey = Number(['year', 'month', 'day'].map(type => moscowDate.find(part => part.type === type).value).join(''))
    if (dateKey > 20261014) return reply.code(409).send({ error: 'Набор в этот поток завершён' })
    const price = dateKey <= 20261008 ? '12000.00' : '15000.00'
    const stream = await db.stream.findFirst({ where: { isActive: true }, orderBy: { startDate: 'desc' } })
    if (!stream) return reply.code(409).send({ error: 'Нет потока для оплаты' })
    const order = await db.paymentOrder.create({ data: {
      amount: price, currency: 'RUB', shopId: String(process.env.YUKASSA_SHOP_ID), streamId: stream.id, email, name: name || '', telegramUsername
    } })
    try {
      const payment = await yukassaRequest('POST', '/payments', {
        amount: { value: price, currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: `${process.env.APP_URL || 'https://telo-pomnit.ru'}/thanks.html` },
        capture: true, description: 'Программа «Тело помнит»',
        metadata: { orderId: order.id, streamId: stream.id, email, name: name || '', telegramUsername },
        receipt: { customer: { email }, items: [{ description: 'Программа «Тело помнит»', quantity: '1', amount: { value: price, currency: 'RUB' }, vat_code: 1 }] }
      }, order.id)
      if (!payment.id || !payment.confirmation?.confirmation_url) throw new Error('Missing payment confirmation')
      await db.paymentOrder.update({ where: { id: order.id }, data: { paymentId: payment.id } })
      return { url: payment.confirmation.confirmation_url }
    } catch (err) {
      request.log.error({ message: err.message, orderId: order.id }, 'Не удалось создать платёж')
      return reply.code(502).send({ error: 'Не удалось создать платёж' })
    }
  })

  app.post('/webhook/yukassa', async (request, reply) => {
    const event = request.body
    if (event?.event !== 'payment.succeeded') return { ok: true }
    const paymentId = event.object?.id
    if (typeof paymentId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(paymentId)) return reply.code(400).send({ error: 'Invalid payment id' })
    const order = await db.paymentOrder.findUnique({ where: { paymentId } })
    // Legacy/foreign events cannot automatically grant rights; reconcile old open links separately.
    if (!order) return reply.code(403).send({ error: 'Unknown payment' })
    if (order.processedAt) return { ok: true }
    let payment
    try { payment = await yukassaRequest('GET', `/payments/${encodeURIComponent(paymentId)}`) }
    catch (err) {
      request.log.warn({ orderId: order.id, message: err.message }, 'Не удалось проверить платёж')
      return reply.code(503).send({ error: 'Payment verification unavailable' })
    }
    const metadata = payment.metadata || {}
    if (payment.id !== order.paymentId || payment.status !== 'succeeded' || payment.paid !== true || payment.test !== false ||
        payment.amount?.value !== order.amount || payment.amount?.currency !== order.currency ||
        String(payment.recipient?.account_id) !== order.shopId || metadata.orderId !== order.id || metadata.streamId !== order.streamId ||
        metadata.email !== order.email || metadata.telegramUsername !== order.telegramUsername || (metadata.name || '') !== (order.name || '')) {
      request.log.warn({ orderId: order.id }, 'Платёж не соответствует заказу')
      return reply.code(403).send({ error: 'Payment does not match order' })
    }
    const applied = await db.$transaction(async tx => {
      const claimed = await tx.paymentOrder.updateMany({ where: { id: order.id, processedAt: null }, data: { processedAt: new Date() } })
      if (!claimed.count) return false
      const user = await tx.user.findFirst({ where: { deletedAt: null, OR: [
        { username: { equals: order.telegramUsername, mode: 'insensitive' } }, { telegramUsername: { equals: order.telegramUsername, mode: 'insensitive' } }
      ] } })
      if (user) {
        const existing = await tx.enrollment.findFirst({ where: { userId: user.id, streamId: order.streamId } })
        if (existing) await tx.enrollment.update({ where: { id: existing.id }, data: { status: 'active', paymentId, paidAt: new Date() } })
        else await tx.enrollment.create({ data: { userId: user.id, streamId: order.streamId, status: 'active', paymentId, paidAt: new Date() } })
      } else {
        await tx.pendingEnrollment.upsert({ where: { paymentId }, create: {
          telegramUsername: order.telegramUsername, email: order.email, name: order.name, paymentId, streamId: order.streamId
        }, update: {} })
      }
      return { user }
    })
    if (applied) {
      try { await sendWelcomeEmail(order.email, order.name || '') }
      catch (err) { request.log.error({ orderId: order.id, message: err.message }, 'Не удалось отправить welcome-письмо') }
      if (applied.user) {
        try {
          const { bot } = require('../bot')
          const { InlineKeyboard } = require('grammy')
          const keyboard = new InlineKeyboard().webApp('Открыть приложение', process.env.MINI_APP_URL || 'https://tg-app-telo-pomnit.vercel.app/')
          await bot.api.sendMessage(Number(applied.user.telegramId), 'Оплата подтверждена 🌿\n\nПрограмма доступна после разрешения входа в закрытый круг.', { reply_markup: keyboard })
        } catch (err) { request.log.warn({ orderId: order.id, message: err.message }, 'Не удалось отправить уведомление об оплате') }
      }
    }
    return { ok: true }
  })
}
module.exports = paymentRoutes
