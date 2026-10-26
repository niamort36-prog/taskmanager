-- =====================================================================
-- Abonnement agenda (ICS) : lien secret propre à chaque utilisateur,
-- lu par l'Edge Function "calendar" (Google Agenda, iPhone, Outlook).
-- =====================================================================

alter table public.settings
  add column calendar_token text unique;

-- Crée (ou remplace) le lien secret : l'ancien lien cesse aussitôt de fonctionner.
create or replace function public.rotate_calendar_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.settings set calendar_token = v_token where user_id = auth.uid();
  if not found then
    raise exception 'Réglages introuvables';
  end if;
  return v_token;
end;
$$;

revoke execute on function public.rotate_calendar_token() from public, anon;
grant execute on function public.rotate_calendar_token() to authenticated;
