const PDFDocument = require('pdfkit')
const path = require('node:path')
const labels = require('../../assets/diary-labels.json')
const fonts = path.join(__dirname, '../../assets/fonts')
const moscowDate = date => new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(new Date(date))

// Plain PDF text only: notes never enter HTML, shell commands, logs or temporary files.
function createDiaryPdf(entries, { exportedAt = new Date(), accountDeleted = false } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 58, left: 54, right: 54 }, bufferPages: true,
      info: { Title: 'Тело помнит - Дневник тела', Author: 'Тело помнит', CreationDate: exportedAt } })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', () => reject(new Error('PDF generation failed')))
    try {
      doc.registerFont('Regular', path.join(fonts, 'DejaVuSans.ttf'))
      doc.registerFont('Bold', path.join(fonts, 'DejaVuSans-Bold.ttf'))
      doc.font('Regular').fillColor('#68746b').fontSize(10).text('ТЕЛО ПОМНИТ')
      const font = doc._font.font
      const unsupported = character => !'\n\r\t'.includes(character) && !font.hasGlyphForCodePoint(character.codePointAt(0))
      const hasUnsupported = entries.some(entry => [entry.note || '', labels.zones[entry.zone] || entry.zone || '',
        ...(Array.isArray(entry.sensations) ? entry.sensations.map(id => labels.sensations[id] || String(id)) : [])]
        .some(text => [...String(text)].some(unsupported)))
      const readable = text => [...String(text)].map(character => {
        const code = character.codePointAt(0)
        return !unsupported(character) ? character : `[U+${code.toString(16).toUpperCase().padStart(4, '0')}]`
      }).join('')
      doc.moveDown(0.6).font('Bold').fillColor('#24382d').fontSize(25).text('Дневник тела')
      doc.moveDown(0.5).font('Regular').fillColor('#59675e').fontSize(9).text('Выгрузка: ' + moscowDate(exportedAt) + ' (Москва)')
      doc.moveDown(0.7).fontSize(10).text('В PDF входят все записи дневника, сохранённые в приложении. Записи, которые ещё ждут отправки с телефона, можно скачать отдельно в разделе «Мои данные». Остальные сведения аккаунта доступны отдельным файлом JSON.', { lineGap: 3 })
      if (hasUnsupported) doc.moveDown(0.5).fontSize(9).text('Символы, которых нет в шрифте PDF, обозначены кодом [U+XXXX]. Исходный текст без замены символов сохранён в JSON-выгрузке.', { lineGap: 3 })
      doc.moveDown(1.2)
      if (!entries.length) doc.fillColor('#24382d').fontSize(12).text(accountDeleted
        ? 'Аккаунт закрыт. Личных записей дневника в рабочей базе нет.'
        : 'На сервере пока нет записей дневника. После сохранения первой записи она появится в следующей выгрузке.', { lineGap: 4 })
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]
        if (doc.y > doc.page.height - 180) doc.addPage()
        doc.font('Bold').fillColor('#24382d').fontSize(12).text(`${index + 1}. ${moscowDate(entry.createdAt)}`, { lineGap: 3 })
        doc.moveDown(0.4).font('Regular').fontSize(10).text('Зона: ' + readable(labels.zones[entry.zone] || entry.zone || 'Не указана'), { lineGap: 3 })
        const sensations = Array.isArray(entry.sensations) ? entry.sensations.map(id => labels.sensations[id] || String(id)) : []
        doc.text('Ощущения: ' + readable(sensations.join(', ') || 'Не указаны'), { lineGap: 3 })
        doc.moveDown(0.5).text(entry.note ? readable(entry.note) : 'Без заметки.', { lineGap: 4, paragraphGap: 4 })
        doc.moveDown(1.2)
      }
      const range = doc.bufferedPageRange()
      for (let page = range.start; page < range.start + range.count; page++) {
        doc.switchToPage(page)
        const bottom = doc.page.margins.bottom
        doc.page.margins.bottom = 0
        doc.font('Regular').fontSize(8).fillColor('#68746b').text(`Тело помнит · ${page + 1} / ${range.count}`, 54, doc.page.height - 36, { width: doc.page.width - 108, align: 'right', lineBreak: false })
        doc.page.margins.bottom = bottom
      }
      doc.end()
    } catch { doc.destroy(); reject(new Error('PDF generation failed')) }
  })
}
module.exports = { createDiaryPdf, moscowDate }
