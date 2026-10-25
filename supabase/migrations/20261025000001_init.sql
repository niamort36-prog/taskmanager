-- =====================================================================
-- Phase 1 : réglages, tâches, étiquettes, sous-tâches, historique.
-- Toutes les tables sont protégées par RLS : un utilisateur ne voit que
-- ses propres lignes (user_id = auth.uid()).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------

-- Met à jour automatiquement la colonne updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Réglages utilisateur (une ligne par utilisateur, créée par le client)
-- ---------------------------------------------------------------------
create table public.settings (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme           text not null default 'dark' check (theme in ('dark', 'light')),
  timezone        text not null default 'Europe/Paris',
  push_enabled    boolean not null default true,
  email_enabled   boolean not null default false,
  sms_enabled     boolean not null default false,
  notify_email    text,
  dnd_start       time,
  dnd_end         time,
  digest_enabled  boolean not null default false,
  digest_time     time not null default '07:30',
  last_digest_on  date,
  ai_daily_limit  integer not null default 50 check (ai_daily_limit between 0 and 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Tâches
-- ---------------------------------------------------------------------
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done');

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 500),
  description   text not null default '',
  notes_md      text not null default '',
  status        public.task_status not null default 'todo',
  -- 1 = basse, 2 = normale, 3 = haute, 4 = urgente
  priority      smallint not null default 2 check (priority between 1 and 4),
  -- Deadline stockée en UTC ; due_has_time = false => échéance "journée entière"
  -- (due_at vaut alors 23:59 heure de Paris du jour concerné).
  due_at        timestamptz,
  due_has_time  boolean not null default false,
  position      double precision not null default 0,
  completed_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index tasks_user_idx on public.tasks (user_id) where deleted_at is null;
create index tasks_due_idx on public.tasks (user_id, due_at) where deleted_at is null;

create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- Renseigne completed_at quand la tâche passe à "terminée" (et l'efface sinon).
create or replace function public.tasks_set_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'done' then
    new.completed_at := null;
  elsif tg_op = 'INSERT' then
    new.completed_at := now();
  elsif old.status <> 'done' then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

create trigger tasks_completed_at before insert or update of status on public.tasks
  for each row execute function public.tasks_set_completed_at();

-- ---------------------------------------------------------------------
-- Étiquettes
-- ---------------------------------------------------------------------
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 50),
  color       text not null default '#64748b',
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table public.task_tags (
  task_id  uuid not null references public.tasks (id) on delete cascade,
  tag_id   uuid not null references public.tags (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (task_id, tag_id)
);

create index task_tags_tag_idx on public.task_tags (tag_id);

-- ---------------------------------------------------------------------
-- Sous-tâches
-- ---------------------------------------------------------------------
create table public.subtasks (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 500),
  done        boolean not null default false,
  done_at     timestamptz,
  due_at      timestamptz,
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index subtasks_task_idx on public.subtasks (task_id, position);

create trigger subtasks_updated_at before update on public.subtasks
  for each row execute function public.set_updated_at();

create or replace function public.subtasks_set_done_at()
returns trigger
language plpgsql
as $$
begin
  if not new.done then
    new.done_at := null;
  elsif tg_op = 'INSERT' then
    new.done_at := now();
  elsif not old.done then
    new.done_at := now();
  end if;
  return new;
end;
$$;

create trigger subtasks_done_at before insert or update of done on public.subtasks
  for each row execute function public.subtasks_set_done_at();

-- ---------------------------------------------------------------------
-- Historique des modifications (alimenté uniquement par triggers)
-- ---------------------------------------------------------------------
create table public.task_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  entity      text not null,            -- 'task', 'subtask', 'tag', ...
  entity_id   uuid,
  action      text not null,            -- 'insert', 'update', 'delete'
  changes     jsonb not null default '{}'::jsonb,  -- { colonne: { old, new } }
  created_at  timestamptz not null default now()
);

create index task_history_task_idx on public.task_history (task_id, created_at desc);

-- Calcule la différence entre deux lignes, en ignorant les colonnes techniques.
create or replace function public.row_diff(old_row jsonb, new_row jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
  from jsonb_each(new_row) n
  left join jsonb_each(old_row) o on o.key = n.key
  where n.key not in ('updated_at', 'created_at', 'position', 'completed_at', 'done_at', 'user_id', 'id', 'task_id')
    and o.value is distinct from n.value;
$$;

-- Trigger générique. Il tourne en SECURITY DEFINER car les utilisateurs
-- n'ont pas le droit d'écrire dans task_history directement.
create or replace function public.log_task_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity  text := tg_argv[0];
  v_row     jsonb;
  v_task_id uuid;
  v_changes jsonb;
begin
  -- On passe par jsonb : les champs diffèrent selon la table (task_id n'existe
  -- pas sur tasks), ce qui casserait un accès direct aux champs du record.
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if v_entity = 'task' then
    v_task_id := (v_row ->> 'id')::uuid;
  else
    v_task_id := (v_row ->> 'task_id')::uuid;
  end if;

  if tg_op = 'INSERT' then
    v_changes := public.row_diff('{}'::jsonb, v_row);
  elsif tg_op = 'UPDATE' then
    v_changes := public.row_diff(to_jsonb(old), v_row);
    if v_changes = '{}'::jsonb then
      return null; -- rien d'intéressant (ex. simple réordonnancement)
    end if;
  else
    -- Suppression : si la tâche parente a disparu (cascade), on ne journalise pas.
    if not exists (select 1 from public.tasks where id = v_task_id) then
      return null;
    end if;
    v_changes := jsonb_build_object('title', jsonb_build_object('old', v_row -> 'title', 'new', null));
  end if;

  insert into public.task_history (task_id, user_id, entity, entity_id, action, changes)
  values (
    v_task_id,
    (v_row ->> 'user_id')::uuid,
    v_entity,
    case when v_entity = 'task' then null else (v_row ->> 'id')::uuid end,
    lower(tg_op),
    v_changes
  );
  return null;
end;
$$;

create trigger tasks_history after insert or update on public.tasks
  for each row execute function public.log_task_history('task');

create trigger subtasks_history after insert or update or delete on public.subtasks
  for each row execute function public.log_task_history('subtask');

-- Les étiquettes : on journalise l'ajout / le retrait sur la tâche.
create or replace function public.log_task_tag_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.task_tags;
  v_name text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;
  if not exists (select 1 from public.tasks where id = v_row.task_id) then
    return null;
  end if;
  select name into v_name from public.tags where id = v_row.tag_id;
  insert into public.task_history (task_id, user_id, entity, entity_id, action, changes)
  values (v_row.task_id, v_row.user_id, 'tag', v_row.tag_id, lower(tg_op), jsonb_build_object('name', v_name));
  return null;
end;
$$;

create trigger task_tags_history after insert or delete on public.task_tags
  for each row execute function public.log_task_tag_history();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.settings     enable row level security;
alter table public.tasks        enable row level security;
alter table public.tags         enable row level security;
alter table public.task_tags    enable row level security;
alter table public.subtasks     enable row level security;
alter table public.task_history enable row level security;

-- (select auth.uid()) est évalué une seule fois par requête (recommandation Supabase).
create policy "settings_own" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "tasks_own" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "tags_own" on public.tags
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Pour les tables de liaison, on vérifie aussi que la tâche parente
-- appartient bien à l'utilisateur.
create policy "task_tags_own" on public.task_tags
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.tags g where g.id = tag_id and g.user_id = (select auth.uid()))
  );

create policy "subtasks_own" on public.subtasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );

-- Historique : lecture seule pour l'utilisateur.
create policy "task_history_read_own" on public.task_history
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.task_history from anon, authenticated;
