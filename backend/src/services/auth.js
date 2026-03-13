const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const db = require('../db')

const JWT_SECRET = process.env.JWT_SECRET
const BOT_TOKEN = process.env.BOT_TOKEN

// Проверка подписи Telegram initData
function verifyTelegramInitData(initData) {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null

  params.delete('hash')

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest()

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (expectedHash !== hash) return null

  const userParam = params.get('user')
  if (!userParam) return null

  return JSON.parse(userParam)
}

// Создать JWT токен
function createToken(userId, tokenVersion) {
  return jwt.sign({ userId, tokenVersion }, JWT_SECRET, { expiresIn: '30d' })
}

// Проверить JWT токен + token_version в БД
async function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = await db.user.findUnique({
      where: { id: payload.userId }
    })
    if (!user || user.deletedAt || user.tokenVersion !== payload.tokenVersion) {
      return null
    }
    return user
  } catch {
    return null
  }
}

// Fastify preHandler — требует авторизацию
async function requireAuth(request, reply) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Необходима авторизация' })
  }
  const token = authHeader.slice(7)
  const user = await verifyToken(token)
  if (!user) {
    return reply.code(401).send({ error: 'Токен недействителен' })
  }
  request.user = user
}

// Fastify preHandler — только для ведущих
async function requireAdmin(request, reply) {
  await requireAuth(request, reply)
  if (reply.sent) return

  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => BigInt(id.trim()))
  if (!adminIds.includes(request.user.telegramId)) {
    return reply.code(403).send({ error: 'Недостаточно прав' })
  }
}

module.exports = { verifyTelegramInitData, createToken, requireAuth, requireAdmin }
