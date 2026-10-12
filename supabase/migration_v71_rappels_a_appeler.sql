-- v71 — Un rappel de suivi sans e-mail n'est plus « envoyé », il est « à appeler ».
--
-- CE QUI SE PASSAIT
-- L'e-mail est facultatif à la réservation : une grande partie des patients
-- n'en a pas. Quand la tâche quotidienne (app/api/cron/reminders) tombait sur
-- un rappel « revoir dans 6 mois » dont le patient n'a pas d'adresse, elle
-- marquait la ligne `status = 'sent'` pour ne pas boucler — donc PERSONNE
-- n'était prévenu, ni le patient, ni le cabinet, et le rappel disparaissait
-- en silence. C'est exactement le rendez-vous que le médecin perd sans jamais
-- savoir qu'il l'a perdu.
--
-- CE QUE LA V71 CHANGE
-- Un nouveau statut `a_rappeler` : « le mécanisme automatique ne peut rien
-- faire, il faut décrocher le téléphone ». Il reste un rappel OUVERT, donc il
-- s'affiche sur le tableau de bord (composants/dashboard/RappelsDus) jusqu'à
-- ce qu'on le marque traité (`done`). `sent_at` reste NULL : aucun message
-- n'est parti, et prétendre le contraire fausserait tout diagnostic ultérieur.
--
-- LA CONTRAINTE N'EXISTAIT PAS
-- `recalls.status` (v7) était un TEXT libre, les statuts n'étaient qu'un
-- commentaire en fin de ligne. Une faute de frappe dans une route suffisait
-- donc à créer un statut fantôme qu'aucun écran ne sait afficher — et c'est
-- un statut fantôme qui fait disparaître un rappel. On la pose ici, en
-- NOT VALID : elle protège les écritures à venir sans faire échouer la
-- migration sur d'éventuelles lignes historiques (même raisonnement qu'en v45).
--
-- Le code tourne AVANT comme APRÈS cette migration : sans contrainte en base
-- l'écriture de `a_rappeler` passe déjà ; si une contrainte l'interdit encore,
-- le cron retombe sur l'ancien comportement (23514 intercepté) plutôt que
-- d'échouer et de laisser les rappels du lendemain en plan.

alter table public.recalls drop constraint if exists recalls_status_check;
alter table public.recalls add constraint recalls_status_check check (
  status in ('pending', 'a_rappeler', 'sent', 'done', 'cancelled')
) not valid;

-- Le tableau de bord demande « mes rappels ouverts dont l'échéance tombe dans
-- les 7 jours », à chaque chargement d'écran. idx_recalls_due (v7) ne couvre
-- que 'pending' et ignore le médecin : il ne sert plus qu'au cron.
create index if not exists idx_recalls_a_traiter
  on public.recalls (doctor_id, due_date)
  where status in ('pending', 'a_rappeler');

-- ============================================================================
-- Fin de la migration v71
-- ============================================================================
