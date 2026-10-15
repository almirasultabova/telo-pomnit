const { createHmac, timingSafeEqual } = require('crypto')
const db = require('../db')
const { sendWelcomeEmail } = require('./email')

const TOKEN_TTL = 24 * 60 * 60 * 1000

function welcomeToken(order) {
  if (!process.env.JWT_SECRET) throw new Error('Welcome authorization unavailable')
  return createHmac('sha256', process.env.JWT_SECRET)
    .update(`welcome-email:v1\0${order.id}\0${new Date(order.createdAt).toISOString()}`)
    .digest('base64url')
}

function welcomeReturnUrl(order) {
  const url = new URL('/thanks.html', process.env.APP_URL || 'https://telo-pomnit.ru')
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localHttp) throw new Error('HTTPS return URL required')
  url.hash = new URLSearchParams({ welcome_order: order.id, welcome_token: welcomeToken(order) }).toString()
  return url.href
}

function validWelcomeToken(order, token, now = Date.now()) {
  if (!order || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false
  const age = now - new Date(order.createdAt).getTime()
  if (!Number.isFinite(age) || age < -60000 || age >= TOKEN_TTL) return false
  const expected = Buffer.from(welcomeToken(order))
  const actual = Buffer.from(token)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// Both verified payment and its signed return share one durable send claim.
// An ambiguous SMTP outcome is not automatically retried: it may already be accepted.
async function sendPaidWelcome(orderId) {
  const order = await db.paymentOrder.findUnique({ where: { id: orderId } })
  if (!order?.processedAt || !order.paymentId) return 'payment_pending'
  if (order.welcomeEmailStatus !== 'pending') return order.welcomeEmailStatus
  const claimed = await db.paymentOrder.updateMany({
    where: { id: order.id, processedAt: { not: null }, welcomeEmailStatus: 'pending' },
    data: { welcomeEmailStatus: 'sending' }
  })
  if (!claimed.count) {
    const current = await db.paymentOrder.findUnique({ where: { id: order.id } })
    return current?.welcomeEmailStatus || 'unconfirmed'
  }
  try {
    await sendWelcomeEmail(order.email, order.name || '')
    await db.paymentOrder.update({ where: { id: order.id }, data: { welcomeEmailStatus: 'sent', welcomeEmailSentAt: new Date() } })
    return 'sent'
  } catch {
    await db.paymentOrder.update({ where: { id: order.id }, data: { welcomeEmailStatus: 'unconfirmed' } })
    return 'unconfirmed'
  }
}

module.exports = { welcomeReturnUrl, validWelcomeToken, sendPaidWelcome }
