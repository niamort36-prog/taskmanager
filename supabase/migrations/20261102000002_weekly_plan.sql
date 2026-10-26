-- =====================================================================
-- Plan d'action IA de la semaine, envoyé par email le lundi matin.
-- =====================================================================

alter table public.settings
  add column weekly_plan_enabled boolean not null default false,
  add column weekly_plan_time time not null default '07:00',
  add column last_weekly_plan_on date;

-- Utilisateurs à qui envoyer le plan : lundi (heure locale), heure passée,
-- email activé, pas encore envoyé aujourd'hui.
create or replace function public.due_weekly_plan_users()
returns table (user_id uuid, notify_email text, local_date date)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, s.notify_email, (now() at time zone s.timezone)::date
    from public.settings s
   where s.weekly_plan_enabled
     and s.email_enabled
     and s.notify_email is not null
     and extract(isodow from (now() at time zone s.timezone)) = 1
     and (now() at time zone s.timezone)::time >= s.weekly_plan_time
     and (s.last_weekly_plan_on is null or s.last_weekly_plan_on < (now() at time zone s.timezone)::date);
$$;

-- Réservation atomique (un seul envoi par lundi).
create or replace function public.claim_weekly_plans()
returns table (user_id uuid, notify_email text, local_date date)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.settings s
       set last_weekly_plan_on = d.local_date
      from public.due_weekly_plan_users() d
     where s.user_id = d.user_id
       and (s.last_weekly_plan_on is null or s.last_weekly_plan_on < d.local_date)
    returning s.user_id, s.notify_email, d.local_date;
end;
$$;

create or replace function public.dispatch_weekly_plans()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.due_weekly_plan_users()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'Plan hebdo : secret Vault "project_url" ou "cron_secret" manquant';
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/weekly-plan',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    -- La génération par l'IA peut prendre jusqu'à une minute.
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.due_weekly_plan_users() from public, anon, authenticated;
revoke execute on function public.claim_weekly_plans() from public, anon, authenticated;
revoke execute on function public.dispatch_weekly_plans() from public, anon, authenticated;
grant execute on function public.claim_weekly_plans() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'weekly-plan';
select cron.schedule('weekly-plan', '*/15 * * * 1', 'select public.dispatch_weekly_plans()');
