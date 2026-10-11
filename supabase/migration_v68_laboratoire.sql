-- v68 — Travaux de laboratoire (prothèse).
--
-- LE PROBLÈME N'EST PAS D'ENREGISTRER, C'EST DE NE PAS DÉCOUVRIR TROP TARD
--
-- La couronne qui n'est pas revenue le jour de la pose est le premier motif
-- d'appel et de rendez-vous perdu dans un cabinet dentaire. La table porte donc
-- DEUX dates distinctes : celle de l'envoi et celle du RETOUR ATTENDU. C'est la
-- seconde qui permet d'alerter avant que le patient ne soit dans le fauteuil.
--
-- RATTACHEMENTS, TOUS FACULTATIFS
--   quote_item_id  — la ligne de devis d'où vient le travail (« couronne, 16 »).
--                    Facultatif : une réparation urgente naît sans devis.
--   appointment_id — le rendez-vous de POSE prévu. C'est lui qui donne son sens
--                    à l'alerte : « pose jeudi, travail pas revenu ».
--   ON DELETE SET NULL : supprimer un devis ou déplacer un rendez-vous ne doit
--   pas effacer la trace d'un travail parti chez le prothésiste.
--
-- L'ARGENT RESTE UNE DÉCISION DU PRATICIEN
--   `cost` est ce que le laboratoire facture. Il ne devient une dépense
--   comptable que si le médecin clique « Ajouter à la compta » — à réception de
--   la facture du prothésiste, pas à l'envoi de l'empreinte. `cost_expense_id`
--   garde le lien, et empêche de compter deux fois la même somme.

create table if not exists lab_works (
  id              uuid primary key default gen_random_uuid(),
  doctor_id       uuid not null references doctors(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  quote_item_id   uuid references quote_items(id) on delete set null,
  appointment_id  uuid references appointments(id) on delete set null,

  lab_name     text,
  work_type    text,
  -- Numéros FDI concernés, dans l'ordre de saisie : un bridge en porte plusieurs.
  teeth        text[] not null default '{}',
  shade        text,
  material     text,
  instructions text,

  sent_at      date,
  due_at       date,
  received_at  date,

  status text not null default 'a_envoyer'
    check (status in ('a_envoyer','envoye','recu','pose','retour_labo','annule')),

  cost            numeric(10,2) check (cost is null or cost >= 0),
  cost_expense_id uuid references expenses(id) on delete set null,

  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Le tableau de bord lit « ce qui doit revenir » : statut + date de retour.
create index if not exists idx_lab_works_doctor_due on lab_works (doctor_id, status, due_at);
create index if not exists idx_lab_works_patient    on lab_works (patient_id, created_at desc);

alter table lab_works enable row level security;

drop policy if exists "Praticien : ses travaux de laboratoire" on lab_works;
create policy "Praticien : ses travaux de laboratoire" on lab_works
  for all
  using      (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'));

-- ── Le nom du patient sur le bon de travail ────────────────────────────────
-- Certains praticiens ne veulent pas que le nom de leurs patients circule chez
-- le prothésiste. Par défaut : les initiales — le choix qui ne peut pas se
-- retourner contre le cabinet. Celui qui veut le nom complet le décide.
alter table doctors
  add column if not exists lab_slip_naming text not null default 'initiales'
  check (lab_slip_naming in ('initiales','complet'));
