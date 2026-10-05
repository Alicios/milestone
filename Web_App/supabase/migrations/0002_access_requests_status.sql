-- Run this if your access_requests table already exists without a status column
-- (i.e. you ran the original schema.sql before this migration was added).
alter table public.access_requests
  add column if not exists status text not null default 'pending';
