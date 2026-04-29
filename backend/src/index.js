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
    'https://web.telegram.org'
  ],
  credentials: true
})

// Rate limiting
app.register(require('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute'
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
app.register(require('./routes/ai'), { prefix: '/' })
app.register(require('./routes/email'), { prefix: '/' })
app.register(require('./routes/payment'), { prefix: '/' })
app.register(require('./routes/feedback'), { prefix: '/' })

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
