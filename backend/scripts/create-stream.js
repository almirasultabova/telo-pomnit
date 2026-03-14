// scripts/create-stream.js
// Создаёт первый поток «Тело помнит» с 9 встречами в базе данных.
// Запуск: node scripts/create-stream.js
//
// После запуска скрипт выведет streamId — сохрани его, он понадобится для зачисления.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const db = require('../src/db')

// ─── Настройки потока ────────────────────────────────────────────────────────
// Поменяй даты и ссылки перед запуском

const STREAM = {
  name:      'Поток 1 — Весна 2026',
  startDate: new Date('2026-03-19T17:00:00Z'), // 19 марта, 20:00 МСК
  endDate:   new Date('2026-04-23T17:00:00Z'), // примерно 5 недель
  zoomLink:  null,   // добавь ссылку когда будет: 'https://zoom.us/j/...'
  chatLink:  null,   // ссылка на закрытый Telegram чат: 'https://t.me/...'
}

// 9 встреч — поставь реальные даты и темы
const MEETINGS = [
  { number: 1,  date: new Date('2026-03-19T17:00:00Z'), topic: 'Знакомство. Карта тела'                 },
  { number: 2,  date: new Date('2026-03-26T17:00:00Z'), topic: 'Стратегии выживания'                   },
  { number: 3,  date: new Date('2026-04-02T17:00:00Z'), topic: 'Freeze — замирание'                    },
  { number: 4,  date: new Date('2026-04-05T17:00:00Z'), topic: 'Fight — борьба'                        },
  { number: 5,  date: new Date('2026-04-09T17:00:00Z'), topic: 'Flight — бегство'                      },
  { number: 6,  date: new Date('2026-04-12T17:00:00Z'), topic: 'Fawn — угождение'                      },
  { number: 7,  date: new Date('2026-04-16T17:00:00Z'), topic: 'Интеграция: тело и выбор'              },
  { number: 8,  date: new Date('2026-04-19T17:00:00Z'), topic: 'Интеграционная неделя — разбор'        },
  { number: 9,  date: new Date('2026-04-23T17:00:00Z'), topic: 'Завершение. Путь вперёд'               },
]

// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Создаём поток...')

  const stream = await db.stream.create({
    data: {
      name:      STREAM.name,
      startDate: STREAM.startDate,
      endDate:   STREAM.endDate,
      zoomLink:  STREAM.zoomLink,
      chatLink:  STREAM.chatLink,
      isActive:  true,
      meetings: {
        create: MEETINGS.map(m => ({
          number:  m.number,
          date:    m.date,
          topic:   m.topic || null,
        }))
      }
    },
    include: { meetings: true }
  })

  console.log('\n✅ Поток создан!')
  console.log(`   ID:    ${stream.id}`)
  console.log(`   Имя:   ${stream.name}`)
  console.log(`   Старт: ${stream.startDate.toLocaleDateString('ru-RU')}`)
  console.log(`   Конец: ${stream.endDate.toLocaleDateString('ru-RU')}`)
  console.log(`   Встреч создано: ${stream.meetings.length}`)
  console.log('\n📋 Сохрани streamId — он нужен для зачисления через API:')
  console.log(`   streamId = "${stream.id}"`)
  console.log('\nТеперь зачисляй участниц через бот командой /activate @username')

  await db.$disconnect()
}

main().catch(e => {
  console.error('Ошибка:', e.message)
  process.exit(1)
})
