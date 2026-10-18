const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')

const fields = { id: true, kind: true, meetingDate: true, text: true, clientId: true, revision: true, createdAt: true, updatedAt: true }
const present = row => ({ ...row, meetingDate: row.meetingDate.toISOString().slice(0, 10) })
const properties = {
  kind: { type: 'string', enum: ['analysis', 'practice'] },
  meetingDate: { type: 'string', format: 'date' },
  text: { type: 'string', minLength: 1, maxLength: 20000 }
}
function valid(body) {
  const date = new Date(body.meetingDate + 'T00:00:00Z')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return body.text.trim() && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === body.meetingDate && body.meetingDate <= today
}
const same = (row, body) => row.kind === body.kind && row.meetingDate.toISOString().slice(0, 10) === body.meetingDate && row.text === body.text.trim()

async function afterMeetingRoutes(app) {
  app.addHook('onSend', async (request, reply, payload) => { reply.header('Cache-Control', 'private, no-store'); return payload })
  app.get('/after-meeting-notes', { preHandler: requireAuth, schema: { querystring: {
    type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }, offset: { type: 'integer', minimum: 0, default: 0 } }
  } } }, async request => {
    const rows = await db.afterMeetingNote.findMany({ where: { userId: request.user.id }, select: fields,
      orderBy: [{ meetingDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: request.query.limit, skip: request.query.offset })
    return rows.map(present)
  })
  app.post('/after-meeting-notes', { preHandler: requireAuth, schema: { body: {
    type: 'object', additionalProperties: false, required: ['kind', 'meetingDate', 'text', 'clientId'],
    properties: { ...properties, clientId: { type: 'string', format: 'uuid' } }
  } } }, async (request, reply) => {
    const body = request.body
    if (!valid(body)) return reply.code(400).send({ error: 'Добавьте текст и проверьте дату встречи.' })
    return withActiveUser(request, async tx => {
      // The user's row lock serializes duplicate retries, including parallel requests.
      const old = await tx.afterMeetingNote.findUnique({ where: { userId_clientId: { userId: request.user.id, clientId: body.clientId } }, select: fields })
      if (old) return same(old, body) ? present(old) : reply.code(409).send({ code: 'CLIENT_ID_CONFLICT', error: 'Эта заметка уже сохранена с другим текстом. Откройте её в Дневнике.' })
      return present(await tx.afterMeetingNote.create({ data: { userId: request.user.id, clientId: body.clientId,
        kind: body.kind, meetingDate: new Date(body.meetingDate + 'T00:00:00Z'), text: body.text.trim() }, select: fields }))
    })
  })
  app.put('/after-meeting-notes/:id', { preHandler: requireAuth, schema: {
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    body: { type: 'object', additionalProperties: false, required: ['kind', 'meetingDate', 'text', 'revision'],
      properties: { ...properties, revision: { type: 'integer', minimum: 1 } } }
  } }, async (request, reply) => {
    const body = request.body
    if (!valid(body)) return reply.code(400).send({ error: 'Добавьте текст и проверьте дату встречи.' })
    return withActiveUser(request, async tx => {
      const old = await tx.afterMeetingNote.findFirst({ where: { id: request.params.id, userId: request.user.id }, select: fields })
      if (!old) return reply.code(404).send({ error: 'Заметка не найдена.' })
      if (same(old, body)) return present(old) // Lost success response: no second update.
      if (old.revision !== body.revision) return reply.code(409).send({ code: 'NOTE_CHANGED', error: 'Заметка изменилась на другом устройстве. Скопируйте свой текст и откройте её заново.' })
      return present(await tx.afterMeetingNote.update({ where: { id: old.id }, data: { kind: body.kind,
        meetingDate: new Date(body.meetingDate + 'T00:00:00Z'), text: body.text.trim(), revision: { increment: 1 } }, select: fields }))
    })
  })
}
module.exports = afterMeetingRoutes
