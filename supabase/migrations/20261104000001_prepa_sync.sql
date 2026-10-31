-- =====================================================================
-- Import des chantiers du "Suivi de prépa" (TableauSuiviPrepa, Firebase) :
-- chaque chantier en cours dont l'utilisateur est CdT devient une tâche
-- complète (description et sous-tâches par Gemini, dates butoir).
-- Une fois par mois (le 1er) ou à la demande.
-- =====================================================================

alter table public.settings
  add column prepa_enabled boolean not null default false,
  add column prepa_team text not null default 'EEL Limoges',
  add column prepa_cdt_names text not null default 'Roy, Romain',
  add column last_prepa_sync_on date;

-- Lien chantier <-> tâche : un chantier n'est importé qu'une fois.
-- Si la tâche est supprimée, le chantier n'est plus recréé.
create table public.prepa_imports (
  user_id      uuid not null references auth.users (id) on delete cascade,
  chantier_id  text not null,
  task_id      uuid references public.tasks (id) on delete set null,
  cons_end     date,
  imported_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, chantier_id)
);

alter table public.prepa_imports enable row level security;
create policy "prepa_imports_read_own" on public.prepa_imports
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.prepa_imports from anon, authenticated;

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('draft_email', 'reply_email', 'next_steps', 'breakdown', 'plan', 'parse_task', 'prepa'));

-- Import mensuel : utilisateurs activés, pas encore importés ce mois-ci
-- (heure locale). Réservation atomique.
create or replace function public.claim_prepa_syncs()
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.settings s
       set last_prepa_sync_on = (now() at time zone s.timezone)::date
     where s.prepa_enabled
       and (s.last_prepa_sync_on is null
            or date_trunc('month', s.last_prepa_sync_on) < date_trunc('month', (now() at time zone s.timezone)::date))
    returning s.user_id;
end;
$$;

create or replace function public.dispatch_prepa_syncs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (
    select 1 from public.settings s
     where s.prepa_enabled
       and (s.last_prepa_sync_on is null
            or date_trunc('month', s.last_prepa_sync_on) < date_trunc('month', (now() at time zone s.timezone)::date))
  ) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'Import prépa : secret Vault "project_url" ou "cron_secret" manquant';
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/prepa-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
end;
$$;

revoke execute on function public.claim_prepa_syncs() from public, anon, authenticated;
revoke execute on function public.dispatch_prepa_syncs() from public, anon, authenticated;
grant execute on function public.claim_prepa_syncs() to service_role;

-- Le 1er du mois vers 6 h (heure de Paris) ; un seul import par mois et par utilisateur.
select cron.unschedule(jobid) from cron.job where jobname = 'prepa-sync';
select cron.schedule('prepa-sync', '0 5 1 * *', 'select public.dispatch_prepa_syncs()');
