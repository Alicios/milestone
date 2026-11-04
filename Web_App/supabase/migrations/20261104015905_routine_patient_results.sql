-- Additive provider-read result metadata. Existing assignment RLS/grants and
-- patient/mobile RPC contracts remain in force; no client write API is added.
set local lock_timeout = '5s';

alter table public.routine_assignments
  add column patient_in_progress boolean not null default false,
  add column patient_issue_severity text not null default 'none'
    constraint routine_patient_issue_severity_check check (patient_issue_severity in ('none', 'noncritical', 'critical')),
  add column patient_comment text
    constraint routine_patient_comment_length_check check (char_length(patient_comment) <= 4000),
  add column patient_result_source text
    constraint routine_patient_result_source_check check (patient_result_source in ('patient', 'demo'));

comment on column public.routine_assignments.patient_in_progress is
  'Patient has started this assignment. Completion/missed lifecycle remains in status; provider clients read only.';
comment on column public.routine_assignments.patient_issue_severity is
  'Unresolved patient-reported issue: none, noncritical, or critical. Independent of completion.';
comment on column public.routine_assignments.patient_comment is
  'Optional plain-text patient feedback for this dated assignment, separate from provider prescription notes. Maximum 4000 characters.';
comment on column public.routine_assignments.patient_result_source is
  'Result provenance: demo for seeded examples, patient for patient-submitted results, null when no result has been recorded.';

notify pgrst, 'reload schema';
