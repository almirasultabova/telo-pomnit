const db = require('../db')
const { requireAuth, withActiveUser } = require('../services/auth')
const { admissionError } = require('../services/admission')
const { notifyAdminsAboutFeedback } = require('../bot')

async function feedbackRoutes(app) {
  app.post('/feedback', {
    preHandler: requireAuth,
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour' }
    },
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text:   { type: 'string', minLength: 1, maxLength: 2000 },
          rating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
          operationId: { type: 'string', format: 'uuid' }
          ,streamId: {type:'string',format:'uuid',nullable:true},
          needsReply: {type:'boolean'},
          kind: {enum:['technical','programme','schedule','feedback','unknown']}
        }
      }
    }
  }, async (request, reply) => {
    const { text, rating, operationId, streamId=null, needsReply=null, kind='unknown' } = request.body
    const trimmed = text.trim()
    if (!trimmed) return reply.code(400).send({ error: 'Напишите сообщение перед отправкой' })
    const result = await withActiveUser(request, async tx => {
      if (operationId) {
        const existing = await tx.feedback.findUnique({ where: { userId_operationId: { userId: request.user.id, operationId } } })
        if (existing) {
          const scope=existing.submittedScope || existing
          if (existing.text !== trimmed || existing.rating !== (rating ?? null) ||
              scope.streamId!==streamId || scope.needsReply!==needsReply || scope.kind!==kind) {
            return { conflict: true }
          }
          return { feedback: existing, created: false }
        }
      }
      if(streamId){
        const e=await tx.enrollment.findFirst({where:{userId:request.user.id,streamId,status:{in:['active','completed']}}})
        if(!e) return {invalidStream:true}
      }
      const feedback = await tx.feedback.create({
      data: {
        userId: request.user.id,
        text: trimmed,
        rating: rating ?? null,
        streamId,needsReply,kind,status:streamId&&needsReply!==null?(needsReply?'new':'no-reply'):'unclassified',
        submittedScope:{streamId,needsReply,kind},
        ...(operationId ? { operationId } : {})
      }
      })
      return { feedback, created: true }
    })
    if(result.invalidStream) return reply.code(403).send({error:'Выберите свой поток или оставьте «Общие вопросы»'})
    if (result.conflict) return reply.code(409).send({ code: 'OPERATION_CONFLICT', error: 'Эта отправка уже связана с другим сообщением' })
    const { feedback, created } = result

    const current = await db.user.findUnique({ where: { id: request.user.id } })
    if (created && current && !current.deletedAt && current.tokenVersion === request.user.tokenVersion && !admissionError(current)) {
      notifyAdminsAboutFeedback(feedback, current).catch(() => app.log.error('failed to notify admins about feedback'))
    }

    return { ok: true, id: feedback.id }
  })
}

module.exports = feedbackRoutes
