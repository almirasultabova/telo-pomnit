const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')

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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
          zone: { type: 'string', minLength: 1, maxLength: 80 },
          sensations: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 100 } },
          note: { type: 'string', maxLength: 20000 },
          streamId: { type: 'string' },
          clientId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request, reply) => {
    const { zone, sensations = [], note, streamId, clientId, createdAt } = request.body
    const key = { userId: request.user.id, clientId }
    const replay = entry => {
      if (entry.zone !== zone || JSON.stringify(entry.sensations) !== JSON.stringify(sensations) ||
          (entry.note || '') !== (note || '') || (streamId && entry.streamId !== streamId) ||
          (createdAt && new Date(entry.createdAt).getTime() !== new Date(createdAt).getTime())) {
        return reply.code(409).send({ code: 'CLIENT_ID_CONFLICT', error: 'Идентификатор уже связан с другой записью' })
      }
      return entry
    }
    if (clientId) {
      const existing = await db.diaryEntry.findUnique({ where: { userId_clientId: key } })
      if (existing) return replay(existing)
    }
    if (createdAt && new Date(createdAt).getTime() > Date.now() + 300000) {
      return reply.code(400).send({ error: 'Дата записи находится в будущем' })
    }

    // Определяем streamId: из запроса, или из активного зачисления, или из активного потока
    let resolvedStreamId = streamId
    if (!resolvedStreamId) {
      const enrollment = await db.enrollment.findFirst({
        where: { userId: request.user.id, status: 'active' }
      })
      if (enrollment) {
        resolvedStreamId = enrollment.streamId
      } else {
        const stream = await db.stream.findFirst({ where: { isActive: true } })
        resolvedStreamId = stream?.id || null
      }
    }

    let entry
    try { entry = await withActiveUser(request, tx => tx.diaryEntry.create({
      data: {
        userId: request.user.id,
        zone,
        sensations,
        note,
        ...(clientId ? { clientId } : {}),
        ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
        streamId: resolvedStreamId
      }
    })) } catch (err) {
      // Параллельные повторы ограничивает UNIQUE в БД, а не проверка выше.
      if (clientId && err.code === 'P2002') {
        const existing = await db.diaryEntry.findUnique({ where: { userId_clientId: key } })
        if (existing) return replay(existing)
      }
      throw err
    }
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

  // Compact owner-only calendar index; no diary text is returned.
  app.get('/diary/days', { preHandler: requireAuth }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store')
    const rows = await db.diaryEntry.findMany({ where: { userId: request.user.id }, select: { createdAt: true } }).catch(() => null)
    if (!rows) return reply.code(503).send({ error: 'Не удалось загрузить даты наблюдений' })
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' })
    const days = [...new Set(rows.map(row => {
      const parts = formatter.formatToParts(new Date(row.createdAt))
      const part = name => parts.find(p => p.type === name).value
      return `${part('year')}-${part('month')}-${part('day')}`
    }))].sort()
    return { timeZone: 'Europe/Moscow', days }
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
