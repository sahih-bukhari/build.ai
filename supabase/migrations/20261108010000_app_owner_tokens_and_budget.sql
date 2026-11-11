-- Stage 3
-- 1) Visitors may edit/delete only the records THEIR browser created: each record stores the SHA-256 hash of a secret
--    token that app-api hands to the creating browser. Records created by the owner (owner_hash is null) cannot be
--    changed by visitors.
-- 2) Larger daily token budget, because sites with a database need more generated code.

ALTER TABLE public.app_records ADD COLUMN IF NOT EXISTS owner_hash text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_records_owner_hash_check') THEN
    ALTER TABLE public.app_records
      ADD CONSTRAINT app_records_owner_hash_check CHECK (owner_hash IS NULL OR owner_hash ~ '^[a-f0-9]{64}$');
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.app_insert_record(uuid, text, jsonb, integer);

CREATE OR REPLACE FUNCTION public.app_insert_record(p_project uuid, p_collection text, p_data jsonb, p_max integer, p_owner_hash text)
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
  IF p_project IS NULL OR p_collection IS NULL OR p_data IS NULL OR p_max IS NULL OR p_max < 1
     OR (p_owner_hash IS NOT NULL AND p_owner_hash !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'Invalid arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_project::text, 0));

  SELECT count(*) INTO n FROM public.app_records r WHERE r.project_id = p_project;
  IF n >= p_max THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LIMIT_REACHED');
  END IF;

  INSERT INTO public.app_records (project_id, collection, data, owner_hash)
  VALUES (p_project, p_collection, p_data, p_owner_hash)
  RETURNING id, created_at INTO new_id, new_created;

  RETURN jsonb_build_object('ok', true, 'id', new_id, 'created_at', new_created);
END;
$$;

REVOKE ALL ON FUNCTION public.app_insert_record(uuid, text, jsonb, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_insert_record(uuid, text, jsonb, integer, text) TO service_role;

-- Daily token budget: 300,000 -> 500,000 (first day 10% = 50,000; later days 5% = 25,000). Same logic as before.
CREATE OR REPLACE FUNCTION public.reserve_ai_tokens(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  day_utc date := (timezone('UTC', now()))::date;
  budget_tokens constant integer := 500000;
  hold_tokens constant integer := 8000;
  allowance integer;
  changed_count integer := 0;
  used_now integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hold', 0, 'used', 0, 'allowance', 0);
  END IF;

  allowance := CASE WHEN EXISTS (
    SELECT 1 FROM public.ai_usage_daily d WHERE d.user_id = p_user_id AND d.usage_day < day_utc
  ) THEN budget_tokens * 5 / 100 ELSE budget_tokens * 10 / 100 END;

  INSERT INTO public.ai_usage_daily AS u (user_id, usage_day, kind, count)
  VALUES (p_user_id, day_utc, 'generate', hold_tokens)
  ON CONFLICT (user_id, usage_day, kind)
  DO UPDATE SET count = u.count + hold_tokens
  WHERE u.count < allowance;

  GET DIAGNOSTICS changed_count = ROW_COUNT;

  SELECT u.count INTO used_now FROM public.ai_usage_daily u
  WHERE u.user_id = p_user_id AND u.usage_day = day_utc AND u.kind = 'generate';

  RETURN jsonb_build_object(
    'ok', changed_count > 0,
    'hold', CASE WHEN changed_count > 0 THEN hold_tokens ELSE 0 END,
    'used', coalesce(used_now, 0),
    'allowance', allowance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_tokens(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_tokens(uuid) TO service_role;
