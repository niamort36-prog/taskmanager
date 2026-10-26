-- =====================================================================
-- Temps passé : chronomètre et saisies manuelles par tâche.
-- =====================================================================

create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,                -- null = chronomètre en cours
  note        text not null default '',
  created_at  timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check (ended_at is null or ended_at - started_at <= interval '24 hours')
);

create index time_entries_task_idx on public.time_entries (task_id, started_at desc);
-- Un seul chronomètre en cours à la fois par utilisateur.
create unique index time_entries_one_running on public.time_entries (user_id) where ended_at is null;

alter table public.time_entries enable row level security;

create policy "time_entries_own" on public.time_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );
