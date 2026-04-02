const db = require('../db')
const { verifyTelegramInitData, createToken } = require('../services/auth')

async function authRoutes(app) {
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

    const token = createToken(user.id, user.tokenVersion)

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        photoUrl: user.photoUrl,
        telegramUsername: user.telegramUsername,
        consentGivenAt: user.consentGivenAt
      }
    }
  })
}

module.exports = authRoutes
