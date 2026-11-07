-- Lower the token budget: 100% = 300,000 tokens, so 10% = 30,000 (first day) and 5% = 15,000 (later days).
-- The hold reserved per request is 8,000 tokens (about one light page) so parallel requests cannot overspend much.
CREATE OR REPLACE FUNCTION public.reserve_ai_tokens(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  day_utc date := (timezone('UTC', now()))::date;
  budget_tokens constant integer := 300000;
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
