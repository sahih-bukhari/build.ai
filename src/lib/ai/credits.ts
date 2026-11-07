// Credits are percentages of a fixed token budget; usage is charged by the tokens the model really used.
// The authoritative values live in the database functions public.reserve_ai_tokens / settle_ai_tokens
// (migration 20261107020000_token_based_credits.sql). Keep these constants in sync when changing them.
export const BUDGET_TOKENS = 300_000; // 100% (so 10% = 30,000 tokens, 5% = 15,000 tokens)
export const FIRST_DAY_PERCENT = 10; // allowance on the first day the account uses the builder
export const DAILY_PERCENT = 5; // allowance on every following UTC day
