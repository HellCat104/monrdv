-- ============================================================================
-- Migration v59 — Rebonds d'e-mail : savoir qu'une adresse ne fonctionne pas
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente : la relancer ne casse rien.
--
-- ORDRE DE DÉPLOIEMENT : indifférent, mais le plus sûr est de la lancer AVANT
-- de configurer le webhook dans Resend.
--   · Code déployé sans migration : les écrans n'affichent aucun avertissement
--     (colonnes absentes = pas de rebond connu) et la route
--     app/api/webhooks/resend répond 500 à Resend, qui RÉESSAIE pendant environ
--     une journée. Un rebond reçu dans cet intervalle est donc traité dès que
--     la migration est passée — il n'est pas perdu.
--   · Migration sans code : colonnes vides, rien ne change à l'écran.
--
-- ── LE PROBLÈME ─────────────────────────────────────────────────────────────
--
-- Un médecin invite sa secrétaire avec une adresse iCloud mal orthographiée.
-- Resend accepte le message (« Sent »), l'application affiche « Invitation
-- envoyée ». Une minute plus tard, Apple le renvoie (« recipient not found ») et
-- Resend place l'adresse en liste de suppression : plus AUCUN message ne lui
-- sera remis. L'application n'en a jamais rien su. Même chose pour un patient
-- qui se trompe d'une lettre à la réservation : ni confirmation ni rappel ne
-- lui parviennent, et personne au cabinet ne le sait.
--
-- Un rebond est ASYNCHRONE : il survient APRÈS que Resend a accepté l'envoi.
-- Aucune valeur de retour de l'API ne peut le dire ; seul le webhook de Resend
-- le rapporte. Cette migration lui donne un endroit où écrire.
--
-- ── POURQUOI LE DRAPEAU EST SUR LA FICHE, ET PAS SEULEMENT DANS UN JOURNAL ──
--
-- L'information doit apparaître LÀ OÙ L'ADRESSE SE CORRIGE : à côté du champ
-- e-mail du dossier patient, sur la fiche de la secrétaire dans « Mon équipe ».
-- Une colonne sur la ligne elle-même est lue par les écrans existants sans
-- jointure, et elle est protégée par la RLS déjà en place : chaque médecin ne
-- voit que SES patients et SA secrétaire.
--
-- Le webhook marque TOUTES les lignes qui portent l'adresse (comparaison
-- insensible à la casse), tous cabinets confondus. Ce n'est pas une fuite : le
-- fait est vrai pour tout le monde — Resend refuse désormais cette adresse pour
-- tout le compte MonRDV — et aucun cabinet ne voit la fiche d'un autre.
--
-- ── POURQUOI LE DRAPEAU S'EFFACE TOUT SEUL ──────────────────────────────────
--
-- Une adresse corrigée est une AUTRE adresse : elle n'a pas rebondi. Si le
-- drapeau survivait à la correction, le médecin verrait « cette adresse ne
-- fonctionne pas » sous une adresse juste, et finirait par ne plus croire
-- l'avertissement. Le trigger du §4 l'efface dès que l'adresse change, quel que
-- soit l'écran ou la route qui la modifie — y compris ceux écrits plus tard.
-- ============================================================================


-- ── 1) Le journal des événements reçus ──────────────────────────────────────
-- Une ligne par événement Resend traité. Deux rôles :
--
--  · IDEMPOTENCE. Resend passe par Svix, qui renvoie un même événement tant
--    qu'il n'a pas reçu de 2xx — et parfois même après. `svix_id` UNIQUE fait
--    tenir la règle « un événement n'est traité qu'une fois » par la base,
--    pas par la mémoire d'un processus serverless qui ne survit pas à la
--    requête et dont plusieurs copies tournent en parallèle.
--  · PREUVE. Quand un médecin demande « pourquoi ma secrétaire n'a rien
--    reçu ? », la réponse est ici : quelle adresse, quand, quel refus.
--
-- RLS activée SANS AUCUNE policy, comme `audit_logs` (v44) : la table n'est
-- lisible et modifiable que par le service_role. Les adresses qu'elle contient
-- appartiennent à tous les cabinets ; aucun navigateur n'a à les lire.
create table if not exists public.email_events (
  id                    uuid primary key default gen_random_uuid(),
  svix_id               text not null,
  event_type            text not null,          -- « email.bounced », « email.complained »…
  email_id              text,                   -- identifiant du message chez Resend
  -- Destinataires en minuscules, tels que le webhook les compare aux fiches.
  recipients            text[] not null default '{}'::text[],
  -- La raison APPLIQUÉE aux fiches, NULL si l'événement a été journalisé sans
  -- rien marquer (rebond temporaire : boîte pleine, serveur indisponible).
  reason                text check (reason in ('bounced', 'complained', 'suppressed')),
  bounce_type           text,                   -- « Permanent », « Transient »… (Resend)
  bounce_subtype        text,
  -- Réponse brute du serveur destinataire, tronquée par la route. Utile pour
  -- trancher « adresse inexistante » contre « serveur en panne », jamais affichée.
  detail                text,
  occurred_at           timestamptz,            -- date de l'événement chez Resend
  received_at           timestamptz not null default now(),
  patients_marques      int not null default 0,
  secretaires_marquees  int not null default 0
);

-- L'unicité par index nommé plutôt que par `unique` en ligne : un
-- `create table if not exists` sur une table déjà créée n'ajouterait pas une
-- contrainte oubliée, alors que cet index, lui, est rejouable.
create unique index if not exists uniq_email_events_svix_id on public.email_events (svix_id);

alter table public.email_events enable row level security;
-- Ceinture en plus de la RLS : aucun rôle navigateur n'a le moindre droit
-- sur la table. Une policy ajoutée par erreur un jour ne suffirait pas à
-- l'ouvrir.
revoke all on public.email_events from anon, authenticated;


-- ── 2) Le drapeau sur les fiches ────────────────────────────────────────────
-- Date + raison courte. La raison est un code, pas une phrase : c'est l'écran
-- qui choisit les mots (components/shared/AlerteAdresseEmail.tsx), et un
-- patient ou une secrétaire n'appellent pas la même formulation.
--   bounced    : le serveur destinataire a refusé définitivement (adresse inexistante)
--   complained : le destinataire a classé le message comme indésirable
--   suppressed : Resend n'a même pas tenté l'envoi, l'adresse étant déjà sur
--                sa liste de suppression (rebond ou plainte antérieurs). C'est
--                le seul moyen de marquer une fiche CRÉÉE APRÈS le rebond avec
--                la même adresse fautive.
alter table public.patients
  add column if not exists email_bounced_at    timestamptz,
  add column if not exists email_bounce_reason text;

alter table public.cabinet_staff
  add column if not exists email_bounced_at    timestamptz,
  add column if not exists email_bounce_reason text;

-- Les deux colonnes vont ensemble : une date sans raison ou une raison sans
-- date serait un état que les écrans ne savent pas dire.
alter table public.patients drop constraint if exists patients_email_bounce_check;
alter table public.patients add constraint patients_email_bounce_check check (
  (email_bounced_at is null and email_bounce_reason is null)
  or (email_bounced_at is not null and email_bounce_reason in ('bounced', 'complained', 'suppressed'))
);

alter table public.cabinet_staff drop constraint if exists cabinet_staff_email_bounce_check;
alter table public.cabinet_staff add constraint cabinet_staff_email_bounce_check check (
  (email_bounced_at is null and email_bounce_reason is null)
  or (email_bounced_at is not null and email_bounce_reason in ('bounced', 'complained', 'suppressed'))
);

-- Le webhook cherche « toutes les fiches qui portent cette adresse », sur
-- tous les cabinets. Sans index sur l'expression exacte de la comparaison,
-- chaque rebond lirait la table patients en entier. (cabinet_staff a déjà
-- idx_cabinet_staff_email sur lower(email) depuis v21 ; ses adresses sont
-- écrites en minuscules et sans espaces par app/api/staff.)
create index if not exists idx_patients_email_lower_trim
  on public.patients (lower(btrim(email)));


-- ── 3) L'écriture du webhook, en une seule transaction ─────────────────────
-- Journal ET fiches dans la MÊME transaction, et c'est tout l'intérêt de
-- passer par une fonction plutôt que par trois appels depuis la route :
--
--   Si la route insérait d'abord le journal puis échouait sur les fiches, elle
--   répondrait 500, Resend réessaierait… et trouverait le `svix_id` déjà
--   journalisé : « déjà traité ». Le rebond serait perdu pour toujours, en
--   silence — exactement le défaut que ce lot veut supprimer.
--
-- Ici, tout passe ou rien ne passe : un échec annule aussi la ligne du
-- journal, et la nouvelle tentative de Resend repart de zéro.
--
-- Deux livraisons simultanées du même événement : la seconde bute sur l'index
-- unique, ATTEND que la première se termine, puis `on conflict do nothing` la
-- déclare « déjà traitée ». Si la première a échoué, la seconde fait le travail.
--
-- SECURITY INVOKER (le défaut) : seul le service_role l'exécute, et il a déjà
-- tous les droits nécessaires. Aucune élévation, donc aucun piège `current_user`
-- (v52) — et l'appel est retiré à tous les autres rôles plus bas.
create or replace function public.enregistrer_evenement_email(
  p_svix_id     text,
  p_event_type  text,
  p_email_id    text,
  p_recipients  text[],
  p_reason      text,        -- NULL = journaliser sans marquer les fiches
  p_bounce_type text,
  p_bounce_sub  text,
  p_detail      text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_adresses    text[];
  v_patients    int := 0;
  v_secretaires int := 0;
  v_date        timestamptz := coalesce(p_occurred_at, now());
begin
  -- Normalisation ici aussi : la fonction ne doit pas dépendre du soin de
  -- l'appelant pour que « Nadia@iCloud.com » et « nadia@icloud.com » soient
  -- la même adresse.
  select coalesce(array_agg(distinct lower(btrim(a))), '{}'::text[])
    into v_adresses
    from unnest(coalesce(p_recipients, '{}'::text[])) as a
   where btrim(a) <> '';

  insert into public.email_events
    (svix_id, event_type, email_id, recipients, reason, bounce_type, bounce_subtype, detail, occurred_at)
  values
    (p_svix_id, p_event_type, p_email_id, v_adresses, p_reason, p_bounce_type, p_bounce_sub, p_detail, p_occurred_at)
  on conflict (svix_id) do nothing;

  -- FOUND est faux quand `on conflict do nothing` n'a rien inséré : cet
  -- événement a déjà été traité par une livraison précédente.
  if not found then
    return jsonb_build_object('deja_traite', true);
  end if;

  -- Une fiche déjà marquée garde sa PREMIÈRE cause et sa date : tant que
  -- l'adresse ne change pas, chaque rappel du cron vers elle déclenche un
  -- nouvel `email.suppressed`, qui sinon écraserait « adresse inexistante »
  -- par le moins parlant « déjà bloquée », et repousserait la date chaque
  -- jour. Seule exception : une cause précise (rebond, plainte) remplace
  -- « suppressed », qui ne dit pas pourquoi.
  -- (À droite du SET, les colonnes valent leur valeur AVANT la mise à jour.)
  if p_reason is not null and cardinality(v_adresses) > 0 then
    update public.patients
       set email_bounced_at    = case when email_bounce_reason is null
                                        or (email_bounce_reason = 'suppressed' and p_reason <> 'suppressed')
                                      then v_date else email_bounced_at end,
           email_bounce_reason = case when email_bounce_reason is null
                                        or (email_bounce_reason = 'suppressed' and p_reason <> 'suppressed')
                                      then p_reason else email_bounce_reason end
     where lower(btrim(email)) = any (v_adresses);
    get diagnostics v_patients = row_count;

    update public.cabinet_staff
       set email_bounced_at    = case when email_bounce_reason is null
                                        or (email_bounce_reason = 'suppressed' and p_reason <> 'suppressed')
                                      then v_date else email_bounced_at end,
           email_bounce_reason = case when email_bounce_reason is null
                                        or (email_bounce_reason = 'suppressed' and p_reason <> 'suppressed')
                                      then p_reason else email_bounce_reason end
     where lower(btrim(email)) = any (v_adresses);
    get diagnostics v_secretaires = row_count;

    update public.email_events
       set patients_marques = v_patients, secretaires_marquees = v_secretaires
     where svix_id = p_svix_id;
  end if;

  return jsonb_build_object(
    'deja_traite', false,
    'patients', v_patients,
    'secretaires', v_secretaires
  );
end $$;

-- Sans ce REVOKE, n'importe quel compte connecté pourrait appeler la fonction
-- par RPC et déclarer « rebond » l'adresse d'un confrère — exactement ce que la
-- vérification de signature de la route empêche. PostgreSQL accorde EXECUTE à
-- PUBLIC par défaut : il faut le retirer explicitement.
revoke all on function public.enregistrer_evenement_email(text, text, text, text[], text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enregistrer_evenement_email(text, text, text, text[], text, text, text, text, timestamptz)
  to service_role;


-- ── 4) Le drapeau suit l'adresse ────────────────────────────────────────────
-- Deux règles, dans cet ordre :
--
--  a) Un navigateur ne pose ni n'efface le drapeau à la main. Le médecin écrit
--     sur ses patients et sur son équipe avec son propre jeton (RLS) : sans
--     cette règle, un « enregistrer la fiche » qui renverrait d'anciennes
--     valeurs pourrait ressusciter ou effacer un drapeau. Seul le webhook
--     (service_role) le pose ; seul un CHANGEMENT D'ADRESSE l'efface.
--  b) Une adresse qui change n'a pas rebondi : drapeau effacé. Comparaison
--     insensible à la casse et aux espaces — « Nadia@icloud.com » corrigé en
--     « nadia@icloud.com » est la même boîte, et elle a toujours rebondi.
--
-- SECURITY INVOKER (le défaut), volontairement : le trigger ne fait que
-- réécrire NEW, il n'a besoin d'aucun privilège. Et c'est la SEULE façon pour
-- `current_user` de valoir le rôle réel (`authenticated` pour un navigateur,
-- `service_role` pour une route serveur) : en SECURITY DEFINER il vaudrait le
-- propriétaire de la fonction, la règle a) ne s'appliquerait jamais, et
-- personne ne s'en apercevrait — c'est ce qui est arrivé à protect_doctor_plan
-- pendant trois semaines (v52).
--
-- Une seule fonction pour les deux tables : elles portent les mêmes colonnes
-- et doivent obéir à la même règle. Deux copies finiraient par diverger.
create or replace function public.email_rebond_suit_adresse()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.email_bounced_at    := null;
      new.email_bounce_reason := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if current_user in ('authenticated', 'anon') then
    new.email_bounced_at    := old.email_bounced_at;
    new.email_bounce_reason := old.email_bounce_reason;
  end if;

  if lower(btrim(coalesce(new.email, ''))) is distinct from lower(btrim(coalesce(old.email, ''))) then
    new.email_bounced_at    := null;
    new.email_bounce_reason := null;
  end if;

  return new;
end $$;

drop trigger if exists trg_patients_email_rebond on public.patients;
create trigger trg_patients_email_rebond
  before insert or update of email, email_bounced_at, email_bounce_reason on public.patients
  for each row execute function public.email_rebond_suit_adresse();

drop trigger if exists trg_cabinet_staff_email_rebond on public.cabinet_staff;
create trigger trg_cabinet_staff_email_rebond
  before insert or update of email, email_bounced_at, email_bounce_reason on public.cabinet_staff
  for each row execute function public.email_rebond_suit_adresse();


-- ── 5) Vérification (facultatif, à lancer après la migration) ───────────────
-- Colonnes et trigger en place :
-- select table_name, column_name from information_schema.columns
--  where column_name in ('email_bounced_at', 'email_bounce_reason') order by 1, 2;
-- select tgname from pg_trigger
--  where tgname in ('trg_patients_email_rebond', 'trg_cabinet_staff_email_rebond');
--
-- La fonction n'est appelable que par le service_role (doit renvoyer false, false) :
-- select has_function_privilege('authenticated',
--   'public.enregistrer_evenement_email(text, text, text, text[], text, text, text, text, timestamptz)', 'execute'),
--        has_function_privilege('anon',
--   'public.enregistrer_evenement_email(text, text, text, text[], text, text, text, text, timestamptz)', 'execute');
--
-- Derniers événements reçus :
-- select received_at, event_type, reason, recipients, patients_marques, secretaires_marquees
--   from public.email_events order by received_at desc limit 20;

-- ============================================================================
-- Fin de la migration v59
-- ============================================================================
