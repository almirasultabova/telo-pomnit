const { sendWelcomeEmail } = require('../services/email')

async function emailRoutes(app) {
  app.post('/send-welcome', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, name } = request.body

    try {
      await sendWelcomeEmail(email, name)
      return { ok: true }
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Не удалось отправить письмо' })
    }
  })
}

module.exports = emailRoutes
