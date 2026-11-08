-- Remove privileges the app never needs. RLS does not protect against TRUNCATE,
-- so `anon`/`authenticated` must not hold it. Existing rows and policies are untouched.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.projects, public.conversations, public.messages, public.user_settings, public.ai_usage_daily
FROM anon, authenticated;
