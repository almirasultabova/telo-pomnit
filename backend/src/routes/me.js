const db = require('../db')
const { requireAuth } = require('../services/auth')

async function meRoutes(app) {
  // GET /me — профиль + текущий поток + стрик
  app.get('/me', { preHandler: requireAuth }, async (request) => {
    const user = request.user

    const access = await getProgramAccess(user)
    const stream = access.streams.find(s => s.canAttend) || access.streams.find(s => s.phase === 'upcoming') || access.streams[0]

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
        notificationsTime: user.notificationsTime,
        consentGivenAt: user.consentGivenAt
      },
      enrollment: stream ? { status: stream.status, stream, canWrite: stream.canUseAi } : null,
      streams: access.streams,
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

  // PATCH /me/consent — зафиксировать согласие на обработку данных (ФЗ-152)
  app.patch('/me/consent', { preHandler: requireAuth }, async (request) => {
    const already = await db.user.findUnique({
      where: { id: request.user.id },
      select: { consentGivenAt: true }
    })
    if (already?.consentGivenAt) return { ok: true } // уже зафиксировано

    await db.user.update({
      where: { id: request.user.id },
      data: {
        consentGivenAt: new Date(),
        consentText: 'Согласие на обработку персональных данных в соответствии с ФЗ-152 «О персональных данных»'
      }
    })
    return { ok: true }
  })

  // Free personal tools and paid AI/program rights are independent.
  app.get('/me/enrollment/access', { preHandler: requireAuth }, async (request) => {
    return getProgramAccess(request.user)
  })
}

// Product access is independent from authentication and free personal tools.
// Fixed rollout boundary: existing accounts receive seven days, never reset on login.
const AI_ACCESS_ROLLOUT_AT = Date.parse('2026-09-22T16:00:00+03:00')
const AI_TRANSITION_END = AI_ACCESS_ROLLOUT_AT + 7 * 86400000

function streamBounds(stream) {
  const day = value => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
    const get = type => parts.find(p => p.type === type).value
    return `${get('year')}-${get('month')}-${get('day')}`
  }
  const start = Date.parse(day(stream.startDate) + 'T00:00:00+03:00')
  const lastDay = day(stream.endDate)
  const end = Date.parse(lastDay + 'T00:00:00+03:00') + 86400000
  const [year, month, date] = lastDay.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + 3, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  const recordingDay = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(date, last)).padStart(2, '0')}`
  return { start, end, recordingsEnd: Date.parse(recordingDay + 'T00:00:00+03:00') + 86400000 }
}

async function getProgramAccess(user, now = Date.now()) {
  const all = await db.enrollment.findMany({
    where: { userId: user.id }, orderBy: { createdAt: 'desc' },
    include: { stream: { include: { meetings: { orderBy: { number: 'asc' } } } } }
  })
  const admin = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean).includes(String(user.telegramId))
  // Historical manual enrollments may have no paidAt. Preserve their existing
  // program archive; never extend this compatibility rule to new enrollments.
  const owned = all.filter(e => (e.paidAt || new Date(e.createdAt).getTime() < AI_ACCESS_ROLLOUT_AT) && ['active', 'completed'].includes(e.status))
  const streams = owned.map(e => {
    const bounds = streamBounds(e.stream)
    const revokedByExpiry = e.accessExpires && now >= new Date(e.accessExpires).getTime()
    const live = e.status === 'active' && now >= bounds.start && now < bounds.end && !revokedByExpiry
    const recordings = now >= bounds.start && now < bounds.recordingsEnd && !revokedByExpiry
    return {
      id: e.stream.id, name: e.stream.name, startDate: e.stream.startDate, endDate: e.stream.endDate,
      status: e.status, phase: now < bounds.start ? 'upcoming' : now >= bounds.end ? 'completed' : 'current',
      canUseAi: live, canAttend: live, canReadRecordings: recordings,
      aiExpiresAt: new Date(bounds.end).toISOString(), recordingsExpiresAt: new Date(bounds.recordingsEnd).toISOString(),
      zoomLink: live ? e.stream.zoomLink : null,
      chatLink: recordings ? e.stream.chatLink : null,
      meetings: e.stream.meetings.map(m => ({ id: m.id, number: m.number, date: m.date, topic: m.topic, description: m.description, prepare: m.prepare, zoomLink: live ? m.zoomLink : null }))
    }
  })
  const active = streams.filter(s => s.canUseAi)
  const transition = now < AI_TRANSITION_END && new Date(user.createdAt).getTime() < AI_ACCESS_ROLLOUT_AT && !all.some(e => e.status === 'cancelled')
  const reason = admin ? 'admin' : active.length ? 'program' : transition ? 'transition' : streams.some(s => s.phase === 'upcoming') ? 'not_started' : streams.length ? 'ended' : 'purchase_required'
  const canUseAi = admin || active.length > 0 || transition
  const message = reason === 'transition'
    ? 'AI доступен в переходный период до 29 сентября, 16:00 МСК. Затем — во время оплаченной программы. Дневник и реакции останутся бесплатными.'
    : reason === 'ended' ? 'Программа завершилась. Дневник, реакции и история диалогов остаются доступны; новые сообщения AI — во время следующей оплаченной программы.'
    : reason === 'not_started' ? 'AI откроется в день начала вашей оплаченной программы. Дневник и реакции уже доступны.'
    : reason === 'purchase_required' ? 'Новые сообщения AI доступны во время оплаченной программы. Дневник, реакции и история остаются бесплатными.'
    : reason === 'admin' ? 'Режим ведущей: служебный доступ к AI.' : 'AI доступен во время вашей программы. Дневник и реакции останутся с вами после её завершения.'
  return { hasAccess: true, canWrite: canUseAi, diary: true, reactions: true, checkins: true, aiHistory: true,
    ai: { canWrite: canUseAi, reason, message, expiresAt: reason === 'transition' ? new Date(AI_TRANSITION_END).toISOString() : active.length ? active.map(s => s.aiExpiresAt).sort().pop() : null },
    streams, serverTime: new Date(now).toISOString() }
}

module.exports = meRoutes
module.exports.getProgramAccess = getProgramAccess
module.exports.streamBounds = streamBounds
