-- ============================================================================
-- Migration v102 — HUIT MOTIFS DE RENDEZ-VOUS pour tous les cabinets dentaires
-- Décision d'Asmaa du 17 nov. 2026 : la liste était trop longue (une
-- cinquantaine de séances). Elle est remplacée, pour TOUS les dentistes, par :
--   Première consultation · Contrôle et détartrage · Urgence · Soins ·
--   Traitement canalaire · Extraction et chirurgie · Prothèse et implant ·
--   Orthodontie — chacun dans sa couleur.
--
-- ── À LANCER EN DEUX TEMPS ─────────────────────────────────────────────────
--   1. L'APERÇU (bloc 1) : il ne modifie RIEN. Il liste chaque cabinet
--      dentaire, combien de motifs il a, combien seront désactivés. Vérifiez
--      la liste des cabinets avant d'aller plus loin.
--   2. LE REMPLACEMENT (bloc 2) : une seule transaction, tout ou rien.
--
-- ── CE QUI EST FAIT, ET CE QUI NE L'EST PAS ────────────────────────────────
--   • Rien n'est SUPPRIMÉ : les anciens motifs sont DÉSACTIVÉS (active =
--     false), exactement comme le bouton « supprimer » des Paramètres. Les
--     rendez-vous déjà pris gardent leur motif d'origine, son nom et sa
--     couleur — l'historique ne change pas.
--   • Les lignes purement comptables du catalogue d'actes (acte = vrai,
--     rdv = faux) ne sont pas des motifs de rendez-vous : elles restent.
--   • Les nouveaux motifs n'ont PAS de tarif : un prix pré-rempli à
--     l'encaissement sur un ancien motif ne se reporte pas (on ne peut pas
--     deviner lequel des anciens prix vaut pour « Soins »). Chaque cabinet
--     fixe le sien dans Paramètres → Motifs.
--   • Un motif déjà nommé comme l'un des huit (même casse ou non) est
--     réactivé et recoloré au lieu d'être recréé.
--   • Rejouable : relancé, le bloc 2 ne crée aucun doublon.
--
-- Dentiste = spécialité ou spécialités contenant dent / stomato / orthodont /
-- odonto — la même règle que l'application (lib/dental.ts, isDentalDoctor).
-- Nécessite les migrations v86 (categorie, labo, rdv, acte) et v98 (couleur).
-- ============================================================================


-- ── BLOC 1 — APERÇU (ne modifie rien) ──────────────────────────────────────
with dentistes as (
  select d.id, d.name, d.specialty
  from public.doctors d
  where d.specialty ~* '(dent|stomato|orthodont|odonto)'
     or exists (select 1 from unnest(coalesce(d.specialties, '{}'::text[])) s where s ~* '(dent|stomato|orthodont|odonto)')
),
huit(nom) as (values
  ('première consultation'), ('contrôle et détartrage'), ('urgence'), ('soins'),
  ('traitement canalaire'), ('extraction et chirurgie'), ('prothèse et implant'), ('orthodontie')
)
select dn.name as cabinet, dn.specialty,
       count(ct.id) filter (where ct.active) as motifs_actifs_aujourdhui,
       count(ct.id) filter (where ct.active
         and lower(btrim(ct.name)) not in (select nom from huit)
         and not (coalesce(ct.acte, false) and not coalesce(ct.rdv, true))) as seront_desactives
from dentistes dn
left join public.consultation_types ct on ct.doctor_id = dn.id
group by dn.name, dn.specialty
order by dn.name;


-- ── BLOC 2 — REMPLACEMENT (après vérification de l'aperçu) ─────────────────
begin;

create temp table v102_huit (nom text, minutes int, couleur text, rdv boolean, labo boolean) on commit drop;
insert into v102_huit values
  ('Première consultation',   30, 'ardoise',   true,  false),
  ('Contrôle et détartrage',  30, 'menthe',    true,  false),
  ('Urgence',                 20, 'rose',      true,  false),
  ('Soins',                   45, 'turquoise', false, false),
  ('Traitement canalaire',    60, 'violet',    false, false),
  ('Extraction et chirurgie', 45, 'citron',    false, false),
  ('Prothèse et implant',     45, 'indigo',    false, true),
  ('Orthodontie',             30, 'fuchsia',   false, false);

create temp table v102_dentistes on commit drop as
  select d.id from public.doctors d
  where d.specialty ~* '(dent|stomato|orthodont|odonto)'
     or exists (select 1 from unnest(coalesce(d.specialties, '{}'::text[])) s where s ~* '(dent|stomato|orthodont|odonto)');

-- 1. Un motif qui porte déjà l'un des huit noms : réactivé, rangé, coloré.
update public.consultation_types ct
   set active = true, categorie = h.nom, couleur = h.couleur
  from v102_huit h, v102_dentistes d
 where ct.doctor_id = d.id
   and lower(btrim(ct.name)) = lower(h.nom);

-- 2. Les motifs qui manquent sont créés.
insert into public.consultation_types
  (doctor_id, name, duration_minutes, default_price, categorie, couleur, labo, rdv, acte, active)
select d.id, h.nom, h.minutes, null, h.nom, h.couleur, h.labo, h.rdv, false, true
  from v102_dentistes d cross join v102_huit h
 where not exists (
   select 1 from public.consultation_types ct
    where ct.doctor_id = d.id and lower(btrim(ct.name)) = lower(h.nom)
 );

-- 3. Les autres motifs de rendez-vous sont désactivés (jamais supprimés).
update public.consultation_types ct
   set active = false
  from v102_dentistes d
 where ct.doctor_id = d.id
   and ct.active
   and lower(btrim(ct.name)) not in (select lower(nom) from v102_huit)
   and not (coalesce(ct.acte, false) and not coalesce(ct.rdv, true));

commit;

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) : huit motifs actifs par cabinet dentaire ────
-- select d.name, count(*) filter (where ct.active) as actifs
--   from public.doctors d join public.consultation_types ct on ct.doctor_id = d.id
--  where d.specialty ~* '(dent|stomato|orthodont|odonto)'
--  group by d.name order by d.name;

-- ============================================================================
-- Fin de la migration v102
-- ============================================================================
