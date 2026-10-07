comment on column public.messages.id is 'Stable message ID.';
comment on column public.messages.patient_profile_id is 'Provider-specific patient relationship that owns this conversation.';
comment on column public.messages.sender_kind is 'Which side of the relationship authored the message.';
comment on column public.messages.body is 'Text content, limited to 4000 characters.';
comment on column public.messages.created_at is 'Server timestamp used to order conversation history.';
comment on column public.messages.source is 'Internal provenance: live or imported demo history.';
comment on column public.messages.seed_key is 'Stable key used only to avoid duplicating imported demo messages.';

comment on column public.message_thread_state.patient_profile_id is 'Conversation relationship for this participant state.';
comment on column public.message_thread_state.participant_user_id is 'Authenticated user whose read and starred state this row stores.';
comment on column public.message_thread_state.last_read_at is 'Timestamp of the newest message displayed to this participant.';
comment on column public.message_thread_state.starred is 'Whether this participant starred the conversation.';
