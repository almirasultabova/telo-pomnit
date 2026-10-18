const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')

async function triggerRoutes(app) {
  // GET /triggers — список
  app.get('/triggers', { preHandler: requireAuth, schema: { querystring: { type: 'object', properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100 }, offset: { type: 'integer', minimum: 0, maximum: 100000 }
  } } } }, async (request) => {
    const { limit = 20, offset = 0 } = request.query
    return db.triggerEntry.findMany({
      where: { userId: request.user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
          note: { type: 'string' },
          clientId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request, reply) => {
    const { situation, reactionType, zone, sensations = [], intensity, note, clientId, createdAt } = request.body
    if (createdAt && Date.parse(createdAt) > Date.now() + 300000) return reply.code(400).send({ error: 'Дата записи находится в будущем' })
    return withActiveUser(request, async tx => {
      if (clientId) {
        const existing = await tx.triggerEntry.findUnique({ where: { userId_clientId: { userId: request.user.id, clientId } } })
        if (existing) {
          if (existing.situation !== situation || existing.reactionType !== reactionType || existing.intensity !== intensity ||
              (existing.zone || '') !== (zone || '') || (existing.note || '') !== (note || '') ||
              JSON.stringify(existing.sensations) !== JSON.stringify(sensations) ||
              (createdAt && new Date(existing.createdAt).getTime() !== Date.parse(createdAt))) {
            return reply.code(409).send({ code: 'CLIENT_ID_CONFLICT', error: 'Идентификатор уже связан с другой записью' })
          }
          return existing
        }
      }
      return tx.triggerEntry.create({
      data: {
        userId: request.user.id,
        situation,
        reactionType,
        zone,
        sensations,
        intensity,
        note,
        ...(clientId ? { clientId } : {}),
        ...(createdAt ? { createdAt: new Date(createdAt) } : {})
      }
      })
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
