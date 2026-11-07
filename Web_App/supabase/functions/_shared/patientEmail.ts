export type EmailStatus = 'sent' | 'failed' | 'not_configured'

// generateLink does not send mail. Send the committed code itself through the
// mail provider; a second Auth OTP request would invalidate the displayed code.
export async function sendPatientLoginCode(
  email: string, otp: string, expiresAt: string, operationToken: string,
  config: { apiKey?: string; from?: string }, fetchImpl: typeof fetch = fetch,
): Promise<EmailStatus> {
  const key = config.apiKey
  const from = config.from
  if (!key || !from) return 'not_configured'
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `patient-login/${operationToken}` },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from, to: [email], subject: 'Your Milestone login code',
        text: `Your Milestone login code is: ${otp}\n\nEnter this code with your email address in the Milestone app to set up your account or sign in.\n\nThis code expires at ${expiresAt} (UTC). Use the latest code provided to you. Do not share it with anyone.\n\nIf you did not expect this email, contact your care provider.`,
      }),
    })
    if (!response.ok) return 'failed'
    const result = await response.json()
    // An accepted message is not a guarantee of inbox delivery.
    return result && typeof result === 'object' && 'id' in result && typeof result.id === 'string' && result.id ? 'sent' : 'failed'
  } catch {
    // Never discard a working login code or expose mail-service diagnostics.
    return 'failed'
  }
}
