-- =====================================================================
-- Phase 2 : carnet de contacts, liens, dossiers et pièces jointes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Contacts (carnet réutilisable entre les tâches)
-- ---------------------------------------------------------------------
create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 200),
  role        text not null default '',
  company     text not null default '',
  phone       text not null default '',
  email       text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index contacts_user_idx on public.contacts (user_id, name);

create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- Liaison n-n tâche <-> contact, avec le rôle du contact sur cette tâche.
create table public.task_contacts (
  task_id       uuid not null references public.tasks (id) on delete cascade,
  contact_id    uuid not null references public.contacts (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role_on_task  text not null default '',
  created_at    timestamptz not null default now(),
  primary key (task_id, contact_id)
);

create index task_contacts_contact_idx on public.task_contacts (contact_id);

-- ---------------------------------------------------------------------
-- Liens (URL + libellé)
-- ---------------------------------------------------------------------
create table public.links (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url         text not null check (length(url) between 1 and 2000),
  label       text not null default '',
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);

create index links_task_idx on public.links (task_id, position);

-- ---------------------------------------------------------------------
-- Pièces jointes : fichier stocké dans Supabase Storage, ou simple
-- référence vers un dossier (chemin réseau, lien Drive…).
-- ---------------------------------------------------------------------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('file', 'folder')),
  label         text not null default '',
  storage_path  text,          -- kind = 'file'   : {user_id}/{task_id}/{uuid}-{nom}
  location      text,          -- kind = 'folder' : \\serveur\partage, https://drive…
  mime          text,
  size          bigint,
  created_at    timestamptz not null default now(),
  check (
    (kind = 'file' and storage_path is not null)
    or (kind = 'folder' and location is not null and length(trim(location)) > 0)
  )
);

create index attachments_task_idx on public.attachments (task_id, created_at);

-- ---------------------------------------------------------------------
-- Historique : on réutilise le trigger générique de la phase 1, mis à
-- jour pour qu'une suppression garde un libellé lisible (titre d'une
-- sous-tâche, libellé ou URL d'un lien, nom d'un fichier).
-- ---------------------------------------------------------------------
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
      return null;
    end if;
  else
    if not exists (select 1 from public.tasks where id = v_task_id) then
      return null;
    end if;
    v_changes := jsonb_build_object('title', jsonb_build_object(
      'old', coalesce(v_row -> 'title', to_jsonb(nullif(v_row ->> 'label', '')), v_row -> 'url', v_row -> 'location'),
      'new', null));
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

create trigger links_history after insert or update or delete on public.links
  for each row execute function public.log_task_history('link');

create trigger attachments_history after insert or update or delete on public.attachments
  for each row execute function public.log_task_history('attachment');

-- Contacts liés : on journalise le nom du contact (plus parlant qu'un id).
create or replace function public.log_task_contact_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.task_contacts;
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
  select name into v_name from public.contacts where id = v_row.contact_id;
  insert into public.task_history (task_id, user_id, entity, entity_id, action, changes)
  values (v_row.task_id, v_row.user_id, 'contact', v_row.contact_id, lower(tg_op),
          jsonb_build_object('name', v_name, 'role', v_row.role_on_task));
  return null;
end;
$$;

create trigger task_contacts_history after insert or delete on public.task_contacts
  for each row execute function public.log_task_contact_history();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.contacts      enable row level security;
alter table public.task_contacts enable row level security;
alter table public.links         enable row level security;
alter table public.attachments   enable row level security;

create policy "contacts_own" on public.contacts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "task_contacts_own" on public.task_contacts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = (select auth.uid()))
  );

create policy "links_own" on public.links
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
  );

create policy "attachments_own" on public.attachments
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid()))
    -- un fichier doit être rangé dans le dossier Storage de l'utilisateur
    and (storage_path is null or split_part(storage_path, '/', 1) = (select auth.uid())::text)
  );

-- ---------------------------------------------------------------------
-- Supabase Storage : bucket privé "attachments" (50 Mo max par fichier,
-- limite de l'offre gratuite). Chaque utilisateur n'accède qu'à son
-- dossier racine {user_id}/.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

create policy "attachments_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "attachments_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "attachments_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "attachments_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
