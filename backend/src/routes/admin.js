const db = require('../db')
const { requireAdmin } = require('../services/auth')

async function adminRoutes(app) {
  // GET /admin/streams — все потоки
  app.get('/admin/streams', { preHandler: requireAdmin }, async () => {
    return db.stream.findMany({ orderBy: { startDate: 'desc' } })
  })

  // POST /admin/streams — создать поток
  app.post('/admin/streams', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'startDate', 'endDate'],
        properties: {
          name: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          zoomLink: { type: 'string' },
          chatLink: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { name, startDate, endDate, zoomLink, chatLink } = request.body
    return db.stream.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        zoomLink,
        chatLink
      }
    })
  })

  // PATCH /admin/streams/:id — обновить поток
  app.patch('/admin/streams/:id', { preHandler: requireAdmin }, async (request) => {
    return db.stream.update({
      where: { id: request.params.id },
      data: request.body
    })
  })

  // GET /admin/streams/:id/participants — участницы потока
  app.get('/admin/streams/:id/participants', { preHandler: requireAdmin }, async (request) => {
    return db.enrollment.findMany({
      where: { streamId: request.params.id },
      include: {
        user: { select: { id: true, name: true, telegramUsername: true, phone: true, createdAt: true } }
      }
    })
  })

  // GET /admin/participants — все участницы
  app.get('/admin/participants', { preHandler: requireAdmin }, async (request) => {
    const { search } = request.query
    return db.user.findMany({
      where: {
        deletedAt: null,
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { telegramUsername: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } }
          ]
        } : {})
      },
      include: { enrollments: { include: { stream: true } } },
      orderBy: { createdAt: 'desc' }
    })
  })

  // GET /admin/participants/:id — профиль участницы
  app.get('/admin/participants/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user = await db.user.findUnique({
      where: { id: request.params.id },
      include: {
        enrollments: { include: { stream: true } },
        questionnaires: true,
        diagnosticResults: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    })
    if (!user) return reply.code(404).send({ error: 'Участница не найдена' })
    return user
  })

  // POST /admin/meetings — создать встречу
  app.post('/admin/meetings', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['streamId', 'number', 'date'],
        properties: {
          streamId: { type: 'string' },
          number: { type: 'integer' },
          date: { type: 'string' },
          topic: { type: 'string' },
          description: { type: 'string' },
          prepare: { type: 'string' },
          zoomLink: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { streamId, number, date, topic, description, prepare, zoomLink } = request.body
    return db.meeting.create({
      data: { streamId, number, date: new Date(date), topic, description, prepare, zoomLink }
    })
  })

  // PATCH /admin/meetings/:id — обновить встречу
  app.patch('/admin/meetings/:id', { preHandler: requireAdmin }, async (request) => {
    return db.meeting.update({
      where: { id: request.params.id },
      data: request.body
    })
  })

  // ─── Зачисление участниц ─────────────────────────────────────────────────

  // POST /admin/enrollments — зачислить участницу в поток
  // Если запись уже есть — активирует её повторно (например, после отмены)
  app.post('/admin/enrollments', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'streamId'],
        properties: {
          userId:   { type: 'string' },
          streamId: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { userId, streamId } = request.body
    const existing = await db.enrollment.findFirst({ where: { userId, streamId } })
    if (existing) {
      return db.enrollment.update({
        where: { id: existing.id },
        data: { status: 'active', paidAt: new Date() }
      })
    }
    return db.enrollment.create({
      data: { userId, streamId, status: 'active', paidAt: new Date() }
    })
  })

  // PATCH /admin/enrollments/:id — изменить статус (active / completed / cancelled)
  app.patch('/admin/enrollments/:id', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['pending', 'active', 'completed', 'cancelled'] }
        }
      }
    }
  }, async (request, reply) => {
    const enrollment = await db.enrollment.findUnique({ where: { id: request.params.id } })
    if (!enrollment) return reply.code(404).send({ error: 'Запись не найдена' })
    return db.enrollment.update({
      where: { id: request.params.id },
      data: { status: request.body.status }
    })
  })

  // POST /admin/streams/:id/complete — завершить поток: active → completed, isActive = false
  // Вызывается вручную после последней встречи
  app.post('/admin/streams/:id/complete', { preHandler: requireAdmin }, async (request) => {
    const { count } = await db.enrollment.updateMany({
      where: { streamId: request.params.id, status: 'active' },
      data: { status: 'completed' }
    })
    await db.stream.update({
      where: { id: request.params.id },
      data: { isActive: false }
    })
    return { completed: count }
  })
}

module.exports = adminRoutes
