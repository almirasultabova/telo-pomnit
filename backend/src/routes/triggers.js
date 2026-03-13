const db = require('../db')
const { requireAuth } = require('../services/auth')

async function triggerRoutes(app) {
  // GET /triggers — список
  app.get('/triggers', { preHandler: requireAuth }, async (request) => {
    const { limit = 20, offset = 0 } = request.query
    return db.triggerEntry.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    })
  })

  // POST /triggers — создать запись
  app.post('/triggers', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['situation', 'reactionType', 'intensity'],
        properties: {
          situation: { type: 'string' },
          reactionType: { type: 'string', enum: ['freeze', 'fight', 'flight', 'fawn'] },
          zone: { type: 'string' },
          sensations: { type: 'array', items: { type: 'string' } },
          intensity: { type: 'integer', minimum: 1, maximum: 10 },
          note: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { situation, reactionType, zone, sensations = [], intensity, note } = request.body
    return db.triggerEntry.create({
      data: {
        userId: request.user.id,
        situation,
        reactionType,
        zone,
        sensations,
        intensity,
        note
      }
    })
  })

  // GET /triggers/stats — статистика по типам реакций и зонам
  app.get('/triggers/stats', { preHandler: requireAuth }, async (request) => {
    const entries = await db.triggerEntry.findMany({
      where: { userId: request.user.id },
      select: { reactionType: true, zone: true, createdAt: true }
    })

    const byReaction = {}
    const byZone = {}

    entries.forEach(e => {
      byReaction[e.reactionType] = (byReaction[e.reactionType] || 0) + 1
      if (e.zone) byZone[e.zone] = (byZone[e.zone] || 0) + 1
    })

    return { byReaction, byZone, total: entries.length }
  })
}

module.exports = triggerRoutes
