import type { Session } from '@supabase/supabase-js'

// Compare SDK credentials as opaque values. JWT parsing and refresh belong to the SDK.
type SessionCredentials = Pick<Session, 'user' | 'access_token' | 'refresh_token'>

export function sameCredentials(a: SessionCredentials | null, b: SessionCredentials | null): boolean {
  return Boolean(a && b && a.user?.id === b.user?.id && a.access_token === b.access_token
    && a.refresh_token === b.refresh_token)
}

export function sameSession(a: Session | null, b: Session | null): boolean {
  return sameCredentials(a, b) && a?.expires_at === b?.expires_at
}

export function sessionUnexpired(session: Session | null): session is Session {
  return Boolean(session?.user?.id && session.access_token && session.refresh_token
    && Number.isFinite(session.expires_at) && session.expires_at! * 1000 > Date.now())
}
