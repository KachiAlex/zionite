import nodemailer from 'nodemailer'

const BREVO_SMTP_KEY = process.env.BREVO_SMTP_KEY || ''
const BREVO_SMTP_LOGIN = process.env.BREVO_SMTP_LOGIN || ''
const BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com'
const BREVO_SMTP_PORT = parseInt(process.env.BREVO_SMTP_PORT || '587', 10)
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@zionite.online'
const FROM_NAME = process.env.FROM_NAME || 'ZioniteFM'

const transporter = nodemailer.createTransport({
  host: BREVO_SMTP_HOST,
  port: BREVO_SMTP_PORT,
  secure: BREVO_SMTP_PORT === 465,
  auth: {
    user: BREVO_SMTP_LOGIN,
    pass: BREVO_SMTP_KEY,
  },
})

export function emailTemplate({ title, body, ctaUrl, ctaText }: { title: string; body: string; ctaUrl?: string; ctaText?: string }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0c0c12;font-family:Arial,Helvetica,sans-serif;color:#f3eee4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#14141a;border-radius:12px;overflow:hidden;border:1px solid rgba(243,238,228,0.08);">
          <tr>
            <td style="background:#c9a227;padding:28px 24px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#1b1208;font-family:Cormorant Garamond, Georgia, serif;">ZioniteFM</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <h2 style="margin:0 0 16px 0;font-size:20px;color:#f3eee4;">${title}</h2>
              <div style="font-size:15px;line-height:1.6;color:#d7d2c7;">${body}</div>
              ${ctaUrl ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
                <tr>
                  <td style="background:#c9a227;border-radius:8px;text-align:center;">
                    <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#1b1208;text-decoration:none;border-radius:8px;">${ctaText || 'Open ZioniteFM'}</a>
                  </td>
                </tr>
              </table>` : ''}
              <hr style="border:none;border-top:1px solid rgba(243,238,228,0.08);margin:28px 0;">
              <p style="font-size:12px;color:#8a8476;margin:0;">If you did not request this email, you can safely ignore it. For help, contact support@zionite.online.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#0c0c12;padding:20px 24px;text-align:center;">
              <p style="font-size:12px;color:#8a8476;margin:0;">&copy; ${new Date().getFullYear()} ZioniteFM. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendEmail({ to, toName, subject, htmlContent, textContent }: {
  to: string
  toName?: string
  subject: string
  htmlContent: string
  textContent?: string
}) {
  if (!BREVO_SMTP_KEY || !BREVO_SMTP_LOGIN) {
    console.error('[EMAIL] Brevo SMTP credentials not configured')
    throw new Error('Email service not configured')
  }

  const info = await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: `"${toName || to}" <${to}>`,
    subject,
    html: htmlContent,
    text: textContent || htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  })

  console.log('[EMAIL] sent:', info.messageId)
  return info
}
