const db = require('../db')
const { verifyTelegramInitData, createToken } = require('../services/auth')

async function authRoutes(app) {
  // POST /auth/telegram — вход через Telegram Mini App
  app.post('/auth/telegram', {
    schema: {
      body: {
        type: 'object',
        required: ['initData', 'consentGiven'],
        properties: {
          initData: { type: 'string' },
          consentGiven: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { initData, consentGiven } = request.body

    // В режиме разработки — разрешаем тестовый вход
    let tgUser
    if (process.env.NODE_ENV === 'development' && initData === 'dev') {
      tgUser = { id: 412942287, first_name: 'Альмира', username: 'almira_test', photo_url: null }
    } else {
      tgUser = verifyTelegramInitData(initData)
      if (!tgUser) {
        return reply.code(401).send({ error: 'Невалидные данные Telegram' })
      }
    }

    if (!consentGiven) {
      return reply.code(400).send({ error: 'Необходимо согласие на обработку данных' })
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
          name: tgUser.first_name || null,
          photoUrl: tgUser.photo_url || null,
          consentGivenAt: new Date(),
          consentText: 'v1.0'
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
        telegramUsername: user.telegramUsername
      }
    }
  })
}

module.exports = authRoutes
