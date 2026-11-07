-- Lock quota enforcement to 30 requests per UTC day in PostgreSQL.
-- A caller cannot raise their own quota by passing a larger p_limit value.
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
