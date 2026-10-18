const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')
const labels = require('../../assets/diary-labels.json')
const models = { body: 'diaryEntry', state: 'checkin', reaction: 'triggerEntry', meeting: 'afterMeetingNote' }
const sources = Object.keys(models)
const reactions = { freeze: 'Замирание', fight: 'Нападение', flight: 'Бегство', fawn: 'Угождение' }
const scoreNames = { tension: 'Напряжение', anxiety: 'Тревога', energy: 'Энергия', safety: 'Безопасность', bodyContact: 'Контакт с телом' }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const realDate = s => !s || Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s
const zone = id => labels.zones[id] || id || ''
const sensationNames = ids => (ids || []).map(id => labels.sensations[id] || id)
function present(row) {
  const p = row.payload, source = row.source
  const item = { id: row.id, source, kind: row.kind, day: row.event_day_text, date: new Date(row.created_at).toISOString(), important: row.important }
  if (source === 'body') return { ...item, title: zone(p.zone) || 'Наблюдение за телом', text: p.note || '', tags: sensationNames(p.sensations) }
  if (source === 'meeting') return { ...item, title: row.kind === 'analysis' ? 'После разбора' : 'После практики', text: p.text || '' }
  if (source === 'reaction') return { ...item, title: 'Моя реакция', text: [p.situation, p.note].filter(Boolean).join('\n\n'),
    tags: [reactions[p.reaction_type], zone(p.zone), ...sensationNames(p.sensations)].filter(Boolean), scores: { 'Сила реакции': p.intensity } }
  const scores = Object.fromEntries(Object.entries(scoreNames).filter(([key]) => Number.isInteger(p[key === 'bodyContact' ? 'body_contact' : key])).map(([key, name]) => [name, p[key === 'bodyContact' ? 'body_contact' : key]]))
  if (!Object.keys(scores).length && Number.isInteger(p.body_score)) scores['Оценка состояния'] = p.body_score
  return { ...item, title: 'Моё состояние', text: [p.mood, p.note].filter(Boolean).join('\n\n'), tags: [zone(p.tension_zone)].filter(Boolean), scores }
}

// All branches constrain owner BEFORE filters, pagination and favorite joins.
const union = `WITH history AS (
 SELECT e.id,'body'::text source,'body'::text kind,(e.created_at+interval '3 hours')::date event_day,e.created_at,to_jsonb(e) payload,
 concat_ws(' ','Наблюдение за телом',coalesce($2::jsonb->'zones'->>e.zone,e.zone),e.note,
 (SELECT string_agg(coalesce($2::jsonb->'sensations'->>s,s),' ') FROM unnest(e.sensations) s)) search_text
 FROM diary_entries e WHERE e.user_id=$1
 UNION ALL
 SELECT e.id,'state','state',(e.created_at+interval '3 hours')::date,e.created_at,to_jsonb(e),
 concat_ws(' ','Моё состояние Отметка состояния Напряжение Тревога Энергия Безопасность Контакт с телом',e.mood,e.note) FROM checkins e WHERE e.user_id=$1
 UNION ALL
 SELECT e.id,'reaction','reaction',(e.created_at+interval '3 hours')::date,e.created_at,to_jsonb(e),
 concat_ws(' ','Моя реакция',e.situation,e.note,CASE e.reaction_type::text WHEN 'freeze' THEN 'Замирание' WHEN 'fight' THEN 'Нападение' WHEN 'flight' THEN 'Бегство' WHEN 'fawn' THEN 'Угождение' END,coalesce($2::jsonb->'zones'->>e.zone,e.zone),
 (SELECT string_agg(coalesce($2::jsonb->'sensations'->>s,s),' ') FROM unnest(e.sensations) s)) FROM trigger_entries e WHERE e.user_id=$1
 UNION ALL
 SELECT e.id,'meeting',e.kind,e.meeting_date,e.created_at,to_jsonb(e),concat_ws(' ',CASE e.kind WHEN 'analysis' THEN 'После разбора' ELSE 'После практики' END,e.text)
 FROM after_meeting_notes e WHERE e.user_id=$1
), scoped AS (
 SELECT h.*,f.id IS NOT NULL important FROM history h LEFT JOIN diary_important f ON f.user_id=$1 AND f.source=h.source AND f.entry_id=h.id
)`

async function diaryHistoryRoutes(app) {
  app.addHook('onSend', async (request, reply, payload) => { reply.header('Cache-Control', 'private, no-store'); return payload })
  // Search phrases stay in the request body, never in URL/access logs.
  app.post('/diary-history/search', { preHandler: requireAuth, schema: { body: {
    type: 'object', additionalProperties: false, properties: {
      query: { type: 'string', maxLength: 200, default: '' }, kind: { type: 'string', enum: ['all', 'body', 'state', 'reaction', 'analysis', 'practice'], default: 'all' },
      period: { type: 'string', enum: ['all', 'week', 'month', 'custom'], default: 'all' }, from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' },
      important: { type: 'boolean', default: false }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 }, offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 }
    }
  } } }, async (request, reply) => {
    const body = request.body, day = today()
    if (!realDate(body.from) || !realDate(body.to) || body.period === 'custom' && body.from && body.to && body.from > body.to) return reply.code(400).send({ error: 'Проверьте даты периода.' })
    const words = body.query.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim().split(/\s+/).filter(Boolean)
    if (words.length > 16) return reply.code(400).send({ error: 'Для поиска используйте до 16 слов.' })
    const args = [request.user.id, JSON.stringify(labels)], conditions = []
    const param = value => { args.push(value); return '$' + args.length }
    if (body.kind !== 'all') conditions.push('kind=' + param(body.kind))
    if (body.important) conditions.push('important=true')
    if (body.period === 'week' || body.period === 'month') {
      const since = new Date(day + 'T00:00:00Z'); since.setUTCDate(since.getUTCDate() - (body.period === 'week' ? 6 : 29))
      conditions.push('event_day>=' + param(since.toISOString().slice(0, 10)) + '::date', 'event_day<=' + param(day) + '::date')
    } else if (body.period === 'custom') {
      if (body.from) conditions.push('event_day>=' + param(body.from) + '::date')
      if (body.to) conditions.push('event_day<=' + param(body.to) + '::date')
    }
    for (const word of words) conditions.push("strpos(replace(lower(search_text),'ё','е')," + param(word) + ')>0')
    const filtered = union + ', filtered AS (SELECT * FROM scoped' + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '') + ') '
    try {
      return await db.$transaction(async tx => {
        const counts = await tx.$queryRawUnsafe(filtered + 'SELECT count(*)::int total FROM filtered', ...args)
        const page = await tx.$queryRawUnsafe(filtered + `SELECT *,to_char(event_day,'YYYY-MM-DD') event_day_text FROM filtered ORDER BY event_day DESC,created_at DESC,source ASC,id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, ...args, body.limit, body.offset)
        return { entries: page.map(present), total: counts[0].total, offset: body.offset, hasMore: body.offset + page.length < counts[0].total, today: day }
      }, { isolationLevel: 'RepeatableRead' })
    } catch { return reply.code(503).send({ error: 'Не удалось загрузить историю. Попробуйте ещё раз.' }) }
  })
  const params = { type: 'object', required: ['source', 'id'], properties: { source: { type: 'string', enum: sources }, id: { type: 'string', format: 'uuid' } } }
  app.get('/diary-history/:source/:id', { preHandler: requireAuth, schema: { params } }, async (request, reply) => {
    try {
      const rows = await db.$queryRawUnsafe(union + " SELECT *,to_char(event_day,'YYYY-MM-DD') event_day_text FROM scoped WHERE source=$3 AND id=$4", request.user.id, JSON.stringify(labels), request.params.source, request.params.id)
      if (!rows.length) return reply.code(404).send({ error: 'Запись не найдена.' })
      return present(rows[0])
    } catch { return reply.code(503).send({ error: 'Не удалось открыть запись. Попробуйте ещё раз.' }) }
  })
  app.put('/diary-history/:source/:id/important', { preHandler: requireAuth, schema: { params,
    body: { type: 'object', additionalProperties: false, required: ['important'], properties: { important: { type: 'boolean' } } }
  } }, async (request, reply) => withActiveUser(request, async tx => {
    const { source, id } = request.params, userId = request.user.id
    const own = await tx[models[source]].findFirst({ where: { id, userId }, select: { id: true } })
    if (!own) return reply.code(404).send({ error: 'Запись не найдена.' })
    const key = { userId, source, entryId: id }
    if (request.body.important) await tx.diaryImportant.upsert({ where: { userId_source_entryId: key }, create: key, update: {} })
    else await tx.diaryImportant.deleteMany({ where: key })
    return { source, id, important: request.body.important }
  }))
}
module.exports = diaryHistoryRoutes
