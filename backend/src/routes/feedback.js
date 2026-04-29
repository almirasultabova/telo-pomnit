const db = require('../db')
const { requireAuth } = require('../services/auth')
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
    const feedback = await db.feedback.create({
      data: {
        userId: request.user.id,
        text: text.trim(),
        rating: rating ?? null
      }
    })

    notifyAdminsAboutFeedback(feedback, request.user).catch(err => {
      app.log.error({ err }, 'failed to notify admins about feedback')
    })

    return { ok: true, id: feedback.id }
  })
}

module.exports = feedbackRoutes
