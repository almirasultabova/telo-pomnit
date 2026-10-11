const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const db = require('../db')
const { admissionError } = require('./admission')

const JWT_SECRET = process.env.JWT_SECRET
const BOT_TOKEN = process.env.BOT_TOKEN

// Проверка подписи Telegram initData
function verifyTelegramInitData(initData) {
  if (typeof initData !== 'string' || initData.length > 16384 || !BOT_TOKEN) return null
  const params = new URLSearchParams(initData)
  if (new Set(params.keys()).size !== Array.from(params.keys()).length) return null
  const hash = params.get('hash')
  if (!hash || !/^[a-fA-F0-9]{64}$/.test(hash)) return null

  params.delete('hash')

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest()

  const expectedHashBuf = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest()

  // Timing-safe сравнение — защита от timing attack
  const hashBuf = Buffer.from(hash, 'hex')
  if (expectedHashBuf.length !== hashBuf.length) return null
  if (!crypto.timingSafeEqual(expectedHashBuf, hashBuf)) return null

  // Проверка свежести данных — не старше 24 часов
  const authDate = params.get('auth_date')
  if (!authDate || !/^\d+$/.test(authDate)) return null
  const authSeconds = Number(authDate)
  const ageSeconds = Math.floor(Date.now() / 1000) - authSeconds
  if (!Number.isSafeInteger(authSeconds) || ageSeconds > 86400 || ageSeconds < -60) return null

  const userParam = params.get('user')
  if (!userParam) return null

  try {
    const user = JSON.parse(userParam)
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null
    return user
  } catch { return null }
}

// Создать JWT токен
function createToken(userId, tokenVersion) {
  return jwt.sign({ userId, tokenVersion, purpose: 'club' }, JWT_SECRET, { expiresIn: '7d' })
}
function createDataRightsToken(userId, tokenVersion) {
  return jwt.sign({ userId, tokenVersion, purpose: 'data-rights' }, JWT_SECRET, { expiresIn: '10m', audience: 'telo-personal-data' })
}

// Проверить JWT токен + token_version в БД
async function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    if ((payload.purpose !== undefined && payload.purpose !== 'club') || payload.aud !== undefined) return null
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

async function requireDataRights(request, reply) {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return reply.code(401).send({ error: 'Нужна проверка личности' })
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET, { algorithms: ['HS256'] })
    if (payload.purpose === 'data-rights') {
      if (payload.aud !== 'telo-personal-data') throw new Error('Invalid audience')
    } else if ((payload.purpose !== undefined && payload.purpose !== 'club') || payload.aud !== undefined) throw new Error('Invalid purpose')
    const user = await db.user.findUnique({ where: { id: payload.userId } })
    if (!user || user.tokenVersion !== payload.tokenVersion || (user.deletedAt && payload.purpose !== 'data-rights')) throw new Error('Invalid account')
    request.user = user
    request.authPurpose = payload.purpose || 'club'
  } catch { return reply.code(401).send({ error: 'Проверка личности истекла, откройте приложение заново' }) }
}

async function withActiveUser(request, callback) {
  try { return await db.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT id FROM users WHERE id = $1 FOR UPDATE', request.user.id)
    const user = await tx.user.findUnique({ where: { id: request.user.id } })
    if (!user || user.deletedAt || user.tokenVersion !== request.user.tokenVersion || admissionError(user)) {
      throw Object.assign(new Error('Аккаунт или доступ изменился'), { statusCode: 403, code: 'ACCOUNT_CHANGED' })
    }
    return callback(tx, user)
  }) } catch (error) {
    if (error.statusCode === 403 && error.code === 'ACCOUNT_CHANGED') throw error
    // Prisma error messages can echo write arguments; never hand personal content to Fastify logs.
    throw Object.assign(new Error('Сохранение временно недоступно'), { statusCode: 503,
      code: /^P\d{4}$/.test(error.code || '') ? error.code : 'PERSONAL_WRITE_FAILED' })
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
  const denied = admissionError(user)
  if (denied) return reply.code(403).send(denied)
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

module.exports = { verifyTelegramInitData, createToken, createDataRightsToken, requireAuth, requireAdmin, requireDataRights, withActiveUser }
