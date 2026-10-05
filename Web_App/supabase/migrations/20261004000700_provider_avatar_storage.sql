-- Storage policies for provider profile images.
-- The profile-images bucket must exist before running this migration.
begin;

drop policy if exists "Providers upload their own avatar" on storage.objects;
drop policy if exists "Providers read their own avatar" on storage.objects;
drop policy if exists "Providers update their own avatar" on storage.objects;
drop policy if exists "Providers delete their own avatar" on storage.objects;

create policy "Providers upload their own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-images'
);

create policy "Providers read their own avatar"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-images'
  and name like ((select auth.uid()::text) || '/%')
);

create policy "Providers update their own avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-images'
)
with check (
  bucket_id = 'profile-images'
);

create policy "Providers delete their own avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-images'
  and name like ((select auth.uid()::text) || '/%')
);

commit;
