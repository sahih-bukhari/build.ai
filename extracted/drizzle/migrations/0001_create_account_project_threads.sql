CREATE TABLE public.project_threads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid(),
 title text NOT NULL DEFAULT 'پروژهٔ تازه',
 messages jsonb NOT NULL DEFAULT '[]'::jsonb,
 result jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_threads TO authenticated;
GRANT ALL ON public.project_threads TO service_role;
ALTER TABLE public.project_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read project threads" ON public.project_threads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners create project threads" ON public.project_threads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners update project threads" ON public.project_threads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners delete project threads" ON public.project_threads FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX project_threads_owner_updated ON public.project_threads (user_id, updated_at DESC);