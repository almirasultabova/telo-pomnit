const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: 'smtp.yandex.ru',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

async function sendWelcomeEmail(to, name) {
  const firstName = name ? name.split(' ')[0] : 'участница'

  await transporter.sendMail({
    from: `«Тело помнит» <${process.env.SMTP_USER}>`,
    to,
    subject: 'Добро пожаловать в программу «Тело помнит»',
    html: `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f4ef;margin:0;padding:0">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(42,74,56,0.08)">
    <div style="background:#2a4a38;padding:32px 40px;text-align:center">
      <p style="font-family:Georgia,serif;font-style:italic;font-size:24px;color:#fff;margin:0">Тело помнит</p>
    </div>
    <div style="padding:40px">
      <p style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#1e3020;margin:0 0 16px">
        ${firstName}, добро пожаловать
      </p>
      <p style="font-size:15px;color:#5f544c;line-height:1.7;margin:0 0 24px">
        Ваша оплата подтверждена. Вы — часть группы «Тело помнит».
      </p>
      <p style="font-size:15px;color:#5f544c;line-height:1.7;margin:0 0 32px">
        Программа проходит через Telegram-бота. Найдите его по кнопке ниже и нажмите <strong>Старт</strong> — там будет всё: расписание встреч, дневник и личный AI-помощник.
      </p>
      <div style="text-align:center;margin-bottom:32px">
        <a href="https://t.me/body_remembers_bot"
           style="display:inline-block;background:linear-gradient(135deg,#3d6b51,#2a4a38);color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-size:15px;font-weight:500">
          Открыть бота в Telegram
        </a>
      </div>
      <p style="font-size:13px;color:#9e8e7e;line-height:1.6;margin:0">
        Если кнопка не работает, скопируйте ссылку: https://t.me/body_remembers_bot
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0ebe3;text-align:center">
      <p style="font-size:12px;color:#b0a090;margin:0">
        Это письмо отправлено автоматически. Если у вас есть вопросы — напишите нам в Telegram.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim()
  })
}

module.exports = { sendWelcomeEmail }
