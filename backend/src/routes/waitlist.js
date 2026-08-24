const db = require('../db')
const { notifyAdminsAboutWaitlist } = require('../bot')

async function waitlistRoutes(app) {
  // POST /waitlist — заявка в лист ожидания нового потока (без оплаты)
  app.post('/waitlist', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' }
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'telegramUsername'],
        properties: {
          email: { type: 'string', maxLength: 254 },
          telegramUsername: { type: 'string', maxLength: 64 }
        }
      }
    }
  }, async (request, reply) => {
    const email = request.body.email.trim()
    const telegramUsername = request.body.telegramUsername.trim().replace(/^@/, '')

    if (!email.includes('@')) {
      return reply.code(400).send({ error: 'Некорректный email' })
    }
    if (!telegramUsername) {
      return reply.code(400).send({ error: 'Укажите Telegram' })
    }

    const entry = await db.waitlistEntry.create({
      data: { email, telegramUsername }
    })

    notifyAdminsAboutWaitlist(entry).catch(err => {
      app.log.error({ err }, 'failed to notify admins about waitlist entry')
    })

    return { ok: true, id: entry.id }
  })
}

module.exports = waitlistRoutes
