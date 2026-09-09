-- ============================================================================
-- Migration v54 — Devis (plans de traitement chiffrés) et paiement échelonné
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
--
-- ── POURQUOI CES QUATRE TABLES ET PAS UNE SEULE ─────────────────────────────
--
-- En dentisterie, la consultation ne se solde pas par un prix unique : elle
-- débouche sur un PLAN DE TRAITEMENT chiffré (« devis ») — une liste d'actes,
-- chacun rattaché à une dent, chacun avec son prix. Le patient l'accepte, puis
-- règle en plusieurs fois sur des mois : personne ne pose 6000 DH d'implant sur
-- la table en une fois. Le modèle « un rendez-vous = un montant » (colonne
-- appointments.amount_paid) ne sait pas représenter ça.
--
-- Quatre notions distinctes, donc quatre tables, parce que les confondre
-- fausserait la comptabilité :
--
--  1. UN DEVIS N'EST PAS DU CHIFFRE D'AFFAIRES.
--     `quotes` + `quote_items` décrivent ce qui est PROPOSÉ. Un devis accepté à
--     20 000 DH ne produit pas un centime de recette. La comptabilité des
--     cabinets marocains est une comptabilité de CAISSE : seul l'argent
--     réellement encaissé compte, à sa date d'encaissement. C'est pour cela que
--     le montant du devis n'est stocké nulle part comme un « total à
--     comptabiliser » : il se recalcule à partir des lignes, et il ne sert qu'à
--     informer le patient.
--
--  2. PRÉVU ≠ REÇU.
--     `quote_installments` (l'échéancier : « 500 DH le 15 de chaque mois ») dit
--     ce que le patient DOIT payer et quand. `quote_payments` dit ce qu'il A
--     payé. Ces deux tables ne s'additionnent jamais et ne se croisent pas :
--     l'échéancier est purement indicatif, il ne crée aucun revenu, il ne
--     s'« éteint » pas quand un versement arrive. Une seule table avec une
--     colonne « payé oui/non » aurait fini par être sommée dans les
--     statistiques et aurait gonflé le CA avec de l'argent jamais reçu.
--
--  3. UNE SEULE SOURCE PAR ENCAISSEMENT.
--     L'argent d'un devis se saisit sur le devis (`quote_payments`), JAMAIS
--     aussi sur le rendez-vous (`appointments.amount_paid`). Sinon la même
--     somme est comptée deux fois dans la caisse, les factures et le CA. D'où
--     la colonne `appointments.quote_id` ajoutée plus bas et le trigger qui
--     refuse un `amount_paid` sur un RDV rattaché à un devis : la règle est
--     tenue en base, pas seulement dans l'interface.
--
--  4. NUMÉROTATION UNIQUE.
--     Un versement encaissé sur un devis est un encaissement comme un autre :
--     il reçoit un numéro `F-AAAA-NNNN` issu du MÊME compteur `invoice_counters`
--     (v12/v13) que les factures de rendez-vous. Deux séquences séparées
--     produiraient deux documents portant le même numéro le même jour — faute
--     comptable qu'un fiduciaire ou un contrôle fiscal relève immédiatement.
--     Comme en v47, le numéro n'est attribué qu'aux cabinets « complet » :
--     l'encaissement reste ouvert aux deux forfaits, la facture non.
-- ============================================================================


-- ── 1) Le devis lui-même ────────────────────────────────────────────────────
-- Volontairement sans numéro de série : un devis n'est pas une pièce
-- comptable. Le numéro légal apparaît à l'encaissement, sur quote_payments.
create table if not exists public.quotes (
  id           uuid primary key default gen_random_uuid(),
  doctor_id    uuid not null references public.doctors(id)  on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  label        text,                                  -- ex. « Réhabilitation secteur 1 »
  -- brouillon : en cours de rédaction · propose : remis au patient
  -- accepte   : le patient a dit oui  · refuse  : il a dit non
  -- termine   : tous les actes sont réalisés · annule : abandonné
  status       text not null default 'brouillon'
               check (status in ('brouillon','propose','accepte','refuse','termine','annule')),
  notes        text,
  -- Dates d'étape : utiles au praticien (« ce devis traîne depuis 3 mois »),
  -- jamais utilisées comme date comptable — celle-ci est sur les versements.
  proposed_at  timestamptz,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_quotes_patient on public.quotes (patient_id, created_at desc);
create index if not exists idx_quotes_doctor  on public.quotes (doctor_id, status);

alter table public.quotes enable row level security;
drop policy if exists "Praticien : ses devis" on public.quotes;
create policy "Praticien : ses devis" on public.quotes
  for all
  using      (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));


-- ── 2) Les lignes du devis ──────────────────────────────────────────────────
-- `tooth` est facultatif : un détartrage ou une radio panoramique ne vise
-- aucune dent en particulier. Quand il est renseigné, c'est un numéro FDI
-- (11-48), stocké en texte comme dans dental_charts (v20) pour rester
-- comparable à l'odontogramme sans conversion.
--
-- `doctor_id` est dupliqué depuis le devis : la policy RLS reste alors la même
-- que partout ailleurs dans l'application (comparaison directe, pas de
-- sous-requête sur quotes). Le trigger plus bas garantit la cohérence.
create table if not exists public.quote_items (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references public.quotes(id)  on delete cascade,
  doctor_id    uuid not null references public.doctors(id) on delete cascade,
  tooth        text,                                     -- n° FDI, ex. « 16 » (optionnel)
  label        text not null,                            -- ex. « Couronne céramo-métallique »
  unit_price   numeric(10,2) not null default 0 check (unit_price >= 0),
  quantity     int           not null default 1 check (quantity > 0),
  -- Suivi de réalisation : l'acte a-t-il été fait, et lors de quel RDV.
  -- ON DELETE SET NULL : supprimer un rendez-vous ne doit pas effacer le fait
  -- que l'acte a été réalisé.
  done         boolean not null default false,
  done_at      timestamptz,
  appointment_id uuid references public.appointments(id) on delete set null,
  position     int not null default 0,                   -- ordre d'affichage
  created_at   timestamptz not null default now()
);

create index if not exists idx_quote_items_quote on public.quote_items (quote_id, position, created_at);

alter table public.quote_items enable row level security;
drop policy if exists "Praticien : ses lignes de devis" on public.quote_items;
create policy "Praticien : ses lignes de devis" on public.quote_items
  for all
  using      (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));


-- ── 3) Les versements réellement encaissés ──────────────────────────────────
-- LA table comptable de ce lot. Chaque ligne est de l'argent reçu, à sa date
-- de règlement. `patient_id` est dupliqué ici aussi : la caisse et la liste des
-- factures affichent un nom de patient, et sans cette colonne chaque écran
-- devrait traverser quotes pour l'obtenir.
create table if not exists public.quote_payments (
  id             uuid primary key default gen_random_uuid(),
  quote_id       uuid not null references public.quotes(id)   on delete cascade,
  doctor_id      uuid not null references public.doctors(id)  on delete cascade,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  amount         numeric(10,2) not null check (amount > 0),
  payment_method text check (payment_method in ('especes','carte','cheque','virement')),
  -- Date comptable du versement. Modifiable à la saisie : un chèque encaissé
  -- lundi peut être enregistré mercredi, il appartient au lundi.
  paid_at        timestamptz not null default now(),
  invoice_no     text,                                   -- F-AAAA-NNNN (trigger ci-dessous)
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_quote_payments_quote  on public.quote_payments (quote_id, paid_at);
create index if not exists idx_quote_payments_doctor on public.quote_payments (doctor_id, paid_at desc);

alter table public.quote_payments enable row level security;
drop policy if exists "Praticien : ses versements de devis" on public.quote_payments;
create policy "Praticien : ses versements de devis" on public.quote_payments
  for all
  using      (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));


-- ── 4) L'échéancier prévisionnel ────────────────────────────────────────────
-- Purement indicatif : « on prévoit 500 DH le 15 de chaque mois ». Aucune
-- colonne « payé » ici, volontairement — le jour où une telle colonne existe,
-- quelqu'un finit par sommer l'échéancier au lieu des versements et le chiffre
-- d'affaires devient faux. Ce qui a été reçu se lit dans quote_payments, et
-- nulle part ailleurs.
create table if not exists public.quote_installments (
  id         uuid primary key default gen_random_uuid(),
  quote_id   uuid not null references public.quotes(id)  on delete cascade,
  doctor_id  uuid not null references public.doctors(id) on delete cascade,
  due_date   date not null,
  amount     numeric(10,2) not null check (amount > 0),
  label      text,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_installments_quote on public.quote_installments (quote_id, due_date);

alter table public.quote_installments enable row level security;
drop policy if exists "Praticien : ses échéanciers" on public.quote_installments;
create policy "Praticien : ses échéanciers" on public.quote_installments
  for all
  using      (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));


-- ── 5) Cohérence : une ligne ne peut pas appartenir à un autre cabinet ──────
-- Sans cela, un doctor_id falsifié dans une ligne enfant rendrait la RLS
-- inopérante (la policy compare doctor_id, pas le devis parent).
create or replace function public.quote_child_same_doctor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare d uuid;
begin
  select doctor_id into d from public.quotes where id = new.quote_id;
  if d is null then
    raise exception 'Devis introuvable';
  end if;
  -- On ne fait pas confiance au doctor_id envoyé : on le remplace par celui du
  -- devis parent, seule source de vérité.
  new.doctor_id := d;
  return new;
end $$;

drop trigger if exists trg_quote_items_same_doctor on public.quote_items;
create trigger trg_quote_items_same_doctor
  before insert or update on public.quote_items
  for each row execute function public.quote_child_same_doctor();

drop trigger if exists trg_quote_payments_same_doctor on public.quote_payments;
create trigger trg_quote_payments_same_doctor
  before insert or update on public.quote_payments
  for each row execute function public.quote_child_same_doctor();

drop trigger if exists trg_quote_installments_same_doctor on public.quote_installments;
create trigger trg_quote_installments_same_doctor
  before insert or update on public.quote_installments
  for each row execute function public.quote_child_same_doctor();


-- ── 6) Numérotation des versements : MÊME compteur que les factures de RDV ──
-- Copie conforme de assign_invoice_no() (v13 + v47), sur invoice_counters.
-- L'UPSERT est atomique sur la ligne (doctor_id, year) : deux transactions
-- concurrentes — un versement de devis et un encaissement de RDV — se
-- sérialisent sur cette même ligne, donc aucune ne peut recevoir le numéro de
-- l'autre. Et comme le numéro est attribué DANS la transaction d'écriture, un
-- rollback annule aussi l'incrément : la séquence reste sans trou.
create or replace function public.assign_quote_payment_invoice_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare y int; n int; p text; dr uuid;
begin
  if new.invoice_no is null then
    -- Le médecin est relu depuis le DEVIS PARENT, jamais depuis le doctor_id
    -- reçu. Deux raisons : on ne fait confiance à aucune valeur envoyée quand
    -- il s'agit d'incrémenter un compteur de factures, et surtout l'ordre
    -- d'exécution des triggers est alphabétique — celui-ci passe AVANT
    -- trg_quote_payments_same_doctor, qui n'a donc pas encore corrigé le
    -- champ. Résoudre ici rend la numérotation indépendante de cet ordre.
    select q.doctor_id, d.plan into dr, p
      from public.quotes q join public.doctors d on d.id = q.doctor_id
     where q.id = new.quote_id;
    if dr is null then
      raise exception 'Devis introuvable';
    end if;
    new.doctor_id := dr;
    -- Forfait Agenda : on encaisse, mais aucune facture n'est émise (v47).
    if p is distinct from 'complet' then
      return new;
    end if;
    y := extract(year from (now() at time zone 'Africa/Casablanca'))::int;
    insert into public.invoice_counters(doctor_id, year, last_no) values (dr, y, 1)
    on conflict (doctor_id, year) do update set last_no = invoice_counters.last_no + 1
    returning last_no into n;
    new.invoice_no := 'F-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_quote_payment_invoice_no on public.quote_payments;
create trigger trg_assign_quote_payment_invoice_no
  before insert on public.quote_payments
  for each row execute function public.assign_quote_payment_invoice_no();


-- ── 7) Immuabilité du numéro (même règle que trg_protect_invoiced, v17) ─────
-- Supprimer un versement numéroté laisserait un trou dans la séquence : on
-- l'interdit. La correction passe par un avoir (voir §9).
create or replace function public.protect_invoiced_quote_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.invoice_no is not null then
      raise exception 'Ce versement est facturé (%) : émettez un avoir au lieu de le supprimer', old.invoice_no;
    end if;
    return old;
  else
    if old.invoice_no is not null and new.invoice_no is distinct from old.invoice_no then
      raise exception 'Le numéro de facture est immuable (%)', old.invoice_no;
    end if;
    -- Le montant d'un versement facturé ne se retouche pas non plus : la
    -- facture est déjà partie chez le patient.
    if old.invoice_no is not null and new.amount is distinct from old.amount then
      raise exception 'Le montant d''un versement facturé (%) ne peut plus être modifié : émettez un avoir', old.invoice_no;
    end if;
    return new;
  end if;
end $$;

drop trigger if exists trg_protect_invoiced_quote_payment on public.quote_payments;
create trigger trg_protect_invoiced_quote_payment
  before update or delete on public.quote_payments
  for each row execute function public.protect_invoiced_quote_payment();


-- ── 8) Une seule source par encaissement ────────────────────────────────────
-- Un rendez-vous peut être rattaché au devis dont il exécute les actes. Dans ce
-- cas son propre amount_paid doit rester vide : l'argent de ce RDV est déjà
-- compté dans quote_payments. Sans ce verrou, la caisse du jour additionnerait
-- les deux et le CA doublerait.
alter table public.appointments add column if not exists quote_id uuid
  references public.quotes(id) on delete set null;
create index if not exists idx_appointments_quote on public.appointments (quote_id);

create or replace function public.forbid_paid_amount_on_quoted_appointment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quote_id is not null and new.amount_paid is not null then
    raise exception 'Ce rendez-vous est réglé via le devis : saisissez le versement sur le devis, pas sur le rendez-vous.';
  end if;
  return new;
end $$;

drop trigger if exists trg_forbid_paid_on_quoted_appointment on public.appointments;
create trigger trg_forbid_paid_on_quoted_appointment
  before insert or update on public.appointments
  for each row execute function public.forbid_paid_amount_on_quoted_appointment();


-- ── 9) Avoirs sur un versement de devis ─────────────────────────────────────
-- On réutilise la table credit_notes (v17) et sa série AV-AAAA-NNNN plutôt que
-- d'en créer une seconde : un avoir est un avoir, quelle que soit la facture
-- qu'il corrige. Les écrans qui totalisent déjà les avoirs du médecin
-- (statistiques, factures) prennent donc les nouveaux en compte sans
-- modification.
alter table public.credit_notes add column if not exists quote_payment_id uuid
  references public.quote_payments(id) on delete set null;
create index if not exists idx_credit_notes_quote_payment on public.credit_notes (quote_payment_id);

-- ============================================================================
-- Fin de la migration v54
-- ============================================================================
