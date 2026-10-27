-- Switches patient login codes from an emailed OTP (signInWithOtp, which
-- requires Custom SMTP to be configured and a verified sending domain before
-- the email template can even be edited to show the code) to a provider-
-- generated one: api/invite-patient.ts now calls admin.generateLink(), which
-- returns the raw one-time code synchronously without sending any email, and
-- stores it here so the provider's web app can display it to relay to the
-- patient directly (in person, by phone, etc). The code is a single-use
-- nonce already enforced server-side by Supabase Auth; storing it is only a
-- convenience for the provider to read it back; verifying it is still done
-- entirely through Supabase Auth itself, not this column.
begin;

alter table public.patients
  add column pending_otp_code text,
  add column pending_otp_expires_at timestamptz;

comment on column public.patients.pending_otp_code is
  'Most recent one-time login code from admin.generateLink(), shown to the provider to relay to the patient. Cleared by clear_my_pending_otp() once the patient verifies on their device.';
comment on column public.patients.pending_otp_expires_at is
  'Client-side expiry estimate for pending_otp_code, so the web UI can hide a stale code. Supabase Auth enforces the real expiry independently.';

-- Patient-facing write: clears the code once the patient has verified it on
-- their own device, so a code can't be read back after it has done its job.
-- Mirrors get_my_patient_profile()'s auth_user_id = auth.uid() scoping.
create or replace function public.clear_my_pending_otp()
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.patients
  set pending_otp_code = null, pending_otp_expires_at = null
  where auth_user_id = auth.uid();
$function$;

revoke all on function public.clear_my_pending_otp() from public, anon;
grant execute on function public.clear_my_pending_otp() to authenticated;

comment on function public.clear_my_pending_otp() is
  'Patient-facing write: clears the calling patient''s own pending_otp_code/expiry after a successful verifyOtp.';

commit;
