-- Baseline schema for Persian AI Builder V3.
-- Mirrors the live `f1.ai` database so a brand-new Supabase project can be created
-- from this folder alone. Every statement is idempotent: on the live database it is a no-op.
-- Later migrations in this folder add `projects.result`, the storage bucket/policies and the quota RPCs.

-- ---------- Tables ----------
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'پروژهٔ تازه' CONSTRAINT projects_name_check CHECK (char_length(name) <= 200),
  files jsonb NOT NULL DEFAULT '{}'::jsonb,
  versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'گفتگوی تازه' CONSTRAINT conversations_title_check CHECK (char_length(title) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CONSTRAINT messages_content_check CHECK (char_length(content) <= 100000),
  status text NOT NULL DEFAULT 'complete' CONSTRAINT messages_status_check CHECK (status IN ('complete', 'stopped', 'error')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'fa' CONSTRAINT user_settings_language_check CHECK (language IN ('fa', 'prs', 'en')),
  theme text NOT NULL DEFAULT 'dark' CONSTRAINT user_settings_theme_check CHECK (theme IN ('dark', 'light')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_day date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL CONSTRAINT ai_usage_daily_kind_check CHECK (kind IN ('chat', 'generate')),
  count integer NOT NULL DEFAULT 0 CONSTRAINT ai_usage_daily_count_check CHECK (count >= 0),
  PRIMARY KEY (user_id, usage_day, kind)
);

-- ---------- Indexes ----------
CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON public.projects (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_user_updated_idx ON public.conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_user_created_idx ON public.messages (user_id, created_at DESC);

-- ---------- Trigger functions ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_conversation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_touch ON public.projects;
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS conversations_touch ON public.conversations;
CREATE TRIGGER conversations_touch BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS messages_bump ON public.messages;
CREATE TRIGGER messages_bump AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.bump_conversation();

-- ---------- Row Level Security ----------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own projects select" ON public.projects;
DROP POLICY IF EXISTS "own projects insert" ON public.projects;
DROP POLICY IF EXISTS "own projects update" ON public.projects;
DROP POLICY IF EXISTS "own projects delete" ON public.projects;
CREATE POLICY "own projects select" ON public.projects FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "own projects insert" ON public.projects FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own projects update" ON public.projects FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own projects delete" ON public.projects FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "own conversations select" ON public.conversations;
DROP POLICY IF EXISTS "own conversations insert" ON public.conversations;
DROP POLICY IF EXISTS "own conversations update" ON public.conversations;
DROP POLICY IF EXISTS "own conversations delete" ON public.conversations;
CREATE POLICY "own conversations select" ON public.conversations FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "own conversations insert" ON public.conversations FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own conversations update" ON public.conversations FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own conversations delete" ON public.conversations FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "own messages select" ON public.messages;
DROP POLICY IF EXISTS "own messages delete" ON public.messages;
DROP POLICY IF EXISTS "own user messages insert" ON public.messages;
CREATE POLICY "own messages select" ON public.messages FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "own messages delete" ON public.messages FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "own user messages insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id AND role = 'user' AND status = 'complete'
    AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "own settings select" ON public.user_settings;
DROP POLICY IF EXISTS "own settings insert" ON public.user_settings;
DROP POLICY IF EXISTS "own settings update" ON public.user_settings;
CREATE POLICY "own settings select" ON public.user_settings FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "own settings insert" ON public.user_settings FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own settings update" ON public.user_settings FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "own ai usage select" ON public.ai_usage_daily;
CREATE POLICY "own ai usage select" ON public.ai_usage_daily FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ---------- Table privileges (least privilege; RLS still applies) ----------
REVOKE ALL ON TABLE public.projects, public.conversations, public.messages, public.user_settings, public.ai_usage_daily FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_settings TO authenticated;
GRANT SELECT ON TABLE public.ai_usage_daily TO authenticated;
