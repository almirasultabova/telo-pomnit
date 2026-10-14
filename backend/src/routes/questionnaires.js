const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')
const preAnswersSchema = require('../questionnaire-pre-schema.json')
const postAnswersSchema = require('../questionnaire-post-schema.json')
const { isDeepStrictEqual } = require('node:util')

async function questionnaireRoutes(app) {
  // POST /questionnaires/pre — анкета до потока
  app.post('/questionnaires/pre', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['streamId', 'answers'],
        properties: {
          streamId: { type: 'string' },
          answers: preAnswersSchema,
          formVersion: { type: 'integer', enum: [1] }
        }
      }
    }
  }, async (request, reply) => withActiveUser(request, async db => {
    const { streamId, answers } = request.body
    const enrollment = await db.enrollment.findFirst({ where: { userId: request.user.id, streamId, status: 'active' } })
    if (!enrollment) return reply.code(403).send({ error: 'Анкета доступна участницам своего потока' })

    const existing = await db.questionnaire.findFirst({
      where: { userId: request.user.id, streamId, type: 'pre' }
    })
    if (existing) {
      if (isDeepStrictEqual(existing.answers, answers)) return existing
      return reply.code(409).send({ error: 'Анкета уже заполнена' })
    }

    return db.questionnaire.create({
      data: { userId: request.user.id, streamId, type: 'pre', answers, formVersion: 1 }
    })
  }))

  // POST /questionnaires/post — анкета после потока
  app.post('/questionnaires/post', {
    preHandler: requireAuth,
    preValidation: async (request, reply) => {
      const answers = request.body?.answers
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return
      const unknown = Object.keys(answers).some(key => !Object.hasOwn(postAnswersSchema.properties, key))
      const invalidScale = ['bodyContactScale', 'anxietyScale'].some(key =>
        Object.hasOwn(answers, key) && answers[key] !== null &&
        (!Number.isInteger(answers[key]) || answers[key] < 1 || answers[key] > 10))
      if (unknown || invalidScale) return reply.code(400).send({ error: 'Проверьте ответы итоговой анкеты' })
    },
    schema: {
      body: {
        type: 'object',
        required: ['streamId', 'answers'],
        properties: {
          streamId: { type: 'string' },
          answers: postAnswersSchema,
          formVersion: { type: 'integer', enum: [2] }
        }
      }
    }
  }, async (request, reply) => withActiveUser(request, async db => {
    const { streamId, answers } = request.body
    const enrollment = await db.enrollment.findFirst({
      where: { userId: request.user.id, streamId, status: { in: ['active', 'completed'] } },
      include: { stream: true }
    })
    const entitled = enrollment && (enrollment.paidAt || enrollment.accessBasis === 'free' ||
      new Date(enrollment.createdAt).getTime() < Date.parse('2026-09-22T16:00:00+03:00'))
    if (!entitled) return reply.code(403).send({ error: 'Анкета доступна участницам своего потока' })
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(enrollment.stream.endDate))
    const part = type => day.find(value => value.type === type).value
    const end = Date.parse(`${part('year')}-${part('month')}-${part('day')}T00:00:00+03:00`) + 86400000
    if (Date.now() < end) return reply.code(403).send({ error: 'Итоговую анкету можно заполнить после завершения потока' })

    const existing = await db.questionnaire.findFirst({
      where: { userId: request.user.id, streamId, type: 'post' }
    })
    if (existing) {
      if (existing.formVersion === 2 && isDeepStrictEqual(existing.answers, answers)) return existing
      return reply.code(409).send({ error: 'Итоговая анкета уже заполнена. Обновите приложение, чтобы посмотреть сохранённые ответы.' })
    }

    return db.questionnaire.create({
      data: { userId: request.user.id, streamId, type: 'post', answers, formVersion: 2 }
    })
  }))

  // GET /questionnaires/:streamId — мои анкеты для потока
  app.get('/questionnaires/:streamId', { preHandler: requireAuth }, async (request) => {
    const questionnaires = await db.questionnaire.findMany({
      where: { userId: request.user.id, streamId: request.params.streamId }
    })
    const pre = questionnaires.find(q => q.type === 'pre') || null
    const post = questionnaires.find(q => q.type === 'post') || null
    return { pre, post }
  })
}

module.exports = questionnaireRoutes
