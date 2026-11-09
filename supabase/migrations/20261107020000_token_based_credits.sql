-- Token-based daily credits (supersedes the flat per-request scheme of 20261107010000).
--
-- Credits are percentages of a fixed token budget (100% = 1,000,000 tokens):
--   * the first day an account uses the builder it gets 10% (100,000 tokens),
--   * every following UTC day it gets 5% (50,000 tokens).
-- Usage is charged by the tokens the model actually used, so a small one-page site costs little and a heavy
-- project with backend/database code can consume the whole daily credit in one or two requests.
--
-- Flow (called only by the ai-builder Edge Function with the service role; users cannot call these):
--   1. reserve_ai_tokens   - atomically checks that credit remains and holds 10,000 tokens (1%) so parallel
--                            requests cannot overspend.
--   2. settle_ai_tokens    - replaces the hold with the tokens really used (a final request may end slightly
--                            above the allowance; the next one is then refused).
-- ai_usage_daily.count stores tokens used today. Users keep read-only access to their own rows.

DROP FUNCTION IF EXISTS public.reserve_ai_credits(uuid);

CREATE OR REPLACE FUNCTION public.reserve_ai_tokens(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  day_utc date := (timezone('UTC', now()))::date;
  budget_tokens constant integer := 1000000;
  hold_tokens constant integer := 10000;
  allowance integer;
  changed_count integer := 0;
  used_now integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hold', 0, 'used', 0, 'allowance', 0);
  END IF;

  -- 10% on the first day the account used the builder, 5% on every later day.
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

CREATE OR REPLACE FUNCTION public.settle_ai_tokens(p_user_id uuid, p_actual_tokens integer, p_hold_tokens integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL OR p_actual_tokens IS NULL OR p_hold_tokens IS NULL
     OR p_actual_tokens < 0 OR p_hold_tokens < 0 THEN
    RETURN;
  END IF;

  UPDATE public.ai_usage_daily AS u
  SET count = greatest(u.count - p_hold_tokens + least(p_actual_tokens, 2000000), 0)
  WHERE u.user_id = p_user_id
    AND u.usage_day = (timezone('UTC', now()))::date
    AND u.kind = 'generate';
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_tokens(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_tokens(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_tokens(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_tokens(uuid, integer, integer) TO service_role;
