-- Restrict provider avatar writes to the signed-in provider's own folder.
-- The web app uploads to: <auth.uid()>/avatar

drop policy if exists "Providers upload their own avatar" on storage.objects;
drop policy if exists "Users can upload their own profile image" on storage.objects;

create policy "Users can upload their own profile image"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Providers update their own avatar" on storage.objects;
drop policy if exists "Users can update their own profile image" on storage.objects;

create policy "Users can update their own profile image"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
