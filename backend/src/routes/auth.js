const db = require('../db')
const { recordAppVisit } = require('../services/app-visits')
const { verifyTelegramInitData, createToken, createDataRightsToken, withActiveUser } = require('../services/auth')
const { admissionError, requestAdmission, isClubAdmin } = require('../services/admission')

async function authRoutes(app) {
  app.post('/data-rights', { schema: { body: { type: 'object', required: ['initData'], properties: { initData: { type: 'string', maxLength: 16384 } } } } }, async (request, reply) => {
    const tgUser = verifyTelegramInitData(request.body.initData)
    if (!tgUser) return reply.code(401).send({ error: 'Невалидные данные Telegram' })
    const user = await db.user.findUnique({ where: { telegramId: BigInt(tgUser.id) } })
    if (!user) return reply.code(404).send({ error: 'Сохранённого аккаунта нет' })
    return { token: createDataRightsToken(user.id, user.tokenVersion), purpose: 'data-rights', expiresIn: 600, user: { id: user.id }, accountDeleted: Boolean(user.deletedAt) }
  })
  // POST /auth/telegram — вход через Telegram Mini App
  app.post('/telegram', {
    schema: {
      body: {
        type: 'object',
        required: ['initData'],
        properties: {
          initData: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { initData } = request.body

    const tgUser = verifyTelegramInitData(initData)
    if (!tgUser) {
      return reply.code(401).send({ error: 'Невалидные данные Telegram' })
    }

    // Найти или создать пользователя
    let user = await db.user.findUnique({
      where: { telegramId: BigInt(tgUser.id) }
    })

    if (!user) {
      user = await db.user.create({
        data: {
          telegramId: BigInt(tgUser.id),
          telegramUsername: tgUser.username || null,
          username: tgUser.username || null,
          name: tgUser.first_name || null,
          photoUrl: tgUser.photo_url || null
        }
      })
    } else if (user.deletedAt) {
      return reply.code(403).send({ error: 'Аккаунт удалён' })
    }

    await requestAdmission(user)
    const denied = admissionError(user)
    if (denied) return reply.code(403).send(denied)
    await withActiveUser({ user }, (tx, current) => recordAppVisit(tx, current))
    const token = createToken(user.id, user.tokenVersion)

    return {
      token,
      user: {
        id: user.id,
        isClubAdmin: isClubAdmin(user),
        name: user.name,
        photoUrl: user.photoUrl,
        telegramUsername: user.telegramUsername,
        consentGivenAt: user.consentGivenAt,
        consentVersion: user.consentVersion,
        consentSource: user.consentSource
      }
    }
  })
}

module.exports = authRoutes
