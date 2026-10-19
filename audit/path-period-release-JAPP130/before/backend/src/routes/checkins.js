const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')
const SCALE_KEYS = ['tension', 'anxiety', 'energy', 'safety', 'bodyContact']
function moscowDay(date) {
  return new Date(new Date(date).getTime() + 3 * 3600000).toISOString().slice(0, 10)
}
async function checkinRoutes(app) {
  app.get('/checkins/today', { preHandler: requireAuth }, async request => {
    const dayKey = moscowDay(new Date())
    const daily = await db.checkin.findUnique({ where: { userId_dayKey: { userId: request.user.id, dayKey } } })
    if (daily) return daily
    const start = new Date(dayKey + 'T00:00:00+03:00')
    return db.checkin.findFirst({ where: { userId: request.user.id, createdAt: { gte: start, lt: new Date(start.getTime() + 86400000) } }, orderBy: { createdAt: 'desc' } })
  })
  app.get('/checkins', { preHandler: requireAuth, schema: { querystring: { type: 'object', properties: {
    limit: { type: 'integer', minimum: 1, maximum: 1000, default: 30 }, offset: { type: 'integer', minimum: 0, default: 0 }
  } } } }, request => db.checkin.findMany({ where: { userId: request.user.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: request.query.limit, skip: request.query.offset }))
  app.post('/checkins', { preHandler: requireAuth, schema: { body: {
    type: 'object', properties: {
      ...Object.fromEntries(SCALE_KEYS.map(key => [key, { type: 'integer', minimum: 1, maximum: 10 }])),
      bodyScore: { type: 'integer', minimum: 1, maximum: 10 }, tensionZone: { type: 'string', maxLength: 100 },
      mood: { type: 'string', maxLength: 100 }, note: { type: 'string', maxLength: 20000 },
      createdAt: { type: 'string', format: 'date-time' }, clientUpdatedAt: { type: 'string', format: 'date-time' }
    }, anyOf: [{ required: ['bodyScore'] }, { required: SCALE_KEYS }]
  } } }, async (request, reply) => withActiveUser(request, async db => {
    const body = request.body
    const count = SCALE_KEYS.filter(key => body[key] !== undefined).length
    if (count && count !== 5) return reply.code(400).send({ error: 'Нужны все пять шкал' })
    if (!count) {
      // Compatibility: an old client gives only an average; never invent five answers.
      return db.checkin.create({ data: { userId: request.user.id, bodyScore: body.bodyScore, note: body.note, mood: body.mood, tensionZone: body.tensionZone } })
    }
    const createdAt = new Date(body.createdAt || Date.now())
    const clientUpdatedAt = new Date(body.clientUpdatedAt || createdAt)
    if (createdAt.getTime() > Date.now() + 300000 || clientUpdatedAt.getTime() > Date.now() + 300000 || clientUpdatedAt < createdAt) return reply.code(400).send({ error: 'Неверная дата наблюдения' })
    const dayKey = moscowDay(createdAt)
    const where = { userId_dayKey: { userId: request.user.id, dayKey } }
    const data = { ...Object.fromEntries(SCALE_KEYS.map(key => [key, body[key]])),
      bodyScore: Math.round(SCALE_KEYS.reduce((sum, key) => sum + body[key], 0) / 5),
      note: body.note || '', clientUpdatedAt }
    let row = await db.checkin.findUnique({ where })
    if (!row) {
      // All mutations hold the user's row lock; parallel creates are serialized.
      return db.checkin.create({ data: { userId: request.user.id, dayKey, createdAt, ...data } })
    }
    // The conditional UPDATE is atomic: an old retry cannot overwrite a newer edit.
    await db.checkin.updateMany({ where: { userId: request.user.id, dayKey,
      OR: [{ clientUpdatedAt: null }, { clientUpdatedAt: { lt: clientUpdatedAt } }] }, data })
    row = await db.checkin.findUnique({ where })
    if (row && new Date(row.clientUpdatedAt).getTime() === clientUpdatedAt.getTime() &&
        (SCALE_KEYS.some(key => row[key] !== data[key]) || (row.note || '') !== data.note)) {
      return reply.code(409).send({ code: 'CHECKIN_EDIT_CONFLICT', error: 'Версия наблюдения уже связана с другими ответами' })
    }
    return row
  }))
}
module.exports = checkinRoutes
