-- Stage 2: real database for generated sites.
--
-- Model
--   project_apps     one row per builder project: the PUBLIC key a generated site sends to the app-api Edge Function.
--   app_collections  the collections ("tables") a project declares, and which operations VISITORS may do on each.
--   app_records      the rows (jsonb) of every collection.
--   app_rate_limits  fixed-window counters used by app-api (service role only).
--
-- Security model
--   * The builder (signed-in owner) reaches these tables through RLS: only rows of projects they own.
--   * Visitors of a generated site never touch the tables. They call the `app-api` Edge Function with the public key;
--     the function runs with the service role and enforces: a declared collection, an allowed operation
--     (default for a new collection is create-only, i.e. a write-only inbox), size caps, per-visitor and per-project
--     rate limits and a record cap per project.
--   * The public key is NOT a secret (it ships inside the site). It can be rotated with rotate_app_key().
--
-- Every statement is idempotent, so the migration can be re-run safely.

-- ---------- Tables ----------
CREATE TABLE IF NOT EXISTS public.project_apps (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  public_key text NOT NULL UNIQUE
    DEFAULT ('pk_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_apps_key_format CHECK (public_key ~ '^pk_[a-f0-9]{48}$')
);

CREATE TABLE IF NOT EXISTS public.app_collections (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL CONSTRAINT app_collections_name_check CHECK (name ~ '^[a-z][a-z0-9_]{0,39}$'),
  public_ops text[] NOT NULL DEFAULT ARRAY['create']::text[]
    CONSTRAINT app_collections_ops_check CHECK (public_ops <@ ARRAY['create', 'read', 'update', 'delete']::text[]),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, name)
);

CREATE TABLE IF NOT EXISTS public.app_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  collection text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_records_collection_fkey FOREIGN KEY (project_id, collection)
    REFERENCES public.app_collections (project_id, name) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT app_records_data_check CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 16384)
);

CREATE TABLE IF NOT EXISTS public.app_rate_limits (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_hash text NOT NULL,
  bucket text NOT NULL CONSTRAINT app_rate_limits_bucket_check CHECK (bucket IN ('write', 'read')),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, client_hash, bucket, window_start)
);

-- ---------- Indexes ----------
CREATE INDEX IF NOT EXISTS app_records_list_idx ON public.app_records (project_id, collection, created_at DESC);
CREATE INDEX IF NOT EXISTS app_rate_limits_window_idx ON public.app_rate_limits (window_start);

-- ---------- Triggers ----------
DROP TRIGGER IF EXISTS app_records_touch ON public.app_records;
CREATE TRIGGER app_records_touch BEFORE UPDATE ON public.app_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- At most 20 collections per project.
CREATE OR REPLACE FUNCTION public.enforce_app_collection_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF (SELECT count(*) FROM public.app_collections c WHERE c.project_id = NEW.project_id) >= 20 THEN
    RAISE EXCEPTION 'A project can have at most 20 collections' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_collections_limit ON public.app_collections;
CREATE TRIGGER app_collections_limit BEFORE INSERT ON public.app_collections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_app_collection_limit();

-- ---------- Row Level Security (owner access from the builder) ----------
ALTER TABLE public.project_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_rate_limits ENABLE ROW LEVEL SECURITY; -- no policies: only the service role can touch it

DROP POLICY IF EXISTS "own project apps select" ON public.project_apps;
DROP POLICY IF EXISTS "own project apps insert" ON public.project_apps;
CREATE POLICY "own project apps select" ON public.project_apps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_apps.project_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "own project apps insert" ON public.project_apps FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_apps.project_id AND p.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "own collections select" ON public.app_collections;
DROP POLICY IF EXISTS "own collections insert" ON public.app_collections;
DROP POLICY IF EXISTS "own collections update" ON public.app_collections;
DROP POLICY IF EXISTS "own collections delete" ON public.app_collections;
CREATE POLICY "own collections select" ON public.app_collections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_collections.project_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "own collections insert" ON public.app_collections FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_collections.project_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "own collections update" ON public.app_collections FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_collections.project_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_collections.project_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "own collections delete" ON public.app_collections FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_collections.project_id AND p.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "own records select" ON public.app_records;
DROP POLICY IF EXISTS "own records insert" ON public.app_records;
DROP POLICY IF EXISTS "own records update" ON public.app_records;
DROP POLICY IF EXISTS "own records delete" ON public.app_records;
CREATE POLICY "own records select" ON public.app_records FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_records.project_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "own records insert" ON public.app_records FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_records.project_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "own records update" ON public.app_records FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_records.project_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_records.project_id AND p.user_id = (SELECT auth.uid())));
CREATE POLICY "own records delete" ON public.app_records FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_records.project_id AND p.user_id = (SELECT auth.uid())));

-- ---------- Table privileges (least privilege; RLS still applies) ----------
REVOKE ALL ON TABLE public.project_apps, public.app_collections, public.app_records, public.app_rate_limits FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.project_apps TO authenticated;            -- the key itself changes only through rotate_app_key()
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_collections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_records TO authenticated;

-- ---------- Functions ----------

-- Owner rotates the public key (the old key stops working immediately).
CREATE OR REPLACE FUNCTION public.rotate_app_key(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_key text := 'pk_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.project_apps SET public_key = new_key WHERE project_id = p_project_id;
  IF NOT FOUND THEN
    INSERT INTO public.project_apps (project_id, public_key) VALUES (p_project_id, new_key);
  END IF;
  RETURN new_key;
END;
$$;

-- Fixed-window rate limit. Returns true while the caller is still inside the limit.
CREATE OR REPLACE FUNCTION public.app_hit(p_project uuid, p_client text, p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  w timestamptz;
  h integer;
BEGIN
  IF p_project IS NULL OR p_client IS NULL OR p_bucket NOT IN ('write', 'read')
     OR p_limit IS NULL OR p_limit < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 3600 THEN
    RAISE EXCEPTION 'Invalid rate limit arguments' USING ERRCODE = '22023';
  END IF;

  w := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.app_rate_limits AS r (project_id, client_hash, bucket, window_start, hits)
  VALUES (p_project, p_client, p_bucket, w, 1)
  ON CONFLICT (project_id, client_hash, bucket, window_start)
  DO UPDATE SET hits = r.hits + 1
  RETURNING r.hits INTO h;

  -- Opportunistic cleanup keeps the table small without a cron job.
  IF random() < 0.02 THEN
    DELETE FROM public.app_rate_limits WHERE window_start < now() - interval '1 hour';
  END IF;

  RETURN h <= p_limit;
END;
$$;

-- Insert a record unless the project already reached its record cap. The advisory lock makes the check-then-insert atomic per project.
CREATE OR REPLACE FUNCTION public.app_insert_record(p_project uuid, p_collection text, p_data jsonb, p_max integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n bigint;
  new_id uuid;
  new_created timestamptz;
BEGIN
  IF p_project IS NULL OR p_collection IS NULL OR p_data IS NULL OR p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'Invalid arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_project::text, 0));

  SELECT count(*) INTO n FROM public.app_records r WHERE r.project_id = p_project;
  IF n >= p_max THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LIMIT_REACHED');
  END IF;

  INSERT INTO public.app_records (project_id, collection, data)
  VALUES (p_project, p_collection, p_data)
  RETURNING id, created_at INTO new_id, new_created;

  RETURN jsonb_build_object('ok', true, 'id', new_id, 'created_at', new_created);
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_app_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_app_key(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.app_hit(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_hit(uuid, text, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.app_insert_record(uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_insert_record(uuid, text, jsonb, integer) TO service_role;
