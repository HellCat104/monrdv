-- v72 — Étiquettes de pathologie sur la fiche patient.
--
-- CE QUE LE TEXTE LIBRE NE SAIT PAS FAIRE
--
-- `patients.chronic_conditions` existe depuis le début, en texte libre, et il
-- RESTE. Un généraliste pouvait donc écrire « diabète type 2 déséquilibré
-- depuis mars » sur une fiche, mais pas répondre à la seule question qui
-- structure son métier : « qui sont mes diabétiques ? », « lesquels de mes
-- hypertendus n'ont pas été revus depuis six mois ? ». Un champ texte se lit,
-- il ne se cherche pas : « pas de diabète » contient le mot « diabète », et
-- « HTA », « hypertension » et « tension élevée » désignent la même maladie
-- sans jamais se ressembler.
--
-- LES DEUX COLONNES NE SE REMPLACENT PAS
--   chronic_conditions — la NUANCE clinique, celle qu'on relit avant
--                        d'examiner : l'ancienneté, l'équilibre, l'observance.
--                        Irremplaçable pour le praticien, inexploitable par la
--                        machine.
--   conditions         — l'ÉTIQUETTE, qui sert à RETROUVER une cohorte. Elle
--                        ne dit rien de l'état du patient, et n'essaie pas.
-- Faire porter les deux rôles au même champ, c'est perdre la nuance ou
-- renoncer à la recherche. Aucune donnée existante n'est touchée : rien n'est
-- migré, et surtout rien n'est DEVINÉ depuis le texte libre — une étiquette
-- fausse sur une fiche médicale est pire qu'une étiquette absente.
--
-- POURQUOI UN TABLEAU, ET PAS UNE TABLE DE LIAISON
-- Une étiquette n'a pas d'attributs propres : ni date, ni sévérité, ni
-- commentaire — tout cela est justement le rôle du texte libre. Et la liste
-- doit rester OUVERTE (lib/pathologies.ts ne fait que PROPOSER) : une table de
-- référence obligerait à déclarer une pathologie avant de pouvoir la poser sur
-- une fiche, pour aucun gain.
--
-- POURQUOI L'INDEX GIN
-- C'est lui qui rend le filtre instantané. GIN est l'index des tableaux sous
-- PostgreSQL : il indexe chaque ÉLÉMENT, pas la valeur entière, et répond donc
-- aux opérateurs de chevauchement (&&) et de contenance (@>) — ceux qu'écrit
-- une recherche de cohorte. Sans lui, « tous mes diabétiques » relit toute la
-- patientèle. Pas d'index partiel : un tableau vide ne produit aucune clé GIN,
-- les fiches sans étiquette ne pèsent donc déjà rien dans l'index.
--
-- NOT NULL DEFAULT '{}' : « aucune étiquette » est un tableau vide, jamais
-- NULL. Sinon chaque lecture et chaque filtre devraient distinguer deux façons
-- de ne rien dire, et un `conditions && ...` sur NULL ne renvoie pas false
-- mais NULL — le patient disparaîtrait silencieusement du filtre.

alter table patients add column if not exists conditions text[] not null default '{}';

create index if not exists patients_conditions_gin_idx on patients using gin (conditions);

comment on column patients.conditions is
  'Étiquettes de pathologie — servent à RETROUVER une cohorte (« tous mes diabétiques »). La nuance clinique reste dans chronic_conditions, en texte libre. Liste proposée dans lib/pathologies.ts, mais ouverte.';
