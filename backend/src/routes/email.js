const db = require('../db')
const { validWelcomeToken, sendPaidWelcome } = require('../services/welcome-email')

async function emailRoutes(app) {
  app.post('/send-welcome', {
    preValidation: async (request, reply) => {
      if (typeof request.body?.orderId !== 'string' || typeof request.body?.token !== 'string' ||
          Object.keys(request.body).some(key => !['orderId', 'token'].includes(key))) {
        return reply.code(403).send({ error: 'Откройте ссылку возврата после оплаты, чтобы запросить письмо.', retryable: false })
      }
    },
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['orderId', 'token'],
        properties: {
          orderId: { type: 'string', pattern: '^[a-zA-Z0-9-]{16,64}$' },
          token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' }
        }
      }
    }
  }, async (request, reply) => {
    const { orderId, token } = request.body
    reply.header('Cache-Control', 'no-store')
    try {
      const order = await db.paymentOrder.findUnique({ where: { id: orderId } })
      if (!validWelcomeToken(order, token)) return reply.code(403).send({ error: 'Ссылка для запроса письма недействительна или устарела. Напишите нам в Telegram.', retryable: false })
      const status = await sendPaidWelcome(orderId)
      if (status === 'payment_pending') return reply.code(409).send({ error: 'Оплата ещё проверяется. Повторите запрос немного позже.', retryable: true })
      if (status === 'sent') return { ok: true, status }
      if (status === 'sending') return reply.code(202).send({ ok: true, status })
      return reply.code(503).send({ error: 'Не удалось подтвердить отправку письма. Проверьте почту; если письма нет, напишите нам в Telegram.', retryable: false })
    } catch (err) {
      request.log.error({ orderId }, 'Не удалось обработать запрос welcome-письма')
      return reply.code(500).send({ error: 'Не удалось отправить письмо' })
    }
  })
}

module.exports = emailRoutes
