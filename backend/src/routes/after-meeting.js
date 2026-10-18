const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')

const eventFields = { id: true, clientId: true, type: true, text: true, stepText: true, previousStep: true, createdAt: true }
const fields = { id: true, kind: true, meetingDate: true, text: true, clientId: true, revision: true, createdAt: true, updatedAt: true,
  stepText: true, stepPaused: true, stepEvents: { select: eventFields, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } }
const present = ({ stepEvents, ...row }) => ({ ...row, meetingDate: row.meetingDate.toISOString().slice(0, 10),
  events: stepEvents.map(({ createdAt, previousStep, ...event }) => ({ ...event, from: previousStep, date: createdAt.toISOString() })) })
const properties = { kind: { type: 'string', enum: ['analysis', 'practice'] }, meetingDate: { type: 'string', format: 'date' },
  text: { type: 'string', minLength: 1, maxLength: 20000 }, stepText: { type: 'string', maxLength: 1200 } }
const params = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }
function valid(body) {
  const date = new Date(body.meetingDate + 'T00:00:00Z')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return body.text.trim() && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === body.meetingDate && body.meetingDate <= today
}
const same = (row, body) => row.kind === body.kind && row.meetingDate.toISOString().slice(0, 10) === body.meetingDate && row.text === body.text.trim() &&
  (body.stepText === undefined || row.stepText === body.stepText.trim())
const own = (tx, request) => tx.afterMeetingNote.findFirst({ where: { id: request.params.id, userId: request.user.id }, select: fields })
const changed = reply => reply.code(409).send({ code: 'NOTE_CHANGED', error: 'Запись изменилась на другом устройстве. Текст остался у вас. Обновите запись перед повторным сохранением.' })
async function stepChange(tx, userId, noteId, before, after) {
  if (before && before !== after) await tx.afterMeetingStepEvent.create({ data: { userId, noteId, type: 'change', previousStep: before, stepText: after, text: after } })
}
async function afterMeetingRoutes(app) {
  app.addHook('onSend', async (request, reply, payload) => { reply.header('Cache-Control', 'private, no-store'); return payload })
  app.get('/after-meeting-notes', { preHandler: requireAuth, schema: { querystring: {
    type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }, offset: { type: 'integer', minimum: 0, default: 0 } }
  } } }, async (request, reply) => {
    try { return (await db.afterMeetingNote.findMany({ where: { userId: request.user.id }, select: fields,
      orderBy: [{ meetingDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: request.query.limit, skip: request.query.offset })).map(present) }
    catch { return reply.code(503).send({ error: 'Не удалось загрузить заметки. Попробуйте ещё раз.' }) }
  })
  app.get('/after-meeting-notes/:id', { preHandler: requireAuth, schema: { params } }, async (request, reply) => {
    try { const row = await own(db, request); return row ? present(row) : reply.code(404).send({ error: 'Заметка не найдена.' }) }
    catch { return reply.code(503).send({ error: 'Не удалось открыть заметку. Попробуйте ещё раз.' }) }
  })
  app.post('/after-meeting-notes', { preHandler: requireAuth, schema: { body: { type: 'object', additionalProperties: false,
    required: ['kind', 'meetingDate', 'text', 'clientId'], properties: { ...properties, clientId: { type: 'string', format: 'uuid' } } }
  } }, async (request, reply) => {
    const body = { ...request.body, stepText: (request.body.stepText || '').trim() }
    if (!valid(body)) return reply.code(400).send({ error: 'Добавьте текст и проверьте дату встречи.' })
    return withActiveUser(request, async tx => {
      const old = await tx.afterMeetingNote.findUnique({ where: { userId_clientId: { userId: request.user.id, clientId: body.clientId } }, select: fields })
      if (old) return same(old, body) ? present(old) : reply.code(409).send({ code: 'CLIENT_ID_CONFLICT', error: 'Эта заметка уже сохранена с другим текстом. Откройте её в Дневнике.' })
      return present(await tx.afterMeetingNote.create({ data: { userId: request.user.id, clientId: body.clientId,
        kind: body.kind, meetingDate: new Date(body.meetingDate + 'T00:00:00Z'), text: body.text.trim(), stepText: body.stepText }, select: fields }))
    })
  })
  app.put('/after-meeting-notes/:id', { preHandler: requireAuth, schema: { params, body: { type: 'object', additionalProperties: false,
    required: ['kind', 'meetingDate', 'text', 'revision'], properties: { ...properties, revision: { type: 'integer', minimum: 1 } } }
  } }, async (request, reply) => {
    const body = request.body
    if (!valid(body)) return reply.code(400).send({ error: 'Добавьте текст и проверьте дату встречи.' })
    return withActiveUser(request, async tx => {
      const old = await own(tx, request)
      if (!old) return reply.code(404).send({ error: 'Заметка не найдена.' })
      if (same(old, body)) return present(old)
      if (old.revision !== body.revision) return changed(reply)
      const stepText = body.stepText === undefined ? old.stepText : body.stepText.trim()
      await stepChange(tx, request.user.id, old.id, old.stepText, stepText)
      return present(await tx.afterMeetingNote.update({ where: { id: old.id }, data: { kind: body.kind,
        meetingDate: new Date(body.meetingDate + 'T00:00:00Z'), text: body.text.trim(), stepText, stepPaused: stepText ? old.stepPaused : false, revision: { increment: 1 } }, select: fields }))
    })
  })
  app.put('/after-meeting-notes/:id/step', { preHandler: requireAuth, schema: { params, body: {
    type: 'object', additionalProperties: false, required: ['revision'], anyOf: [{ required: ['stepText'] }, { required: ['stepPaused'] }],
    properties: { stepText: properties.stepText, stepPaused: { type: 'boolean' }, revision: { type: 'integer', minimum: 1 } }
  } } }, async (request, reply) => withActiveUser(request, async tx => {
    const old = await own(tx, request), body = request.body
    if (!old) return reply.code(404).send({ error: 'Заметка не найдена.' })
    const stepText = body.stepText === undefined ? old.stepText : body.stepText.trim()
    const stepPaused = stepText ? body.stepPaused === undefined ? old.stepPaused : body.stepPaused : false
    if (!stepText && body.stepPaused) return reply.code(400).send({ error: 'Сначала добавьте личный шаг.' })
    if (stepText === old.stepText && stepPaused === old.stepPaused) return present(old)
    if (old.revision !== body.revision) return changed(reply)
    await stepChange(tx, request.user.id, old.id, old.stepText, stepText)
    return present(await tx.afterMeetingNote.update({ where: { id: old.id }, data: { stepText, stepPaused, revision: { increment: 1 } }, select: fields }))
  }))
  app.post('/after-meeting-notes/:id/observations', { preHandler: requireAuth, schema: { params, body: {
    type: 'object', additionalProperties: false, required: ['clientId', 'text', 'stepText'], properties: {
      clientId: { type: 'string', format: 'uuid' }, text: { type: 'string', minLength: 1, maxLength: 4000 }, stepText: { type: 'string', minLength: 1, maxLength: 1200 }
    }
  } } }, async (request, reply) => {
    const body = request.body
    if (!body.text.trim()) return reply.code(400).send({ error: 'Напишите наблюдение перед сохранением.' })
    return withActiveUser(request, async tx => {
      const old = await own(tx, request)
      if (!old) return reply.code(404).send({ error: 'Заметка не найдена.' })
      const existing = await tx.afterMeetingStepEvent.findUnique({ where: { userId_clientId: { userId: request.user.id, clientId: body.clientId } } })
      if (existing) return existing.noteId === old.id && existing.text === body.text.trim() && existing.stepText === body.stepText.trim()
        ? present(old) : reply.code(409).send({ code: 'CLIENT_ID_CONFLICT', error: 'Это наблюдение уже сохранено с другим текстом.' })
      if (!old.stepText || old.stepText !== body.stepText.trim()) return reply.code(409).send({ code: 'STEP_CHANGED', error: 'Личный шаг изменился. Проверьте его новую формулировку перед сохранением наблюдения.' })
      await tx.afterMeetingStepEvent.create({ data: { userId: request.user.id, noteId: old.id, clientId: body.clientId, type: 'observation', text: body.text.trim(), stepText: old.stepText } })
      return present(await tx.afterMeetingNote.update({ where: { id: old.id }, data: { revision: { increment: 1 } }, select: fields }))
    })
  })
}
module.exports = afterMeetingRoutes
