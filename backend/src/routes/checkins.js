const db = require('../db')
const { requireAuth } = require('../services/auth')

async function checkinRoutes(app) {
  // GET /checkins/today — сегодняшний чекин
  app.get('/checkins/today', { preHandler: requireAuth }, async (request) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const checkin = await db.checkin.findFirst({
      where: {
        userId: request.user.id,
        createdAt: { gte: today, lt: tomorrow }
      }
    })
    return checkin
  })

  // GET /checkins — список
  app.get('/checkins', { preHandler: requireAuth }, async (request) => {
    const { limit = 30, offset = 0 } = request.query
    return db.checkin.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    })
  })

  // POST /checkins — создать чекин
  app.post('/checkins', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['bodyScore'],
        properties: {
          bodyScore: { type: 'integer', minimum: 1, maximum: 10 },
          tensionZone: { type: 'string' },
          mood: { type: 'string' },
          note: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { bodyScore, tensionZone, mood, note } = request.body
    return db.checkin.create({
      data: {
        userId: request.user.id,
        bodyScore,
        tensionZone,
        mood,
        note
      }
    })
  })
}

module.exports = checkinRoutes
