-- Ensure the bucket exists in the same Supabase database used by the app.
insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', true)
on conflict (id) do update
set public = excluded.public;
