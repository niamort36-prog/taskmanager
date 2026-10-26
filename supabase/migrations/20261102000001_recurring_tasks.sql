-- =====================================================================
-- Tâches récurrentes : quand une tâche répétée est terminée, la suivante
-- est créée automatiquement (sous-tâches remises à zéro, étiquettes,
-- contacts, adresse et rappels recopiés).
-- Même format de récurrence que les rappels :
--   { "freq": "daily|weekly|monthly|yearly", "interval": 1,
--     "byweekday": [1..7], "until": "2027-12-31" }
-- =====================================================================

alter table public.tasks
  add column recurrence jsonb
    check (recurrence is null or (recurrence ->> 'freq') in ('daily', 'weekly', 'monthly', 'yearly')),
  -- Occurrence suivante déjà créée : évite un doublon si la tâche est
  -- rouverte puis terminée à nouveau.
  add column next_task_id uuid references public.tasks (id) on delete set null;

create or replace function public.spawn_next_recurrence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_base  timestamptz;
  v_next  timestamptz;
  v_delta interval;
  v_new   uuid;
begin
  if new.recurrence is null or new.next_task_id is not null or new.deleted_at is not null then
    return null;
  end if;

  select coalesce(timezone, 'Europe/Paris') into v_tz from public.settings where user_id = new.user_id;

  -- Prochaine occurrence après l'échéance actuelle, sans repasser dans le
  -- passé : une tâche hebdomadaire terminée en retard revient la semaine
  -- suivante, pas à une date déjà dépassée.
  v_base := coalesce(new.due_at, now());
  v_next := public.next_occurrence(v_base, new.recurrence, greatest(v_base, now()), coalesce(v_tz, 'Europe/Paris'));
  if v_next is null then
    return null; -- date de fin de la récurrence atteinte
  end if;
  v_delta := v_next - v_base;

  insert into public.tasks
    (user_id, title, description, notes_md, priority, status, due_at, due_has_time, address, recurrence, position)
  values
    (new.user_id, new.title, new.description, new.notes_md, new.priority, 'todo',
     case when new.due_at is null then null else v_next end,
     new.due_has_time, new.address, new.recurrence, new.position)
  returning id into v_new;

  -- Sous-tâches remises à zéro (échéances décalées d'autant).
  insert into public.subtasks (task_id, user_id, title, position, due_at)
  select v_new, s.user_id, s.title, s.position, s.due_at + v_delta
    from public.subtasks s where s.task_id = new.id;

  insert into public.task_tags (task_id, tag_id, user_id)
  select v_new, tt.tag_id, tt.user_id from public.task_tags tt where tt.task_id = new.id;

  insert into public.task_contacts (task_id, contact_id, user_id, role_on_task)
  select v_new, tc.contact_id, tc.user_id, tc.role_on_task from public.task_contacts tc where tc.task_id = new.id;

  -- Rappels : relatifs recopiés tels quels ; ponctuels décalés de la même
  -- durée ; les rappels eux-mêmes récurrents ne sont pas dupliqués.
  insert into public.reminders (task_id, user_id, mode, remind_at, offset_minutes, channels, ignore_dnd)
  select v_new, r.user_id, r.mode,
         case when r.mode = 'absolute' then r.remind_at + v_delta end,
         r.offset_minutes, r.channels, r.ignore_dnd
    from public.reminders r
   where r.task_id = new.id and r.subtask_id is null and r.active and r.recurrence is null;

  update public.tasks set next_task_id = v_new where id = new.id;
  return null;
end;
$$;

create trigger tasks_spawn_next_recurrence after update of status on public.tasks
  for each row
  when (new.status = 'done' and old.status is distinct from 'done')
  execute function public.spawn_next_recurrence();
