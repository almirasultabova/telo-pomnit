const db = require('../db')
const { requireAuth } = require('../services/auth')

async function diagnosticRoutes(app) {
  // GET /diagnostic/result — последний результат
  app.get('/diagnostic/result', { preHandler: requireAuth }, async (request) => {
    return db.diagnosticResult.findFirst({
      where: { userId: request.user.id },
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
    return db.diagnosticResult.create({
      data: {
        userId: request.user.id,
        patternId,
        scores
      }
    })
  })
}

module.exports = diagnosticRoutes
