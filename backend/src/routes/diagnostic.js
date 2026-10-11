const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')
const Habitual = require('../services/habitual')

async function diagnosticRoutes(app) {
  // GET /diagnostic/result — последний результат
  app.get('/diagnostic/result', { preHandler: requireAuth }, async (request) => {
    return db.diagnosticResult.findFirst({
      where: { userId: request.user.id, patternId: { in: ['freeze', 'fight', 'flight', 'fawn'] } },
      orderBy: { createdAt: 'desc' }
    })
  })

  // POST /diagnostic/result — сохранить результат
  app.post('/diagnostic/result', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['patternId', 'scores'],
        properties: {
          patternId: { type: 'string', enum: ['freeze', 'fight', 'flight', 'fawn'] },
          scores: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const { patternId, scores } = request.body
    return withActiveUser(request, tx => tx.diagnosticResult.create({
      data: {
        userId: request.user.id,
        patternId,
        scores
      }
    }))
  })

  app.get('/habitual/result', { preHandler: requireAuth }, async request => {
    const row = await db.diagnosticResult.findFirst({ where: { userId: request.user.id, patternId: Habitual.version }, orderBy: { createdAt: 'desc' } })
    return row ? { ...Habitual.calculate(row.scores.answers), clientId: row.id, date: row.createdAt } : null
  })
  app.post('/habitual/result', {
    preHandler: requireAuth,
    schema: { body: { type: 'object', additionalProperties: false, required: ['version', 'clientId', 'answers'], properties: {
      version: { type: 'string', enum: [Habitual.version] },
      clientId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' },
      answers: { type: 'array', minItems: 16, maxItems: 16, items: { type: 'integer', minimum: 0, maximum: 6 } }
    } } }
  }, async (request, reply) => {
    const { clientId, answers } = request.body
    const result = Habitual.calculate(answers)
    const conflict = () => reply.code(409).send({ error: 'Этот результат уже сохранён с другими ответами' })
    try {
      return await withActiveUser(request, async tx => {
        const previous = await tx.diagnosticResult.findUnique({ where: { id: clientId } })
        if (previous) {
          if (previous.userId !== request.user.id || previous.patternId !== Habitual.version || JSON.stringify(previous.scores.answers) !== JSON.stringify(answers)) return conflict()
          return { ...result, clientId, date: previous.createdAt }
        }
        const row = await tx.diagnosticResult.create({ data: { id: clientId, userId: request.user.id, patternId: Habitual.version, scores: result } })
        return { ...result, clientId, date: row.createdAt }
      })
    } catch (error) {
      if (error.code !== 'P2002') throw error
      return withActiveUser(request, async tx => {
        const row = await tx.diagnosticResult.findUnique({ where: { id: clientId } })
        if (!row || row.userId !== request.user.id || row.patternId !== Habitual.version || JSON.stringify(row.scores.answers) !== JSON.stringify(answers)) return conflict()
        return { ...result, clientId, date: row.createdAt }
      })
    }
  })
}

module.exports = diagnosticRoutes
