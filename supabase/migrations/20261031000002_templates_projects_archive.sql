-- =====================================================================
-- Modèles de tâches, chantiers (projets) et archivage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Modèles : listes de sous-tâches réutilisables ("Nouveau chantier"…)
-- ---------------------------------------------------------------------
create table public.task_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 100),
  -- ["Vérifier les métrés", "Demander 3 devis", …]
  subtasks    jsonb not null default '[]'::jsonb check (jsonb_typeof(subtasks) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index task_templates_user_idx on public.task_templates (user_id, name);

create trigger task_templates_updated_at before update on public.task_templates
  for each row execute function public.set_updated_at();

alter table public.task_templates enable row level security;

create policy "task_templates_own" on public.task_templates
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Chantiers / projets : regroupent des tâches, avec une adresse.
-- ---------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 200),
  address     text not null default '',
  color       text not null default '#0ea5e9',
  notes       text not null default '',
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_user_idx on public.projects (user_id, archived, name);

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "projects_own" on public.projects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Une tâche appartient à 0 ou 1 chantier. Supprimer le chantier ne supprime
-- pas ses tâches (elles redeviennent "sans chantier").
alter table public.tasks add column project_id uuid references public.projects (id) on delete set null;
create index tasks_project_idx on public.tasks (project_id) where deleted_at is null;

-- Le chantier doit appartenir au même utilisateur que la tâche.
create or replace function public.tasks_check_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null
     and not exists (select 1 from public.projects p where p.id = new.project_id and p.user_id = new.user_id) then
    raise exception 'Chantier inconnu';
  end if;
  return new;
end;
$$;

create trigger tasks_check_project before insert or update of project_id on public.tasks
  for each row execute function public.tasks_check_project();

-- ---------------------------------------------------------------------
-- Corbeille : purge définitive des tâches supprimées depuis plus de 30 jours.
-- Les fichiers Storage liés sont supprimés par l'application lors d'une
-- suppression manuelle ; la purge automatique ne concerne que les tâches
-- sans pièce jointe (les autres restent dans la corbeille).
-- ---------------------------------------------------------------------
create or replace function public.purge_old_trash()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.tasks t
     where t.deleted_at < now() - interval '30 days'
       and not exists (select 1 from public.attachments a where a.task_id = t.id and a.kind = 'file')
    returning 1
  )
  select count(*)::int from gone;
$$;

revoke execute on function public.purge_old_trash() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'purge-trash';
select cron.schedule('purge-trash', '17 3 * * *', 'select public.purge_old_trash()');
