const db = require('../db')
const { requireAuth } = require('../services/auth')

async function gdprRoutes(app) {
  // GET /gdpr/my-data — все мои данные в JSON
  app.get('/gdpr/my-data', { preHandler: requireAuth }, async (request) => {
    const userId = request.user.id
    const [user, diary, triggers, checkins, diagnostic, questionnaires] = await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      db.diaryEntry.findMany({ where: { userId } }),
      db.triggerEntry.findMany({ where: { userId } }),
      db.checkin.findMany({ where: { userId } }),
      db.diagnosticResult.findMany({ where: { userId } }),
      db.questionnaire.findMany({ where: { userId } })
    ])

    return {
      profile: {
        name: user.name,
        telegramUsername: user.telegramUsername,
        phone: user.phone,
        createdAt: user.createdAt,
        consentGivenAt: user.consentGivenAt
      },
      diary,
      triggers,
      checkins,
      diagnostic,
      questionnaires
    }
  })

  // DELETE /gdpr/delete-me — удалить все данные
  app.delete('/gdpr/delete-me', { preHandler: requireAuth }, async (request) => {
    const userId = request.user.id

    // Обезличиваем пользователя и инкрементируем token_version (выход из всех сессий)
    await db.user.update({
      where: { id: userId },
      data: {
        name: '[удалено]',
        telegramUsername: null,
        phone: null,
        photoUrl: null,
        deletedAt: new Date(),
        tokenVersion: { increment: 1 }
      }
    })

    // Данные физически удалятся через 30 дней (задача в cron)
    return { success: true, message: 'Данные будут удалены в течение 30 дней' }
  })
}

module.exports = gdprRoutes
