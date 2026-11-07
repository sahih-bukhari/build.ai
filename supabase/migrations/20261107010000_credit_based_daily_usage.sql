-- Credit-based daily usage (replaces the flat "30 requests per day" quota).
-- Every account has 100 credits (= 100%) per UTC day.
--   * the first successful build of a project costs 10 credits (10%)
--   * every later edit of a project that already has a result costs 5 credits (5%)
-- The cost is decided here, in the database, from the project's own state, so callers cannot
-- choose a cheaper price. ai_usage_daily.count now stores credits used (percent points).
-- Callers still cannot write ai_usage_daily directly; only this SECURITY DEFINER RPC can.
CREATE OR REPLACE FUNCTION public.reserve_ai_credits(p_project_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  day_utc date := (timezone('UTC', now()))::date;
  daily_limit constant integer := 100;
  first_cost constant integer := 10;
  follow_up_cost constant integer := 5;
  cost integer := first_cost;
  changed_count integer := 0;
  used_now integer := 0;
BEGIN
  IF caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'cost', 0, 'used', 0, 'limit', daily_limit);
  END IF;

  IF p_project_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.user_id = caller_id AND p.result IS NOT NULL
  ) THEN
    cost := follow_up_cost;
  END IF;

  -- One atomic statement: first use of the day inserts, later uses add while credits remain.
  INSERT INTO public.ai_usage_daily AS u (user_id, usage_day, kind, count)
  VALUES (caller_id, day_utc, 'generate', cost)
  ON CONFLICT (user_id, usage_day, kind)
  DO UPDATE SET count = u.count + cost
  WHERE u.count + cost <= daily_limit;

  GET DIAGNOSTICS changed_count = ROW_COUNT;

  SELECT u.count INTO used_now FROM public.ai_usage_daily u
  WHERE u.user_id = caller_id AND u.usage_day = day_utc AND u.kind = 'generate';

  RETURN jsonb_build_object('ok', changed_count > 0, 'cost', cost, 'used', coalesce(used_now, 0), 'limit', daily_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_credits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credits(uuid) TO authenticated;
