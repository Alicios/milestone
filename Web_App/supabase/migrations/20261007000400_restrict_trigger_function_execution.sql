-- handle_new_user is invoked by the auth.users trigger, not by the Data API.
-- Keep it out of the public RPC surface while preserving trigger execution.

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
