const BREVO_API_KEY = process.env.BREVO_API_KEY || ''
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@zionite.online'
const FROM_NAME = process.env.FROM_NAME || 'ZioniteFM'

export async function sendEmail({ to, toName, subject, htmlContent, textContent }: {
  to: string
  toName?: string
  subject: string
  htmlContent: string
  textContent?: string
}) {
  if (!BREVO_API_KEY) {
    console.error('[EMAIL] BREVO_API_KEY not configured')
    throw new Error('Email service not configured')
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent,
      textContent: textContent || htmlContent.replace(/<[^>]+>/g, ''),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[EMAIL] Brevo error:', err)
    throw new Error('Failed to send email')
  }

  return await res.json()
}
