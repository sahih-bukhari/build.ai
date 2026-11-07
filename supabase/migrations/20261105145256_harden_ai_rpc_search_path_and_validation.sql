-- Harden the two SECURITY DEFINER RPCs required for owner-scoped message inserts
-- and atomic quota reservation. Keep them callable by authenticated users only.
CREATE OR REPLACE FUNCTION public.append_assistant_message(
  p_conversation_id uuid,
  p_content text,
  p_status text DEFAULT 'complete'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result_id uuid;
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL
     OR p_conversation_id IS NULL
     OR p_content IS NULL
     OR char_length(p_content) NOT BETWEEN 1 AND 100000
     OR p_status IS NULL
     OR p_status NOT IN ('complete', 'stopped') THEN
    RAISE EXCEPTION 'invalid assistant message';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'conversation not found';
  END IF;

  INSERT INTO public.messages (conversation_id, user_id, role, content, status)
  VALUES (p_conversation_id, caller_id, 'assistant', p_content, p_status)
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_assistant_message(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_assistant_message(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_kind text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  changed_count integer := 0;
BEGIN
  IF caller_id IS NULL
     OR p_kind IS NULL
     OR p_kind NOT IN ('chat', 'generate')
     OR p_limit IS NULL
     OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_usage_daily (user_id, usage_day, kind, count)
  VALUES (caller_id, current_date, p_kind, 0)
  ON CONFLICT (user_id, usage_day, kind) DO NOTHING;

  UPDATE public.ai_usage_daily
  SET count = count + 1
  WHERE user_id = caller_id
    AND usage_day = current_date
    AND kind = p_kind
    AND count < p_limit;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(text, integer) TO authenticated;
