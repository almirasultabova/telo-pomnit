// Private preparation for a group discussion. Never sends content to hosts or AI.
const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')
const fields = { id: true, clientId: true, text: true, done: true, revision: true, createdAt: true, updatedAt: true,
  sourceType: true, sourceId: true, sourceLabel: true, sourceDay: true, excerpt: true }
const types = { body: 'diaryEntry', state: 'checkin', reaction: 'triggerEntry', meeting: 'afterMeetingNote' }
const day = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date))
function present(row) {
  const { sourceType, sourceId, sourceLabel, sourceDay, excerpt, ...value } = row
  return { ...value, source: sourceType ? { type: sourceType, id: sourceId, label: sourceLabel, day: sourceDay, excerpt } : null }
}
const params = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }
const source = { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['type', 'id', 'excerpt'], properties: {
  type: { type: 'string', enum: Object.keys(types) }, id: { type: 'string', format: 'uuid' }, excerpt: { type: 'string', minLength: 1, maxLength: 6000 }
} }] }
const properties = { text: { type: 'string', maxLength: 6000 }, source, done: { type: 'boolean' } }
const emptySource = { sourceType: null, sourceId: null, sourceLabel: '', sourceDay: '', excerpt: '' }
async function content(tx, userId, body, previous) {
  const text = body.text.trim(), input = body.source
  if (!text && !input?.excerpt.trim()) return { error: 'Добавьте текст или фрагмент заметки.' }
  if (!input) return { data: { text, ...emptySource } }
  if (!input.excerpt.trim()) return { error: 'Фрагмент пустой. Добавьте текст или уберите его.' }
  // A saved snapshot remains valid even if the original has subsequently been removed.
  if (previous?.sourceType === input.type && previous.sourceId === input.id) return { data: { text,
    sourceType: input.type, sourceId: input.id, sourceLabel: previous.sourceLabel, sourceDay: previous.sourceDay, excerpt: input.excerpt.trim() } }
  const original = await tx[types[input.type]].findFirst({ where: { id: input.id, userId } })
  if (!original) return { error: 'Исходная заметка недоступна. Выберите другую запись или сохраните свой текст без фрагмента.' }
  const label = input.type === 'meeting' ? original.kind === 'analysis' ? 'После разбора' : 'После практики'
    : { body: 'Наблюдение за телом', state: 'Отметка состояния', reaction: 'Моя реакция' }[input.type]
  return { data: { text, sourceType: input.type, sourceId: input.id, sourceLabel: label,
    sourceDay: input.type === 'meeting' ? original.meetingDate.toISOString().slice(0, 10) : day(original.createdAt), excerpt: input.excerpt.trim() } }
}
const own = (tx, request) => tx.discussionNote.findFirst({ where: { id: request.params.id, userId: request.user.id }, select: fields })
const same = (row, data) => Object.keys(data).every(key => row[key] === data[key])
async function discussionRoutes(app) {
  app.addHook('onSend', async (request, reply, payload) => { reply.header('Cache-Control', 'private, no-store'); return payload })
  app.get('/discussion-notes', { preHandler: requireAuth, schema: { querystring: { type: 'object', additionalProperties: false,
    properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }, offset: { type: 'integer', minimum: 0, default: 0 } } } } },
  async (request, reply) => {
    try { return (await db.discussionNote.findMany({ where: { userId: request.user.id }, select: fields,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: request.query.limit, skip: request.query.offset })).map(present) }
    catch { return reply.code(503).send({ error: 'Не удалось загрузить записи к разбору. Попробуйте ещё раз.' }) }
  })
  app.get('/discussion-notes/:id', { preHandler: requireAuth, schema: { params } }, async (request, reply) => {
    try { const row = await own(db, request); return row ? present(row) : reply.code(404).send({ error: 'Запись не найдена.' }) }
    catch { return reply.code(503).send({ error: 'Не удалось открыть запись. Попробуйте ещё раз.' }) }
  })
  app.post('/discussion-notes', { preHandler: requireAuth, schema: { body: { type: 'object', additionalProperties: false,
    required: ['text', 'source', 'clientId'], properties: { text: properties.text, source, clientId: { type: 'string', format: 'uuid' } } } } },
  async (request, reply) => withActiveUser(request, async tx => {
    const body = request.body, previous = await tx.discussionNote.findUnique({ where: { userId_clientId: { userId: request.user.id, clientId: body.clientId } }, select: fields })
    const result = await content(tx, request.user.id, body, previous)
    if (result.error) return reply.code(400).send({ error: result.error })
    if (previous) return same(previous, result.data) ? present(previous) : reply.code(409).send({ code: 'CLIENT_ID_CONFLICT', error: 'Эта запись уже сохранена с другим текстом. Откройте список к разбору.' })
    return present(await tx.discussionNote.create({ data: { ...result.data, userId: request.user.id, clientId: body.clientId }, select: fields }))
  }))
  app.put('/discussion-notes/:id', { preHandler: requireAuth, schema: { params, body: { type: 'object', additionalProperties: false,
    required: ['revision'], properties: { ...properties, revision: { type: 'integer', minimum: 1 } },
    anyOf: [{ required: ['text', 'source'] }, { required: ['done'] }], dependencies: { text: ['source'], source: ['text'] }
  } } }, async (request, reply) => withActiveUser(request, async tx => {
    const previous = await own(tx, request), body = request.body
    if (!previous) return reply.code(404).send({ error: 'Запись не найдена.' })
    let data = {}
    if ('text' in body) { const result = await content(tx, request.user.id, body, previous); if (result.error) return reply.code(400).send({ error: result.error }); data = result.data }
    if ('done' in body) data.done = body.done
    if (same(previous, data)) return present(previous)
    if (previous.revision !== body.revision) return reply.code(409).send({ code: 'NOTE_CHANGED', error: 'Запись изменилась на другом устройстве. Текст остался у вас. Обновите сохранённую запись перед повтором.' })
    return present(await tx.discussionNote.update({ where: { id: previous.id }, data: { ...data, revision: { increment: 1 } }, select: fields }))
  }))
}
module.exports = discussionRoutes
