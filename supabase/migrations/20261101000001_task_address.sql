-- =====================================================================
-- Adresse directement sur la tâche (itinéraire Google Maps / Waze),
-- à la place des "chantiers", retirés (aucune donnée à reprendre).
-- =====================================================================

alter table public.tasks
  add column address text not null default '' check (length(address) <= 500);

drop trigger if exists tasks_check_project on public.tasks;
drop function if exists public.tasks_check_project();
drop index if exists public.tasks_project_idx;
alter table public.tasks drop column if exists project_id;
drop table if exists public.projects;
