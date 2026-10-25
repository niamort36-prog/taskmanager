-- =====================================================================
-- Phase 3 : rappels (absolus, relatifs à l'échéance, récurrents),
-- abonnements push, journal des envois, planification pg_cron.
--
-- Principe anti-doublon :
--   pg_cron (chaque minute) -> dispatch_due_reminders() -> Edge Function
--   send-reminders -> claim_due_notifications() qui, dans UNE transaction,
--   verrouille les rappels échus (FOR UPDATE SKIP LOCKED), crée une ligne
--   de journal par canal (contrainte UNIQUE) et calcule l'occurrence suivante.
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- Rappels
-- ---------------------------------------------------------------------
create table public.reminders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id         uuid not null references public.tasks (id) on delete cascade,
  subtask_id      uuid references public.subtasks (id) on delete cascade,
  -- absolute : à remind_at (éventuellement répété selon recurrence)
  -- relative : offset_minutes par rapport à l'échéance (négatif = avant)
  mode            text not null check (mode in ('absolute', 'relative')),
  remind_at       timestamptz,
  offset_minutes  integer check (offset_minutes between -525600 and 0),
  -- { "freq": "daily|weekly|monthly|yearly", "interval": 1,
  --   "byweekday": [1..7] (ISO, lundi = 1, hebdo uniquement), "until": "2026-12-31" }
  recurrence      jsonb,
  channels        text[] not null default '{push}'
                  check (cardinality(channels) > 0 and channels <@ array['push', 'email', 'sms']),
  ignore_dnd      boolean not null default false,
  active          boolean not null default true,
  next_fire_at    timestamptz,   -- calculé par trigger, ne pas écrire depuis le client
  last_fired_at   timestamptz,   -- dernière occurrence envoyée
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (
    (mode = 'absolute' and remind_at is not null)
    or (mode = 'relative' and offset_minutes is not null and recurrence is null)
  ),
  check (recurrence is null or (recurrence ->> 'freq') in ('daily', 'weekly', 'monthly', 'yearly'))
);

create index reminders_task_idx on public.reminders (task_id);
create index reminders_due_idx on public.reminders (next_fire_at) where active and next_fire_at is not null;

create trigger reminders_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Occurrence suivante d'une récurrence, calculée en heure locale
-- (Europe/Paris) pour que "tous les jours à 8 h" reste à 8 h après un
-- changement d'heure. Renvoie la première occurrence > p_after.
-- ---------------------------------------------------------------------
create or replace function public.next_occurrence(
  p_start timestamptz,
  p_rec jsonb,
  p_after timestamptz,
  p_tz text default 'Europe/Paris'
)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_start  timestamp := p_start at time zone p_tz;
  v_after  timestamp;
  v_freq   text := p_rec ->> 'freq';
  v_int    int := greatest(coalesce((p_rec ->> 'interval')::int, 1), 1);
  v_until  date := (p_rec ->> 'until')::date;
  v_days   int[];
  v_months int;
  v_n      bigint;
  v_cand   timestamp;
  v_day    date;
  v_anchor date;
begin
  if p_rec is null then
    return case when p_start > p_after then p_start else null end;
  end if;

  -- On cherche la première occurrence >= début et > p_after.
  v_after := greatest(p_after at time zone p_tz, v_start - interval '1 microsecond');

  if v_freq = 'daily' then
    v_n := greatest(0, ceil(extract(epoch from (v_after - v_start)) / 86400.0 / v_int)::bigint);
    v_cand := v_start + make_interval(days => (v_n * v_int)::int);
    while v_cand <= v_after loop
      v_cand := v_cand + make_interval(days => v_int);
    end loop;

  elsif v_freq in ('monthly', 'yearly') then
    v_months := case when v_freq = 'monthly' then v_int else 12 * v_int end;
    v_n := greatest(0, ((extract(year from v_after) - extract(year from v_start)) * 12
                        + extract(month from v_after) - extract(month from v_start))::bigint / v_months - 1);
    -- Toujours calculé depuis la date de départ (évite la dérive 31 -> 28 -> 28…).
    loop
      v_cand := v_start + make_interval(months => (v_n * v_months)::int);
      exit when v_cand > v_after;
      v_n := v_n + 1;
    end loop;

  elsif v_freq = 'weekly' then
    select coalesce(array_agg(d::int), array[extract(isodow from v_start)::int])
      into v_days
      from jsonb_array_elements_text(coalesce(p_rec -> 'byweekday', '[]'::jsonb)) d;
    v_anchor := date_trunc('week', v_start)::date;   -- lundi de la semaine de départ
    v_day := greatest(v_after::date, v_start::date);
    v_cand := null;
    for i in 0 .. (7 * v_int + 7) loop
      if extract(isodow from v_day)::int = any (v_days)
         and ((v_day - v_anchor) / 7) % v_int = 0
         and v_day + v_start::time > v_after then
        v_cand := v_day + v_start::time;
        exit;
      end if;
      v_day := v_day + 1;
    end loop;
    if v_cand is null then
      return null;
    end if;
  else
    return null;
  end if;

  if v_until is not null and v_cand::date > v_until then
    return null;
  end if;
  return v_cand at time zone p_tz;
end;
$$;

-- ---------------------------------------------------------------------
-- Calcul de next_fire_at à chaque écriture d'un rappel.
-- ---------------------------------------------------------------------
create or replace function public.reminders_compute_next()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due    timestamptz;
  v_closed boolean;
  v_fire   timestamptz;
  v_tz     text;
begin
  -- Tâche terminée / supprimée, ou sous-tâche cochée : plus de rappel.
  select t.status = 'done' or t.deleted_at is not null into v_closed from public.tasks t where t.id = new.task_id;
  if new.subtask_id is not null then
    select v_closed or s.done into v_closed from public.subtasks s where s.id = new.subtask_id;
  end if;

  if not new.active or coalesce(v_closed, true) then
    new.next_fire_at := null;
    return new;
  end if;

  if new.mode = 'relative' then
    if new.subtask_id is not null then
      select due_at into v_due from public.subtasks where id = new.subtask_id;
    else
      select due_at into v_due from public.tasks where id = new.task_id;
    end if;
    if v_due is null then
      new.next_fire_at := null;
      return new;
    end if;
    v_fire := v_due + make_interval(mins => new.offset_minutes);
    -- Déjà envoyé pour cette échéance, ou moment dépassé depuis plus de 5 min.
    if (new.last_fired_at is not null and new.last_fired_at >= v_fire) or v_fire < now() - interval '5 minutes' then
      new.next_fire_at := null;
    else
      new.next_fire_at := v_fire;
    end if;
  else
    select coalesce(timezone, 'Europe/Paris') into v_tz from public.settings where user_id = new.user_id;
    new.next_fire_at := public.next_occurrence(
      new.remind_at,
      new.recurrence,
      -- Rappel récurrent : on ne rattrape pas les occurrences manquées.
      greatest(
        coalesce(new.last_fired_at, '-infinity'::timestamptz),
        case when new.recurrence is null then '-infinity'::timestamptz else now() - interval '1 minute' end
      ),
      coalesce(v_tz, 'Europe/Paris')
    );
  end if;
  return new;
end;
$$;

create trigger reminders_compute_next before insert or update on public.reminders
  for each row execute function public.reminders_compute_next();

-- Quand l'échéance ou l'état d'une tâche / sous-tâche change, on recalcule.
create or replace function public.touch_task_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'tasks' then
    update public.reminders set updated_at = now() where task_id = new.id;
  else
    update public.reminders set updated_at = now() where subtask_id = new.id;
  end if;
  return null;
end;
$$;

create trigger tasks_touch_reminders after update of due_at, status, deleted_at on public.tasks
  for each row
  when (old.due_at is distinct from new.due_at or old.status is distinct from new.status
        or old.deleted_at is distinct from new.deleted_at)
  execute function public.touch_task_reminders();

create trigger subtasks_touch_reminders after update of due_at, done on public.subtasks
  for each row
  when (old.due_at is distinct from new.due_at or old.done is distinct from new.done)
  execute function public.touch_task_reminders();

-- Historique : ajout / suppression d'un rappel.
create trigger reminders_history after insert or delete on public.reminders
  for each row execute function public.log_task_history('reminder');

-- ---------------------------------------------------------------------
-- Abonnements Web Push (un par navigateur / appareil)
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text not null default '',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------
-- Journal des envois (une ligne par rappel x occurrence x canal)
-- ---------------------------------------------------------------------
create table public.notification_logs (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  reminder_id      uuid references public.reminders (id) on delete set null,
  task_id          uuid references public.tasks (id) on delete set null,
  kind             text not null default 'reminder',   -- 'reminder', 'digest', 'test'
  occurrence_at    timestamptz not null,
  channel          text not null check (channel in ('push', 'email', 'sms')),
  status           text not null check (status in ('sending', 'sent', 'failed', 'skipped')),
  attempts         integer not null default 0,
  error            text,
  provider_id      text,
  claim_token      uuid,
  last_attempt_at  timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (reminder_id, occurrence_at, channel)
);

create index notification_logs_user_idx on public.notification_logs (user_id, created_at desc);
create index notification_logs_retry_idx on public.notification_logs (status, last_attempt_at)
  where status in ('sending', 'failed');

-- ---------------------------------------------------------------------
-- "Ne pas déranger" : la plage peut passer minuit (ex. 22:00 -> 07:00).
-- ---------------------------------------------------------------------
create or replace function public.in_dnd(p_start time, p_end time, p_now time)
returns boolean
language sql
immutable
as $$
  select case
    when p_start is null or p_end is null or p_start = p_end then false
    when p_start < p_end then p_now >= p_start and p_now < p_end
    else p_now >= p_start or p_now < p_end
  end;
$$;

create or replace function public.user_in_dnd(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.in_dnd(s.dnd_start, s.dnd_end, (now() at time zone coalesce(s.timezone, 'Europe/Paris'))::time)
    from public.settings s where s.user_id = p_user
  ), false);
$$;

-- ---------------------------------------------------------------------
-- Réservation atomique des notifications à envoyer (appelée par l'Edge
-- Function avec la clé service_role uniquement).
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
  -- 1. Rappels échus
  for r in
    select rm.*
    from public.reminders rm
    where rm.active and rm.next_fire_at is not null and rm.next_fire_at <= now()
    order by rm.next_fire_at
    limit p_limit
    for update of rm skip locked
  loop
    -- Plage "ne pas déranger" : le rappel reste en attente jusqu'à sa fin.
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

    -- Occurrence traitée : le trigger calcule la suivante.
    update public.reminders set last_fired_at = r.next_fire_at where id = r.id;
  end loop;

  -- 2. Nouvelles tentatives : échecs récents (3 essais max) et envois restés
  --    bloqués (fonction interrompue).
  update public.notification_logs l
     set status = 'sending', claim_token = v_token, last_attempt_at = now()
   where l.id in (
     select l2.id from public.notification_logs l2
      where (l2.status = 'failed' and l2.attempts < 3 and l2.last_attempt_at < now() - interval '2 minutes'
             and l2.created_at > now() - interval '1 hour')
         or (l2.status = 'sending' and l2.last_attempt_at < now() - interval '10 minutes')
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

-- ---------------------------------------------------------------------
-- Secret partagé entre pg_cron et l'Edge Function, généré ici côté
-- serveur (jamais dans le dépôt) et stocké dans Supabase Vault.
-- ---------------------------------------------------------------------
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret',
                           'Secret partagé pg_cron -> Edge Function send-reminders')
where not exists (select 1 from vault.secrets where name = 'cron_secret');

create or replace function public.verify_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'cron_secret' and decrypted_secret = p_secret and length(p_secret) > 0
  );
$$;

-- Appelé chaque minute par pg_cron : n'appelle l'Edge Function que s'il y
-- a réellement quelque chose à envoyer (économise les invocations).
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
        where (l.status = 'failed' and l.attempts < 3 and l.last_attempt_at < now() - interval '2 minutes'
               and l.created_at > now() - interval '1 hour')
           or (l.status = 'sending' and l.last_attempt_at < now() - interval '10 minutes')
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

-- Fonctions réservées au serveur.
revoke execute on function public.claim_due_notifications(int) from public, anon, authenticated;
revoke execute on function public.verify_cron_secret(text) from public, anon, authenticated;
revoke execute on function public.dispatch_due_reminders() from public, anon, authenticated;
revoke execute on function public.user_in_dnd(uuid) from public, anon, authenticated;
grant execute on function public.claim_due_notifications(int) to service_role;
grant execute on function public.verify_cron_secret(text) to service_role;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.reminders          enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_logs  enable row level security;

create policy "reminders_own" on public.reminders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
    and (subtask_id is null or exists (
      select 1 from public.subtasks s where s.id = subtask_id and s.task_id = reminders.task_id
    ))
  );

create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Journal : lecture seule pour l'utilisateur (écrit par le serveur).
create policy "notification_logs_read_own" on public.notification_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.notification_logs from anon, authenticated;
-- NB : next_fire_at est toujours recalculé par le trigger, quelle que soit
-- la valeur envoyée par le client.

-- ---------------------------------------------------------------------
-- Planification : chaque minute.
-- ---------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'send-reminders';
select cron.schedule('send-reminders', '* * * * *', 'select public.dispatch_due_reminders()');
