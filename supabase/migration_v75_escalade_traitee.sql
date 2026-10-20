-- ============================================================================
-- Migration v75 — Une escalade traitée se referme sans s'effacer
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente. Ne pas oublier `notify pgrst, 'reload schema';` ensuite.
--
-- ── LE BESOIN ───────────────────────────────────────────────────────────────
--
-- Quand le chatbot passe la main, `escalade_le` et `escalade_motif` marquent la
-- conversation comme « un humain doit répondre ». La secrétaire la traite, puis
-- elle doit disparaître de l'encart du tableau de bord.
--
-- La solution évidente — effacer les deux colonnes — perd tout : on ne peut
-- plus compter les escalades du mois, ni savoir POURQUOI le bot a renoncé. Or
-- c'est exactement la mesure qui dira si le chatbot s'améliore : un bot qui
-- passe la main dix fois par semaine ne tient pas sa promesse, et il faut
-- pouvoir le constater.
--
-- On ajoute donc une DATE DE TRAITEMENT au lieu d'effacer. « Ouverte » devient
-- « escalade_le renseignée ET escalade_traitee_le vide » — même logique que
-- `recalls.status` (v7/v71), où un rappel reste ouvert jusqu'à ce qu'on le
-- marque `done` plutôt que de disparaître.
--
-- ── CE QUE ÇA NE RÉSOUT PAS ─────────────────────────────────────────────────
--
-- Une conversation ne porte qu'UNE escalade à la fois : si le même patient est
-- escaladé une seconde fois après traitement, la nouvelle écrase la précédente
-- dans cette ligne. Le compte des escalades OUVERTES reste exact, celui des
-- escalades HISTORIQUES est approché par défaut. Le détail complet reste dans
-- `whatsapp_messages`, qui n'efface rien.
--
-- Une table d'événements dédiée donnerait le compte exact. Elle n'est pas
-- justifiée tant que personne n'a besoin de ce chiffre au mois près.
-- ============================================================================

alter table public.whatsapp_conversations
  add column if not exists escalade_traitee_le timestamptz;

comment on column public.whatsapp_conversations.escalade_traitee_le is
  'Date à laquelle le cabinet a repris la conversation. NULL avec escalade_le renseignée = un humain doit encore répondre. Écrit par app/api/whatsapp/escalades.';

-- Les conversations qui attendent VRAIMENT quelqu'un. L'index de la v73 portait
-- sur `escalade_le is not null`, ce qui inclut désormais les escalades déjà
-- traitées : il ne sert plus l'encart, qui n'affiche que les ouvertes.
create index if not exists idx_whatsapp_conversations_escalade_ouverte
  on public.whatsapp_conversations(doctor_id, escalade_le)
  where escalade_le is not null and escalade_traitee_le is null;

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'whatsapp_conversations' and column_name = 'escalade_traitee_le';
-- select indexname from pg_indexes where indexname = 'idx_whatsapp_conversations_escalade_ouverte';

-- ============================================================================
-- Fin de la migration v75
-- ============================================================================
