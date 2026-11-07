-- Let the quota RPC run with the caller's privileges under explicit owner RLS.
-- The current builder stores message history in owner-scoped public.projects;
-- the old message RPC is no longer needed by this app.
DROP POLICY IF EXISTS "own ai usage insert" ON public.ai_usage_daily;
DROP POLICY IF EXISTS "own ai usage update" ON public.ai_usage_daily;

CREATE POLICY "own ai usage insert"
ON public.ai_usage_daily
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "own ai usage update"
ON public.ai_usage_daily
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_usage_daily TO authenticated;
REVOKE ALL ON TABLE public.ai_usage_daily FROM anon;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_kind text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
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

  INSERT INTO public.ai_usage_daily (user_id, usage_day, kind, count)
  VALUES (caller_id, day_utc, p_kind, 0)
  ON CONFLICT (user_id, usage_day, kind) DO NOTHING;

  UPDATE public.ai_usage_daily
  SET count = count + 1
  WHERE user_id = caller_id
    AND usage_day = day_utc
    AND kind = p_kind
    AND count < 30;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.append_assistant_message(uuid, text, text) FROM PUBLIC, anon, authenticated;
