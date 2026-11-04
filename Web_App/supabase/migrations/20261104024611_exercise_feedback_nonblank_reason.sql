-- btrim() alone removes spaces, but a required explanation must also contain
-- something other than tabs/newlines. Client validation uses String.trim().
alter table public.routine_assignment_exercise_feedback
  add constraint exercise_feedback_nonblank_explanation_check
    check (feeling = 'good' or explanation ~ '[^[:space:]]');
