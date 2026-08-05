-- v40 — Code délégué (parrainage commercial)
-- Saisi librement par le médecin à l'inscription (facultatif) : permet de
-- savoir quel délégué a amené quel médecin. Normalisé en MAJUSCULES côté API
-- pour que « adham01 » et « ADHAM01 » comptent comme un seul code.

alter table doctors add column if not exists referral_code text;

-- Recherche/regroupement par délégué dans l'admin
create index if not exists idx_doctors_referral_code
  on doctors (referral_code)
  where referral_code is not null;
