-- SCRUM-43: LOCAL/REFERENCE ONLY. NOT A MIGRATION OR A HOSTED SCHEMA DUMP.
-- Use only in an empty, disposable local database. Never apply to hosted Supabase.
-- The existing shared catalog has 248 rows; public.exercises.id is a verified
-- UUID primary key. The integration branch reports name, desc, and created_at.
-- text/timestamptz below are local representations, not independently verified
-- hosted types. Non-PK nullability, defaults, other constraints/indexes, grants,
-- policies, and triggers still require an authoritative schema export.
-- No UUID/timestamp defaults or additional constraints are inferred here.
-- No routine schema, seed operation, RPC, or access policy is introduced.
-- See ../SCHEMA.md and ../README.md for evidence and local verification.

create table public.exercises (
  id uuid primary key,
  name text,
  "desc" text,
  created_at timestamptz
);
