// Thin wrapper around the security-definer RPCs deployed by Web_App
// (supabase/migrations/20261019000100_patient_accounts.sql and later). Each
// RPC scopes itself internally by patients.auth_user_id = auth.uid(), so
// these only ever work once a patient has a real, signed-in session.
import { supabase } from './supabase';

async function call(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// get_my_patient_profile is declared `returns table (...)`, which PostgREST
// always returns as an array (one row here) rather than a single object.
async function callSingle(name, args) {
  const rows = await call(name, args);
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

export const fetchMyPatientProfile = () => callSingle('get_my_patient_profile');
export const fetchMyCareRelationships = () => call('get_my_care_relationships');
export const fetchMyRoutineAssignments = (patientProfileId) =>
  call('get_my_routine_assignments', { p_patient_profile_id: patientProfileId });
export const fetchMyRoutineAssignmentPrescriptions = (routineAssignmentId) =>
  call('get_my_routine_assignment_prescriptions', { p_routine_assignment_id: routineAssignmentId });
export const fetchMyRoutineFollowUps = (patientProfileId) =>
  call('get_my_routine_follow_ups', { p_patient_profile_id: patientProfileId });
export const clearMyPendingOtp = () => call('clear_my_pending_otp');
