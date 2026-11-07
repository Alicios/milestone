export type EmailStatus = 'sent' | 'failed' | 'not_configured'

export function patientCodeEmailMessage(status?: EmailStatus): string {
  if (status === 'sent') return 'Login code emailed to the patient. They can also use the code shown here.'
  if (status === 'not_configured') return 'Email delivery is unavailable. Give this code directly to the patient.'
  return 'Email delivery was not confirmed. Give this code directly to the patient.'
}
