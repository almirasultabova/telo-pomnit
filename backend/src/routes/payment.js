const { sendWelcomeEmail } = require('../services/email')
const https = require('https')
const { randomUUID } = require('crypto')

function yukassaRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const auth = Buffer.from(`${process.env.YUKASSA_SHOP_ID}:${process.env.YUKASSA_SECRET_KEY}`).toString('base64')
    const options = {
      hostname: 'api.yookassa.ru',
      port: 443,
      path: `/v3${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        'Idempotence-Key': randomUUID(),
        'Content-Length': Buffer.byteLength(data)
      }
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', chunk => raw += chunk)
      res.on('end', () => resolve(JSON.parse(raw)))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function paymentRoutes(app) {
  // Создать платёж в ЮКассе
  app.post('/create-payment', {
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

    const payment = await yukassaRequest('POST', '/payments', {
      amount: { value: '15000.00', currency: 'RUB' },
      confirmation: {
        type: 'redirect',
        return_url: `${process.env.APP_URL || 'https://telo-pomnit.ru'}/thanks.html`
      },
      capture: true,
      description: 'Программа «Тело помнит»',
      metadata: { email, name: name || '' },
      receipt: {
        customer: { email },
        items: [{
          description: 'Программа «Тело помнит»',
          quantity: '1',
          amount: { value: '15000.00', currency: 'RUB' },
          vat_code: 1
        }]
      }
    })

    if (!payment.confirmation?.confirmation_url) {
      request.log.error(payment, 'ЮКасса не вернула ссылку')
      return reply.code(500).send({ error: 'Не удалось создать платёж' })
    }

    return { url: payment.confirmation.confirmation_url }
  })

  // Webhook от ЮКассы — вызывается автоматически после успешной оплаты
  app.post('/webhook/yukassa', async (request, reply) => {
    const event = request.body

    if (event.event !== 'payment.succeeded') {
      return reply.code(200).send({ ok: true })
    }

    const payment = event.object
    const email = payment?.metadata?.email || payment?.receipt?.customer?.email
    const name = payment?.metadata?.name || payment?.receipt?.customer?.full_name || ''

    if (email) {
      try {
        await sendWelcomeEmail(email, name)
      } catch (err) {
        request.log.error({ err, email }, 'Не удалось отправить welcome-письмо')
      }
    }

    return reply.code(200).send({ ok: true })
  })
}

module.exports = paymentRoutes
