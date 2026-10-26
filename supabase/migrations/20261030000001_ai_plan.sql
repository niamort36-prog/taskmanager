-- =====================================================================
-- Phase 6 : rapport IA global (priorités + plan d'action sur toutes les
-- tâches). Nouvelle valeur autorisée dans le journal des appels IA.
-- =====================================================================

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage
  add constraint ai_usage_feature_check
  check (feature in ('draft_email', 'reply_email', 'next_steps', 'breakdown', 'plan'));
