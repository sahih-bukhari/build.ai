-- Additive alignment for Persian AI Builder V3. Existing project rows are preserved.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS result jsonb;

REVOKE ALL ON TABLE public.ai_usage_daily FROM anon;
GRANT SELECT ON TABLE public.ai_usage_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('project-references', 'project-references', false, 100000,
  ARRAY['text/plain','text/markdown','text/html','text/css','application/json']::text[])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='PAB owners upload references') THEN
    CREATE POLICY "PAB owners upload references" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id='project-references' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='PAB owners read references') THEN
    CREATE POLICY "PAB owners read references" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id='project-references' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='PAB owners delete references') THEN
    CREATE POLICY "PAB owners delete references" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id='project-references' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
  END IF;
END $$;
