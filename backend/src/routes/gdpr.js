const db = require('../db')
const { requireDataRights } = require('../services/auth')
const { createDiaryPdf } = require('../services/diary-pdf')
const personalModels = ['diaryEntry','triggerEntry','checkin','diagnosticResult','questionnaire','aiChatSession','feedback','afterMeetingStepEvent','afterMeetingNote','diaryImportant']
const ownRows = rows => rows.map(({ userId, ...row }) => row)
async function gdprRoutes(app) {
  app.get('/diary.pdf', { preHandler: requireDataRights }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store')
    try {
      const expectedUser = request.user
      const entries = await db.diaryEntry.findMany({ where: { userId: request.user.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { createdAt: true, zone: true, sensations: true, note: true } })
      const exportedAt = new Date()
      const pdf = await createDiaryPdf(entries, { exportedAt, accountDeleted: Boolean(request.user.deletedAt) })
      // Layout may span many pages: verify expiry, signature and token purpose again afterwards.
      await requireDataRights(request, reply)
      if (reply.sent) return reply
      // Share the deletion lock only for the final check and response hand-off, never for PDF layout.
      return await db.$transaction(async tx => {
        await tx.$queryRawUnsafe('SELECT id FROM users WHERE id = $1 FOR UPDATE', request.user.id)
        const user = await tx.user.findUnique({ where: { id: request.user.id } })
        if (!user || user.tokenVersion !== expectedUser.tokenVersion || Boolean(user.deletedAt) !== Boolean(expectedUser.deletedAt) ||
            (user.deletedAt && request.authPurpose !== 'data-rights')) {
          return reply.code(401).send({ error: 'Проверка личности изменилась. Откройте приложение заново.' })
        }
        const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(exportedAt)
        return reply.header('Cache-Control', 'private, no-store').header('Content-Disposition', `attachment; filename="dnevnik-tela-${date}.pdf"`)
          .type('application/pdf').send(pdf)
      })
    } catch {
      return reply.code(503).send({ error: 'Не удалось подготовить PDF. Попробуйте ещё раз.' })
    }
  })
  app.get('/my-data', { preHandler: requireDataRights }, async request => {
    const userId = request.user.id
    const [user, diary, triggers, checkins, diagnostic, questionnaires, aiSessions, feedback, enrollments, afterMeetingNotes, diaryImportant, afterMeetingStepEvents] = await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      ...personalModels.slice(0,5).map(model => db[model].findMany({ where: { userId } })),
      db.aiChatSession.findMany({ where: { userId } }), db.feedback.findMany({ where: { userId } }),
      db.enrollment.findMany({ where: { userId }, select: { id: true, streamId: true, status: true, paymentId: true, paidAt: true, accessExpires: true, accessBasis: true, createdAt: true } }),
      db.afterMeetingNote.findMany({ where: { userId } }),
      db.diaryImportant.findMany({ where: { userId } }),
      db.afterMeetingStepEvent.findMany({ where: { userId } })
    ])
    const paymentIds = [...new Set(enrollments.map(row => row.paymentId).filter(Boolean))]
    const paymentOrders = paymentIds.length ? await db.paymentOrder.findMany({ where: { paymentId: { in: paymentIds } },
      select: { paymentId: true, amount: true, currency: true, streamId: true, email: true, name: true, telegramUsername: true, processedAt: true, createdAt: true } }) : []
    return {
      exportVersion: 'personal-data-v1', exportedAt: new Date().toISOString(), accountDeleted: Boolean(user.deletedAt),
      profile: { id: user.id, telegramId: String(user.telegramId), name: user.name, firstName: user.firstName,
        lastName: user.lastName, username: user.username, telegramUsername: user.telegramUsername, phone: user.phone,
        photoUrl: user.photoUrl, notificationsEnabled: user.notificationsEnabled, notificationsTime: user.notificationsTime,
        dailyReminderAttemptDay: user.dailyReminderAttemptDay, questionnaireReminderAttemptDay: user.questionnaireReminderAttemptDay,
        createdAt: user.createdAt, deletedAt: user.deletedAt, accessStatus: user.accessStatus,
        role: user.role, lastSeenAt: user.lastSeenAt, accessRequestedAt: user.accessRequestedAt, accessDecidedAt: user.accessDecidedAt, accessNotifiedAt: user.accessNotifiedAt,
        consentGivenAt: user.consentGivenAt, consentText: user.consentText, consentVersion: user.consentVersion, consentSource: user.consentSource },
      afterMeetingStepEvents: ownRows(afterMeetingStepEvents), diaryImportant: ownRows(diaryImportant), afterMeetingNotes: ownRows(afterMeetingNotes), diary: ownRows(diary), triggers: ownRows(triggers), checkins: ownRows(checkins), diagnostic: ownRows(diagnostic),
      questionnaires: ownRows(questionnaires), aiSessions: ownRows(aiSessions), feedback: ownRows(feedback), enrollments, paymentOrders,
      scope: { database: 'owned-application-records', unlinkedFinancialRecords: 'not-attributed-by-username',
        unlinkedWaitlistRecords: 'not-linked-to-account-id',
        backups: 'retention-not-verified', externalProviderCopies: 'outside-this-export' }
    }
  })
  app.delete('/delete-me', { preHandler: requireDataRights, schema: { body: { type: 'object', required: ['confirm'], properties: { confirm: { type: 'string', const: 'DELETE_MY_DATA' } } } } }, async (request, reply) => {
    if (request.authPurpose !== 'data-rights') return reply.code(403).send({ error: 'Подтвердите личность заново перед удалением', code: 'DATA_RIGHTS_TOKEN_REQUIRED' })
    const userId = request.user.id
    await db.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT id FROM users WHERE id = $1 FOR UPDATE', userId)
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user || user.tokenVersion !== request.user.tokenVersion) throw Object.assign(new Error('Проверка личности изменилась'), { statusCode: 401 })
      // A fresh deleted-account token may repeat this request safely after a lost response.
      if (user.deletedAt) return
      await tx.accessAction.deleteMany({where:{OR:[{actorId:userId},{targetId:userId}]}})
      await tx.accessNotice.deleteMany({where:{targetId:userId}})
      const enrollments = await tx.enrollment.findMany({ where: { userId }, select: { paymentId: true } })
      const paymentIds = enrollments.map(row => row.paymentId).filter(Boolean)
      for (const model of personalModels) await tx[model].deleteMany({ where: { userId } })
      if (paymentIds.length) {
        await tx.pendingEnrollment.deleteMany({ where: { paymentId: { in: paymentIds } } })
        await tx.paymentOrder.updateMany({ where: { paymentId: { in: paymentIds } }, data: { name: null, telegramUsername: '[deleted]' } })
      }
      await tx.user.update({ where: { id: userId }, data: {
        name: null, firstName: null, lastName: null, username: null, telegramUsername: null,
        phone: null, photoUrl: null, lastSeenAt: null, preferredAppUrl: null, admissionDeliveredIds: [], admissionLeaseUntil: null, notificationsEnabled: false, notificationsTime: '20:00',
        dailyReminderAttemptDay: null, questionnaireReminderAttemptDay: null,
        consentText: null, accessStatus: 'rejected', accessRequestedAt: null, accessNotifiedAt: null,
        accessDecidedAt: null, accessDecidedBy: null, deletedAt: new Date(), tokenVersion: { increment: 1 }
      } })
    })
    return { success: true, accountDeleted: true,
      message: 'Личные записи и диалоги удалены из рабочей базы. Аккаунт закрыт. Платёжные сведения и минимальная отметка аккаунта сохранены; сроки хранения резервных копий требуют отдельной проверки.',
      retained: { financialRecords: true, accountTombstone: true, backups: 'retention-not-verified', externalProviderCopies: 'outside-app-control' } }
  })
}
module.exports = gdprRoutes
