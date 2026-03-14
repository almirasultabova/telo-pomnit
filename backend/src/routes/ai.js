// ai.js — AI чат на основе GPT-4o-mini
// POST /ai/chat — отправить сообщение, получить ответ ассистента

const db = require('../db')
const { requireAuth } = require('../services/auth')
const OpenAI = require('openai')
const { v4: uuidv4 } = require('uuid')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `Ты — мягкий, внимательный помощник программы «Тело помнит». Программа помогает участницам работать с телесными реакциями через соматический подход.

Отвечай тепло, без осуждения, коротко (2–4 предложения). Задавай уточняющие вопросы, помогай замечать ощущения в теле прямо сейчас. Не ставь диагнозы и не давай медицинских рекомендаций. Обращайся к участнице на «вы».

Если переданы данные из дневника — используй их для персонального, точного ответа.`

async function aiRoutes(app) {
  app.post('/ai/chat', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', maxLength: 1000 },
          sessionId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { message, sessionId } = request.body

    // Проверяем активный enrollment
    const enrollment = await db.enrollment.findFirst({
      where: { userId: request.user.id, status: 'active' }
    })
    if (!enrollment) {
      return reply.code(403).send({ error: 'AI-чат доступен только активным участницам программы' })
    }

    // Загружаем или создаём сессию
    let session = null
    if (sessionId) {
      session = await db.aiChatSession.findUnique({ where: { sessionId } })
    }
    const history = session?.messages || []

    // На первом сообщении — добавляем контекст из дневника
    let systemPrompt = SYSTEM_PROMPT
    if (history.length === 0) {
      const recentEntries = await db.diaryEntry.findMany({
        where: { userId: request.user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { createdAt: true, zone: true, sensations: true, note: true }
      })
      if (recentEntries.length) {
        const summary = recentEntries.map(e => {
          const date = new Date(e.createdAt).toLocaleDateString('ru-RU')
          const parts = [`${date}: зона — ${e.zone}`]
          if (e.sensations?.length) parts.push(`ощущения: ${e.sensations.join(', ')}`)
          if (e.note) parts.push(`заметка: «${e.note}»`)
          return parts.join(', ')
        }).join('\n')
        systemPrompt += `\n\nПоследние записи дневника участницы:\n${summary}`
      }
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message }
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 400,
      temperature: 0.7
    })

    const assistantMessage = completion.choices[0].message.content

    const newHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: assistantMessage }
    ]

    const newSessionId = sessionId || uuidv4()
    if (session) {
      await db.aiChatSession.update({
        where: { sessionId: newSessionId },
        data: { messages: newHistory }
      })
    } else {
      await db.aiChatSession.create({
        data: { sessionId: newSessionId, messages: newHistory }
      })
    }

    return { reply: assistantMessage, sessionId: newSessionId }
  })
}

module.exports = aiRoutes
