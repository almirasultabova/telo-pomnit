require('dotenv').config()
const Fastify = require('fastify')
const db = require('./db')

const app = Fastify({ logger: true })

// CORS — разрешаем запросы от Mini App
app.register(require('@fastify/cors'), {
  origin: true,
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
app.register(require('./routes/admin'), { prefix: '/admin' })

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

// Запуск сервера
const start = async () => {
  try {
    await app.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' })
    console.log('Сервер запущен на порту', process.env.PORT || 3000)
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
