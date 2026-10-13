const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')
const preAnswersSchema = require('../questionnaire-pre-schema.json')
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
    schema: {
      body: {
        type: 'object',
        required: ['streamId', 'answers'],
        properties: {
          streamId: { type: 'string' },
          answers: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => withActiveUser(request, async db => {
    const { streamId, answers } = request.body

    const existing = await db.questionnaire.findFirst({
      where: { userId: request.user.id, streamId, type: 'post' }
    })
    if (existing) {
      return reply.code(400).send({ error: 'Анкета уже заполнена' })
    }

    return db.questionnaire.create({
      data: { userId: request.user.id, streamId, type: 'post', answers }
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
