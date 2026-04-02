const db = require('../db')
const { requireAuth } = require('../services/auth')

async function meRoutes(app) {
  // GET /me — профиль + текущий поток + стрик
  app.get('/me', { preHandler: requireAuth }, async (request) => {
    const user = request.user

    const enrollment = await db.enrollment.findFirst({
      where: { userId: user.id, status: { in: ['active', 'completed'] } },
      orderBy: { createdAt: 'desc' },
      include: { stream: { include: { meetings: { orderBy: { number: 'asc' } } } } }
    })

    // Считаем стрик — сколько дней подряд были записи
    const entries = await db.diaryEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    })

    // Дедуплицируем по дате (несколько записей в один день = 1 день стрика)
    const uniqueDays = [...new Set(entries.map(e => {
      const d = new Date(e.createdAt)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }))].sort((a, b) => b - a)

    let streak = 0
    const todayMs = new Date().setHours(0, 0, 0, 0)

    for (const dayMs of uniqueDays) {
      const diff = (todayMs - dayMs) / (1000 * 60 * 60 * 24)
      if (diff === streak) streak++
      else break
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        photoUrl: user.photoUrl,
        telegramUsername: user.telegramUsername,
        notificationsTime: user.notificationsTime
      },
      enrollment: enrollment ? {
        status: enrollment.status,
        stream: {
          id: enrollment.stream.id,
          name: enrollment.stream.name,
          startDate: enrollment.stream.startDate,
          endDate: enrollment.stream.endDate,
          zoomLink: enrollment.stream.zoomLink,
          chatLink: enrollment.stream.chatLink,
          meetings: enrollment.stream.meetings
        },
        canWrite: enrollment.status === 'active'
      } : null,
      streak
    }
  })

  // PATCH /me — обновить имя или время уведомлений
  app.patch('/me', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 100 },
          notificationsTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }
        }
      }
    }
  }, async (request) => {
    const { name, notificationsTime } = request.body
    const updated = await db.user.update({
      where: { id: request.user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(notificationsTime !== undefined && { notificationsTime })
      }
    })
    return { name: updated.name, notificationsTime: updated.notificationsTime }
  })

  // GET /me/enrollment — статус доступа
  app.get('/me/enrollment/access', { preHandler: requireAuth }, async (request) => {
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
    const isAdmin = adminIds.includes(String(request.user.telegramId))
    if (isAdmin) {
      return { hasAccess: true, canWrite: true }
    }

    // Демо-режим: временный доступ для всех до указанной даты
    const demoUntil = process.env.DEMO_MODE_UNTIL
    if (demoUntil && new Date() < new Date(demoUntil)) {
      return { hasAccess: true, canWrite: true }
    }

    const enrollment = await db.enrollment.findFirst({
      where: { userId: request.user.id, status: { in: ['active', 'completed'] } },
      orderBy: { createdAt: 'desc' }
    })
    return {
      hasAccess: !!enrollment,
      canWrite: enrollment?.status === 'active'
    }
  })
}

module.exports = meRoutes
