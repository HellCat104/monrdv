# Tester la sécurité de la base — ce qu'il faut créer

MonRDV n'a **pas de base de test**. Les tests automatiques (`npm test`)
vérifient la logique pure (synthèse, historique des dents, imagerie,
préparation de consultation), mais **pas** les règles de sécurité de la
base : isolation entre cabinets, droits des secrétaires, journaux
append-only. Ces règles vivent dans PostgreSQL (RLS, déclencheurs) et ne se
testent que contre une vraie base.

## Ce qu'il faut

1. **Un second projet Supabase, dédié aux tests.** Jamais la production : les
   tests créent et suppriment des cabinets et des patients.
2. **Les migrations rejouées dessus**, de `schema.sql` à la dernière, dans
   l'ordre de `ORDRE-DES-MIGRATIONS.md`.
3. **Trois comptes de test** : un dentiste A, un dentiste B (un autre
   cabinet), une secrétaire de A. Mots de passe générés, rangés dans un
   `.env.test` jamais commité.
4. **Ses clés** (`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`,
   `SUPABASE_TEST_SERVICE_KEY`) dans `.env.test`.

## Les tests à écrire alors (scripts/tests/securite.test.mjs)

| Test | Ce qu'il prouve |
|---|---|
| A crée un patient ; B lit `patients` par son id | B reçoit 0 ligne |
| B lit `dental_charts`, `consultations`, `prescriptions`, `patient_documents` du patient de A | 0 ligne partout |
| B appelle `/api/dentaire/dent`, `/visites`, `/cloture` avec le patient ou le rdv de A | 404 |
| B insère une note avec `patient_id` = patient de A | refus (déclencheur v43) |
| La secrétaire de A appelle `/api/dentaire/*` | 404 (pas de compte médecin) |
| Mise à jour d'une ligne `tooth_history` | refus (append-only v55 + v100) |
| Ligne `tooth_history` sans changement d'état, de face ni de nature | refus (contrainte v100) |

## Plusieurs dentistes dans un même cabinet

Ce test n'a pas d'objet aujourd'hui : **un compte médecin = un cabinet**.
Deux dentistes ne partagent pas de patients. Le jour où le cabinet deviendra
une entité à part entière (plusieurs praticiens, rôle assistant), ces tests
seront le filet indispensable avant de réécrire les ~130 règles de sécurité.
