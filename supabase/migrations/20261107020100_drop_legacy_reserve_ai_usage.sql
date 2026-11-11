-- Run only after the ai-builder Edge Function calls reserve_ai_tokens / settle_ai_tokens.
DROP FUNCTION IF EXISTS public.reserve_ai_usage(text, integer);
