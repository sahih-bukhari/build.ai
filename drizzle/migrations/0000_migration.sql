create table public.daily_user_usage (
  user_id uuid not null,
  usage_date date not null,
  request_count integer not null default 0,
  primary key (user_id, usage_date)
);
grant select on public.daily_user_usage to authenticated;
grant all on public.daily_user_usage to service_role;
alter table public.daily_user_usage enable row level security;
create policy "Users read own usage" on public.daily_user_usage
  for select to authenticated using (auth.uid() = user_id);

create table public.daily_project_usage (
  usage_date date primary key,
  request_count integer not null default 0
);
grant all on public.daily_project_usage to service_role;
alter table public.daily_project_usage enable row level security;

create or replace function public.reserve_generation_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _day date := (now() at time zone 'utc')::date;
  _user_used int;
  _project_used int;
  _user_limit constant int := 5;
  _project_limit constant int := 20;
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;
  insert into daily_project_usage(usage_date) values (_day) on conflict do nothing;
  insert into daily_user_usage(user_id, usage_date) values (_uid, _day) on conflict do nothing;
  select request_count into _project_used from daily_project_usage where usage_date = _day for update;
  select request_count into _user_used from daily_user_usage where user_id = _uid and usage_date = _day for update;
  if _project_used >= _project_limit then
    return jsonb_build_object('allowed', false, 'reason', 'PROJECT', 'user_remaining', greatest(_user_limit - _user_used, 0));
  end if;
  if _user_used >= _user_limit then
    return jsonb_build_object('allowed', false, 'reason', 'USER', 'user_remaining', 0);
  end if;
  update daily_project_usage set request_count = request_count + 1 where usage_date = _day;
  update daily_user_usage set request_count = request_count + 1 where user_id = _uid and usage_date = _day;
  return jsonb_build_object('allowed', true, 'reason', null, 'user_remaining', _user_limit - _user_used - 1);
end;
$$;

create or replace function public.get_my_usage()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'user_limit', 5,
    'user_used', coalesce((select request_count from daily_user_usage
       where user_id = auth.uid() and usage_date = (now() at time zone 'utc')::date), 0)
  );
$$;

revoke execute on function public.reserve_generation_quota() from public, anon;
revoke execute on function public.get_my_usage() from public, anon;
grant execute on function public.reserve_generation_quota() to authenticated;
grant execute on function public.get_my_usage() to authenticated;