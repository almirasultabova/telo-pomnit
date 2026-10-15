const db = require('../db')

const dailyMessages = [
  'Как тело чувствует себя сегодня?\n\nОдна минута внимания — и запись в дневнике.',
  'Время для короткой практики.\n\nЗамечаете что-то в теле прямо сейчас?',
  'Ежедневная минута с собой.\n\nЧто происходит в теле в этот момент?',
  'Маленький шаг каждый день — это и есть практика.\n\nОткройте дневник и сделайте запись.',
  'Тело говорит постоянно. Сегодня — день его послушать.'
]
const questionnaireMessages = {
  1: '📋 Добро пожаловать в программу «Тело помнит»!\n\nПожалуйста, заполните короткую анкету участницы — займёт около 5 минут. Это поможет нам лучше вас узнать и сделать программу точнее.\n\nОткройте приложение → вкладка «Мой поток» → нажмите на баннер анкеты.',
  3: '📋 Напоминание об анкете\n\nЕсли ещё не заполнили анкету участницы — самое время. Это займёт 5 минут и поможет нам подготовить программу именно для вашей группы.\n\nОткройте приложение → вкладка «Мой поток».',
  5: '📋 Последнее напоминание\n\nАнкета участницы ждёт вас в приложении. После этого напоминания больше не будем беспокоить — но анкету всегда можно заполнить в разделе «Мой поток».'
}

function moscowSlot(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now)
  const get = type => parts.find(part => part.type === type).value
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

const eligible = slot => ({
  notificationsEnabled: true, notificationsTime: slot.time, accessStatus: 'approved', deletedAt: null,
  enrollments: { some: { status: 'active' } }
})
const select = {
  id: true, telegramId: true, notificationsEnabled: true, notificationsTime: true, accessStatus: true, deletedAt: true,
  enrollments: { where: { status: 'active' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, streamId: true, createdAt: true } }
}

function createReminderService({ sendMessage, miniAppUrl }) {
  async function questionnaireText(user, now) {
    // Preserve the existing 1/3/5 full-day rule; only delivery time is changed.
    for (const enrollment of user.enrollments) {
      const day = Math.floor((now.getTime() - new Date(enrollment.createdAt).getTime()) / 86400000)
      if (!questionnaireMessages[day]) continue
      const filled = await db.questionnaire.findFirst({ where: { userId: user.id, streamId: enrollment.streamId, type: 'pre' }, select: { id: true } })
      if (!filled) return questionnaireMessages[day]
    }
    return null
  }

  async function run(kind, now) {
    const slot = moscowSlot(now)
    const field = kind === 'daily' ? 'dailyReminderAttemptDay' : 'questionnaireReminderAttemptDay'
    const result = { due: 0, attempted: 0, sent: 0, skipped: 0, uncertain: 0, errors: 0 }
    let afterId
    try {
      while (true) {
        const users = await db.user.findMany({
          where: { ...eligible(slot), ...(afterId ? { id: { gt: afterId } } : {}) },
          select, orderBy: { id: 'asc' }, take: 200
        })
        for (const user of users) {
          result.due++
          try {
            if (kind === 'questionnaire' && !await questionnaireText(user, now)) continue
            const claimed = await db.user.updateMany({
              where: { ...eligible(slot), id: user.id, OR: [{ [field]: null }, { [field]: { lt: slot.day } }] },
              data: { [field]: slot.day }
            })
            if (!claimed.count) { result.skipped++; continue }
            result.attempted++
            const current = await db.user.findUnique({ where: { id: user.id }, select })
            if (!current || current.deletedAt || current.accessStatus !== 'approved' ||
                !current.notificationsEnabled || current.notificationsTime !== slot.time || !current.enrollments.length) {
              result.skipped++; continue
            }
            const text = kind === 'daily' ? dailyMessages[Math.floor(Math.random() * dailyMessages.length)] : await questionnaireText(current, now)
            if (!text) { result.skipped++; continue }
            // The marker means attempted, never delivered. Keep it after an ambiguous error.
            try {
              const options = kind === 'daily' ? {
                reply_markup: { inline_keyboard: [[{ text: 'Сделать запись', web_app: { url: miniAppUrl } }]] }
              } : {}
              await sendMessage(Number(current.telegramId), text, options)
              result.sent++
            } catch { result.uncertain++ }
            if (result.attempted % 20 === 0) await new Promise(resolve => setTimeout(resolve, 1000))
          } catch { result.errors++ }
        }
        if (users.length < 200) break
        afterId = users[users.length - 1].id
      }
    } catch { result.errors++ }
    return result
  }

  return {
    sendDailyReminder: (now = new Date()) => run('daily', now),
    sendQuestionnaireReminders: (now = new Date()) => run('questionnaire', now)
  }
}

module.exports = { createReminderService, moscowSlot }
