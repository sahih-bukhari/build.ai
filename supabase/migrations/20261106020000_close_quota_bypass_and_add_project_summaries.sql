-- 1) Close the daily-quota bypass.
-- Migration 20261105150510 made reserve_ai_usage SECURITY INVOKER and gave `authenticated`
-- INSERT/UPDATE on ai_usage_daily, so any signed-in user could reset their own counter
-- through the REST API (PATCH /rest/v1/ai_usage_daily). The counter must only be changed by
-- the RPC, which therefore runs as SECURITY DEFINER again. Users keep read-only access.
DROP POLICY IF EXISTS "own ai usage insert" ON public.ai_usage_daily;
DROP POLICY IF EXISTS "own ai usage update" ON public.ai_usage_daily;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_usage_daily FROM anon, authenticated;
GRANT SELECT ON TABLE public.ai_usage_daily TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_kind text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  day_utc date := (timezone('UTC', now()))::date;
  changed_count integer := 0;
BEGIN
  IF caller_id IS NULL
     OR p_kind IS NULL
     OR p_kind NOT IN ('chat', 'generate')
     OR p_limit IS DISTINCT FROM 30 THEN
    RETURN false;
  END IF;

  -- Single atomic statement: insert the first use of the day, or increment while under the limit.
  INSERT INTO public.ai_usage_daily AS u (user_id, usage_day, kind, count)
  VALUES (caller_id, day_utc, p_kind, 1)
  ON CONFLICT (user_id, usage_day, kind)
  DO UPDATE SET count = u.count + 1
  WHERE u.count < 30;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(text, integer) TO authenticated;

-- 2) Lightweight project list.
-- The project history used to download files/versions/messages/result of every project
-- (megabytes) only to decide whether a project is empty. This view exposes the flag instead.
-- security_invoker keeps the owner-only RLS of public.projects in force.
CREATE OR REPLACE VIEW public.project_summaries
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  name,
  created_at,
  updated_at,
  (result IS NOT NULL
    OR files <> '{}'::jsonb
    OR versions <> '[]'::jsonb
    OR messages <> '[]'::jsonb) AS has_content
FROM public.projects;

REVOKE ALL ON TABLE public.project_summaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.project_summaries TO authenticated;
