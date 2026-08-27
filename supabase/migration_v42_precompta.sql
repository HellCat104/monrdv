-- v42 — Pré-comptabilité : justificatifs de dépense
--
-- La colonne `category` existe déjà (v12) mais n'était pas exploitée : elle
-- accueille désormais une liste courte et fermée côté application.
-- Il manquait en revanche de quoi rattacher la pièce justificative — c'est
-- elle que le fiduciaire réclame, et sans elle le pack comptable serait
-- incomplet.

alter table expenses add column if not exists receipt_path text;

-- Dépôt des justificatifs, privé (une facture d'achat n'a rien de public)
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

-- Même règle que pour les documents patients : le premier dossier du chemin
-- est l'identifiant du médecin, qui ne voit donc que ses propres fichiers.
drop policy if exists "Médecin gère ses justificatifs" on storage.objects;
create policy "Médecin gère ses justificatifs" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] in (
      select id::text from doctors where email = auth.jwt() ->> 'email'
    )
  )
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] in (
      select id::text from doctors where email = auth.jwt() ->> 'email'
    )
  );
