const db = require('../db')
const { requireAuth } = require('../services/auth')

async function diaryRoutes(app) {
  // GET /diary — список записей
  app.get('/diary', { preHandler: requireAuth }, async (request) => {
    const { limit = 20, offset = 0, from, to } = request.query
    const entries = await db.diaryEntry.findMany({
      where: {
        userId: request.user.id,
        ...(from || to ? {
          createdAt: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) })
          }
        } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    })
    return entries
  })

  // POST /diary — создать запись
  app.post('/diary', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['zone'],
        properties: {
          zone: { type: 'string' },
          sensations: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
          streamId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    // Проверяем что участница может писать
    const enrollment = await db.enrollment.findFirst({
      where: { userId: request.user.id, status: 'active' }
    })
    if (!enrollment) {
      return reply.code(403).send({ error: 'Запись доступна только активным участницам' })
    }

    const { zone, sensations = [], note, streamId } = request.body
    const entry = await db.diaryEntry.create({
      data: {
        userId: request.user.id,
        zone,
        sensations,
        note,
        streamId: streamId || enrollment.streamId
      }
    })
    return entry
  })

  // GET /diary/stats — статистика
  app.get('/diary/stats', { preHandler: requireAuth }, async (request) => {
    const entries = await db.diaryEntry.findMany({
      where: { userId: request.user.id },
      select: { createdAt: true, zone: true },
      orderBy: { createdAt: 'desc' }
    })

    // Тепловая карта по дням последних 30 дней
    const heatmap = {}
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    entries.forEach(e => {
      if (e.createdAt >= thirtyDaysAgo) {
        const day = e.createdAt.toISOString().split('T')[0]
        heatmap[day] = (heatmap[day] || 0) + 1
      }
    })

    return {
      totalEntries: entries.length,
      heatmap
    }
  })

  // GET /diary/:id — одна запись
  app.get('/diary/:id', { preHandler: requireAuth }, async (request, reply) => {
    const entry = await db.diaryEntry.findFirst({
      where: { id: request.params.id, userId: request.user.id }
    })
    if (!entry) return reply.code(404).send({ error: 'Запись не найдена' })
    return entry
  })
}

module.exports = diaryRoutes
