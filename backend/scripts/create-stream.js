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
  startDate: new Date('2026-03-26T15:00:00Z'), // 26 марта, 18:00 МСК
  endDate:   new Date('2026-04-23T15:00:00Z'), // 23 апреля, 18:00 МСК
  zoomLink:  null,   // добавь ссылку когда будет: 'https://zoom.us/j/...'
  chatLink:  'https://t.me/+IwJSzSom75M0ZDcy',
}

// 9 встреч — точное расписание программы (МСК = UTC+3)
const MEETINGS = [
  { number: 1, date: new Date('2026-03-26T15:00:00Z'), topic: 'Знакомство. Чувства и эмоции — учимся отслеживать' },
  { number: 2, date: new Date('2026-03-29T08:00:00Z'), topic: 'Телесная практика: Даосские пульсации (лёжа)'      },
  { number: 3, date: new Date('2026-04-02T15:00:00Z'), topic: 'Инструменты работы с чувствами. Границы в теле'    },
  { number: 4, date: new Date('2026-04-05T08:00:00Z'), topic: 'Телесная практика: Жертва и палач (стоя)'          },
  { number: 5, date: new Date('2026-04-09T15:00:00Z'), topic: 'Новые стратегии реагирования. Выход из цикличности'},
  { number: 6, date: new Date('2026-04-12T08:00:00Z'), topic: 'Телесная практика: Амазонка, тантрический круг'    },
  { number: 7, date: new Date('2026-04-16T15:00:00Z'), topic: 'Внутренняя опора. Принятие всех своих качеств'     },
  { number: 8, date: new Date('2026-04-19T08:00:00Z'), topic: 'Телесная практика: Рефлекс оргазма (лёжа)'        },
  { number: 9, date: new Date('2026-04-23T15:00:00Z'), topic: 'Завершение. Сборка опыта и новые сценарии'         },
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
