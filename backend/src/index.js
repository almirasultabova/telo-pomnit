require('dotenv').config()
const Fastify = require('fastify')
const db = require('./db')
const { bot } = require('./bot')

const app = Fastify({ logger: true })

// CORS — разрешаем запросы только от известных доменов
app.register(require('@fastify/cors'), {
  origin: [
    'https://telo-pomnit.ru',
    'https://www.telo-pomnit.ru',
    'https://almirasultabova.github.io',
    'https://web.telegram.org',
    'https://tg-app-telo-pomnit.vercel.app',
    'https://telo-pomnit-t6my-almirasultabovas-projects.vercel.app',
    'https://app.telo-pomnit.ru'
  ],
  credentials: true
})

// Rate limiting
app.register(require('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute'
})

// Anonymous daily API failure totals; no account, payload, IP or diary content.
app.addHook('onResponse', async (request,reply) => {
  if (reply.statusCode < 500) return
  const path = request.routeOptions?.url || ''
  const kind = path.startsWith('/auth/') ? 'auth' : path.startsWith('/me/consent') ? 'consent' : /^\/(diary|checkins|triggers)/.test(path) ? 'save' : null
  if (!kind) return
  const day = new Date().toISOString().slice(0,10)
  try { await db.operationalMetric.upsert({where:{day_kind:{day,kind}},create:{day,kind,count:1},update:{count:{increment:1}}}) } catch {}
})

// Маршруты
app.register(require('./routes/auth'), { prefix: '/auth' })
app.register(require('./routes/me'), { prefix: '/' })
app.register(require('./routes/diary'), { prefix: '/' })
app.register(require('./routes/checkins'), { prefix: '/' })
app.register(require('./routes/triggers'), { prefix: '/' })
app.register(require('./routes/diagnostic'), { prefix: '/' })
app.register(require('./routes/questionnaires'), { prefix: '/' })
app.register(require('./routes/gdpr'), { prefix: '/gdpr' })
app.register(require('./routes/admin'), { prefix: '/' })
app.register(require('./routes/access-admin'), { prefix: '/' })
app.register(require('./routes/ai'), { prefix: '/' })
app.register(require('./routes/email'), { prefix: '/' })
app.register(require('./routes/payment'), { prefix: '/' })
app.register(require('./routes/stream-overview'), { prefix: '/' })
app.register(require('./routes/feedback'), { prefix: '/' })
app.register(require('./routes/waitlist'), { prefix: '/' })

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

// Запуск сервера
const start = async () => {
  try {
    await app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
    console.log('Сервер запущен на порту', process.env.PORT || 3000)

    // Запускаем бота (long polling)
    bot.start({ onStart: () => console.log('Бот запущен') })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await db.$disconnect()
  await app.close()
})

start()
