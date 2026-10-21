-- ============================================================================
-- Migration v76 — La salle d'attente parle enfin dans les deux sens
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente. Ne pas oublier `notify pgrst, 'reload schema';` ensuite.
--
-- ── LE BESOIN ───────────────────────────────────────────────────────────────
--
-- La secrétaire pointe Arrivé → En consultation → Parti. Le médecin n'en voit
-- presque rien : la pastille « Présent » apparaît sur sa ligne, mais elle dit
-- « est venu », pas « attend maintenant » — elle reste après la consultation.
-- Et comme MonRDV note QUE le patient est arrivé, jamais QUAND, personne ne
-- peut dire depuis combien de temps il patiente ni dans quel ordre faire
-- entrer. Dans l'autre sens, rien ne remonte du cabinet vers l'accueil : la
-- consigne « revoyez-le dans quinze jours » se perd entre la porte du bureau
-- et le comptoir.
--
-- Quatre colonnes, toutes sur `appointments`, et un déclencheur.
--
-- ── POURQUOI UN DÉCLENCHEUR PLUTÔT QUE DU CODE ──────────────────────────────
--
-- Les heures d'arrivée et d'entrée en consultation sont posées par la BASE, pas
-- par l'application. Quatre chemins différents écrivent déjà `queue_status` —
-- l'agenda de la secrétaire, sa salle d'attente, l'agenda du médecin, la
-- clôture de consultation — et il s'en ajoutera d'autres. Un seul oubli dans
-- l'un d'eux et la durée d'attente affichée serait fausse, ce qui est pire que
-- de ne rien afficher : on prend des décisions dessus.
--
-- Le déclencheur est SECURITY INVOKER (le défaut) et ne lit aucune table : il
-- ne fait que remplir NEW. Voir la leçon de la v52 sur SECURITY DEFINER.
--
-- ── CE QUE ÇA NE FAIT PAS ───────────────────────────────────────────────────
--
-- `appel_suivant_le` (« faites entrer le suivant ») est un signal FUGACE, pas
-- un historique : la secrétaire l'efface d'un clic, et l'écran l'ignore passé
-- un quart d'heure. Un appel oublié ne doit pas clignoter jusqu'au soir.
--
-- Rien ici n'est une file d'attente au sens strict : l'ordre de passage reste
-- celui de l'agenda, et le médecin fait entrer qui il veut. On donne les
-- heures, on ne décide pas à sa place.
--
-- ── DROITS ──────────────────────────────────────────────────────────────────
--
-- Aucun GRANT à écrire : ce sont des colonnes ajoutées à une table qui existe
-- déjà, et les droits de `appointments` portent sur la table entière. Le
-- changement Supabase du 30 octobre 2026 ne concerne que les CREATE TABLE.
-- ============================================================================

-- ── 1) Les quatre colonnes ──────────────────────────────────────────────────

alter table public.appointments
  add column if not exists queue_arrived_at  timestamptz,
  add column if not exists queue_started_at  timestamptz,
  add column if not exists reprogrammer_jours smallint,
  add column if not exists appel_suivant_le  timestamptz;

comment on column public.appointments.queue_arrived_at is
  'Heure du pointage « arrivé ». Posée par le déclencheur trg_horodate_file, jamais par l''application. Sert la durée d''attente affichée au médecin comme à l''accueil.';

comment on column public.appointments.queue_started_at is
  'Heure d''entrée en consultation. Même déclencheur. Sert le retard estimé affiché à l''accueil.';

comment on column public.appointments.reprogrammer_jours is
  'Délai, en jours, que le médecin demande à l''accueil de reprogrammer (« revoyez-le dans 15 jours »). NULL = rien à faire. Effacé par la secrétaire une fois le rendez-vous donné.';

comment on column public.appointments.appel_suivant_le is
  'Le médecin demande le patient suivant. Signal fugace : effacé par la secrétaire, et ignoré par l''écran passé 15 minutes.';

-- Un délai de reprogrammation doit rester plausible : la borne évite qu''une
-- faute de frappe demande un rendez-vous dans huit ans.
alter table public.appointments
  drop constraint if exists appointments_reprogrammer_jours_check;
alter table public.appointments
  add constraint appointments_reprogrammer_jours_check
  check (reprogrammer_jours is null or (reprogrammer_jours between 1 and 730));

-- ── 2) L'horodatage, posé en base ───────────────────────────────────────────

create or replace function public.horodate_file_attente()
returns trigger language plpgsql set search_path = public as $$
declare
  a_change boolean;
begin
  -- `OLD` n'existe pas à l'insertion : le lire y lèverait « record "old" is not
  -- assigned yet ». Et c'est loin d'être un cas théorique — le patient sans
  -- rendez-vous est créé DIRECTEMENT en « arrivé », c'est l'insertion qui doit
  -- poser son heure.
  if tg_op = 'INSERT' then
    a_change := new.queue_status is not null;
  else
    a_change := new.queue_status is distinct from old.queue_status;
  end if;

  -- Entrée dans un état : on date, une seule fois. Repasser « arrivé » sur un
  -- patient déjà arrivé ne remet pas le compteur à zéro — sinon une secrétaire
  -- qui reclique ferait disparaître vingt minutes d'attente.
  if a_change then
    if new.queue_status = 'arrive' and new.queue_arrived_at is null then
      new.queue_arrived_at := now();
    end if;
    if new.queue_status = 'en_consultation' and new.queue_started_at is null then
      new.queue_started_at := now();
    end if;
    -- Remise à zéro explicite (bouton « Réinitialiser ») : on efface les deux,
    -- sans quoi le patient resterait « arrivé il y a 3 h » sans l'être.
    if new.queue_status is null then
      new.queue_arrived_at := null;
      new.queue_started_at := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_horodate_file on public.appointments;
create trigger trg_horodate_file
  before insert or update on public.appointments
  for each row execute function public.horodate_file_attente();

-- ── 3) Les deux listes de travail de l'accueil ──────────────────────────────
--
-- Index partiels : ils ne pèsent que sur les lignes concernées, qui sont une
-- poignée par jour, et non sur toute la table des rendez-vous.

create index if not exists idx_appointments_a_reprogrammer
  on public.appointments(doctor_id, date)
  where reprogrammer_jours is not null;

create index if not exists idx_appointments_appel_suivant
  on public.appointments(doctor_id, appel_suivant_le)
  where appel_suivant_le is not null;

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'appointments'
--    and column_name in ('queue_arrived_at','queue_started_at','reprogrammer_jours','appel_suivant_le');
-- select tgname, tgenabled from pg_trigger where tgname = 'trg_horodate_file';

-- ============================================================================
-- Fin de la migration v76
-- ============================================================================
