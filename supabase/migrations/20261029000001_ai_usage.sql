-- =====================================================================
-- Phase 5 : assistant IA. Journal des appels (sert aussi de quota).
-- Les appels au modèle passent uniquement par l'Edge Function "ai" :
-- la clé Gemini n'est jamais exposée au navigateur.
-- =====================================================================

create table public.ai_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  feature     text not null check (feature in ('draft_email', 'reply_email', 'next_steps', 'breakdown')),
  provider    text not null,
  model       text not null,
  tokens_in   integer,
  tokens_out  integer,
  ok          boolean not null default true,
  error       text,
  created_at  timestamptz not null default now()
);

create index ai_usage_user_day_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

-- Lecture seule pour l'utilisateur (affichage du quota restant).
create policy "ai_usage_read_own" on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.ai_usage from anon, authenticated;

-- Quota du jour (heure locale de l'utilisateur) : utilisé, limite.
-- Appelable par l'utilisateur pour lui-même, et par le serveur.
create or replace function public.ai_quota(p_user uuid default auth.uid())
returns table (used int, daily_limit int, last_minute int)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select coalesce(timezone, 'Europe/Paris') tz, ai_daily_limit from public.settings where user_id = p_user
  )
  select
    (select count(*)::int from public.ai_usage u, s
      where u.user_id = p_user and u.ok
        and u.created_at >= ((now() at time zone s.tz)::date at time zone s.tz)),
    coalesce((select ai_daily_limit from s), 50),
    (select count(*)::int from public.ai_usage u
      where u.user_id = p_user and u.created_at > now() - interval '1 minute')
  where p_user = auth.uid() or auth.role() = 'service_role';
$$;

revoke execute on function public.ai_quota(uuid) from public, anon;
grant execute on function public.ai_quota(uuid) to authenticated, service_role;
