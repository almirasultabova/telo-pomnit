const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')
const { admissionError } = require('../services/admission')
const { notifyAdminsAboutFeedback } = require('../bot')

async function feedbackRoutes(app) {
  app.post('/feedback', {
    preHandler: requireAuth,
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' }
    },
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text:   { type: 'string', minLength: 1, maxLength: 2000 },
          rating: { type: 'integer', minimum: 1, maximum: 5, nullable: true }
        }
      }
    }
  }, async (request) => {
    const { text, rating } = request.body
    const feedback = await withActiveUser(request, tx => tx.feedback.create({
      data: {
        userId: request.user.id,
        text: text.trim(),
        rating: rating ?? null
      }
    }))

    const current = await db.user.findUnique({ where: { id: request.user.id } })
    if (current && !current.deletedAt && current.tokenVersion === request.user.tokenVersion && !admissionError(current)) {
      notifyAdminsAboutFeedback(feedback, current).catch(() => app.log.error('failed to notify admins about feedback'))
    }

    return { ok: true, id: feedback.id }
  })
}

module.exports = feedbackRoutes
