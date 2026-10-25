-- =====================================================================
-- Phase 4 : emails, SMS et récapitulatif quotidien.
-- =====================================================================

-- Adresse de notification : format minimal.
alter table public.settings
  add constraint settings_notify_email_format
  check (notify_email is null or notify_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- ---------------------------------------------------------------------
-- Correctif : seules les lignes de journal de type "reminder" sont
-- relancées par send-reminders (les tests et récapitulatifs ont leur
-- propre circuit). Les deux fonctions sont redéfinies à l'identique,
-- avec ce filtre en plus.
-- ---------------------------------------------------------------------
create or replace function public.claim_due_notifications(p_limit int default 50)
returns table (
  log_id         bigint,
  user_id        uuid,
  channel        text,
  attempts       int,
  reminder_id    uuid,
  task_id        uuid,
  occurrence_at  timestamptz,
  task_title     text,
  task_due_at    timestamptz,
  task_due_time  boolean,
  subtask_title  text,
  subtask_due_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  r       record;
  s       public.settings;
begin
  for r in
    select rm.*
    from public.reminders rm
    where rm.active and rm.next_fire_at is not null and rm.next_fire_at <= now()
    order by rm.next_fire_at
    limit p_limit
    for update of rm skip locked
  loop
    if not r.ignore_dnd and public.user_in_dnd(r.user_id) then
      continue;
    end if;

    select * into s from public.settings where settings.user_id = r.user_id;

    insert into public.notification_logs
      (user_id, reminder_id, task_id, occurrence_at, channel, status, error, claim_token, last_attempt_at)
    select
      r.user_id, r.id, r.task_id, r.next_fire_at, ch,
      case when e.enabled then 'sending' else 'skipped' end,
      case when e.enabled then null else 'Canal désactivé dans les réglages' end,
      v_token, now()
    from unnest(r.channels) ch
    cross join lateral (
      select case ch
        when 'push'  then coalesce(s.push_enabled, true)
        when 'email' then coalesce(s.email_enabled, false)
        when 'sms'   then coalesce(s.sms_enabled, false)
      end as enabled
    ) e
    on conflict on constraint notification_logs_reminder_id_occurrence_at_channel_key do nothing;

    update public.reminders set last_fired_at = r.next_fire_at where id = r.id;
  end loop;

  update public.notification_logs l
     set status = 'sending', claim_token = v_token, last_attempt_at = now()
   where l.id in (
     select l2.id from public.notification_logs l2
      where l2.kind = 'reminder'
        and ((l2.status = 'failed' and l2.attempts < 3 and l2.last_attempt_at < now() - interval '2 minutes'
              and l2.created_at > now() - interval '1 hour')
          or (l2.status = 'sending' and l2.last_attempt_at < now() - interval '10 minutes'))
      limit p_limit
      for update skip locked
   );

  return query
    select l.id, l.user_id, l.channel, l.attempts, l.reminder_id, l.task_id, l.occurrence_at,
           t.title, t.due_at, t.due_has_time, st.title, st.due_at
      from public.notification_logs l
      left join public.reminders rm on rm.id = l.reminder_id
      left join public.tasks t on t.id = l.task_id
      left join public.subtasks st on st.id = rm.subtask_id
     where l.claim_token = v_token and l.status = 'sending';
end;
$$;

create or replace function public.dispatch_due_reminders()
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
       select 1 from public.reminders rm
        where rm.active and rm.next_fire_at <= now()
          and (rm.ignore_dnd or not public.user_in_dnd(rm.user_id))
     )
     and not exists (
       select 1 from public.notification_logs l
        where l.kind = 'reminder'
          and ((l.status = 'failed' and l.attempts < 3 and l.last_attempt_at < now() - interval '2 minutes'
                and l.created_at > now() - interval '1 hour')
            or (l.status = 'sending' and l.last_attempt_at < now() - interval '10 minutes'))
     ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'Rappels : secret Vault "project_url" ou "cron_secret" manquant';
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Récapitulatif quotidien par email
-- ---------------------------------------------------------------------

-- Utilisateurs dont l'heure du récapitulatif est passée aujourd'hui (heure
-- locale) et qui ne l'ont pas encore reçu.
create or replace function public.due_digest_users()
returns table (user_id uuid, notify_email text, local_date date)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, s.notify_email, (now() at time zone s.timezone)::date
    from public.settings s
   where s.digest_enabled
     and s.email_enabled
     and s.notify_email is not null
     and (now() at time zone s.timezone)::time >= s.digest_time
     and (s.last_digest_on is null or s.last_digest_on < (now() at time zone s.timezone)::date);
$$;

-- Réservation atomique : marque le récapitulatif du jour comme "pris" et
-- renvoie les destinataires (jamais deux envois le même jour).
create or replace function public.claim_due_digests()
returns table (user_id uuid, notify_email text, local_date date)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.settings s
       set last_digest_on = d.local_date
      from public.due_digest_users() d
     where s.user_id = d.user_id
       and (s.last_digest_on is null or s.last_digest_on < d.local_date)
    returning s.user_id, s.notify_email, d.local_date;
end;
$$;

-- Contenu du récapitulatif : tâches et sous-tâches non terminées dont
-- l'échéance tombe aujourd'hui ou avant (en retard).
create or replace function public.digest_items(p_user uuid)
returns table (
  kind          text,     -- 'task' | 'subtask'
  task_id       uuid,
  title         text,
  parent_title  text,
  due_at        timestamptz,
  due_has_time  boolean,
  overdue       boolean,
  priority      smallint
)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (
    select coalesce((select timezone from public.settings where user_id = p_user), 'Europe/Paris') as z
  ),
  bounds as (
    select ((now() at time zone z)::date at time zone z) as day_start,
           (((now() at time zone z)::date + 1) at time zone z) as day_end
      from tz
  )
  select 'task', t.id, t.title, null, t.due_at, t.due_has_time,
         case when t.due_has_time then t.due_at < now() else t.due_at < b.day_start end,
         t.priority
    from public.tasks t, bounds b
   where t.user_id = p_user and t.deleted_at is null and t.status <> 'done'
     and t.due_at is not null and t.due_at < b.day_end
  union all
  select 'subtask', t.id, s.title, t.title, s.due_at, false, s.due_at < b.day_start, t.priority
    from public.subtasks s
    join public.tasks t on t.id = s.task_id
    cross join bounds b
   where s.user_id = p_user and not s.done and t.deleted_at is null and t.status <> 'done'
     and s.due_at is not null and s.due_at < b.day_end
   order by 7 desc, 5;
$$;

-- Appelé toutes les 5 minutes par pg_cron.
create or replace function public.dispatch_daily_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.due_digest_users()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'Récapitulatif : secret Vault "project_url" ou "cron_secret" manquant';
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;

revoke execute on function public.due_digest_users() from public, anon, authenticated;
revoke execute on function public.claim_due_digests() from public, anon, authenticated;
revoke execute on function public.digest_items(uuid) from public, anon, authenticated;
revoke execute on function public.dispatch_daily_digest() from public, anon, authenticated;
grant execute on function public.claim_due_digests() to service_role;
grant execute on function public.digest_items(uuid) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'daily-digest';
select cron.schedule('daily-digest', '*/5 * * * *', 'select public.dispatch_daily_digest()');
