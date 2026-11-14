// Les tests de la feuille de soins pré-remplie (lib/feuille-preremplie.ts)
// et de la cotation officielle (lib/actes-dentaires.ts).
//
// Une ligne mal cotée ne fait pas planter l'écran : elle fait revenir le
// dossier de la CNSS, des semaines plus tard. Ces tests figent ce que dit le
// texte — NGAP chapitre VII, convention AMO du 28 juillet 2006.
import test from 'node:test'
import assert from 'node:assert/strict'
import { actesDeLaSeance, ligneCotee, codeDuLibelle } from './feuille-preremplie.js'
import { cotationDe, acteParCode, canalairePourDent, ACTES_DENTAIRES } from './actes-dentaires.js'
import { alertesNgap, ageAu } from './feuille-regles.js'

const RDV = 'rdv-1'
const ev = (tooth, after, natures, sur = {}) => ({
  id: `${tooth}-${Math.random()}`, tooth, states_before: [], states_after: after,
  natures_after: natures, appointment_id: RDV, note: null, actor_role: 'medecin',
  actor_email: null, created_at: '2026-11-14T10:00:00Z', ...sur,
})

// ── La cotation officielle ──────────────────────────────────────────────────

test('cotation : les coefficients et valeurs du texte officiel', () => {
  assert.deepEqual(cotationDe('D700'), { lettreCle: 'D', coefficient: 10, valeurCle: 17.5, tnr: 175 })
  assert.deepEqual(cotationDe('D708'), { lettreCle: 'D', coefficient: 12, valeurCle: 17.5, tnr: 210 })
  assert.deepEqual(cotationDe('D706'), { lettreCle: 'D', coefficient: 25, valeurCle: 17.5, tnr: 437.5 })
  // La prothèse a sa propre valeur de clé : 12,50 DH.
  assert.deepEqual(cotationDe('D754'), { lettreCle: 'D', coefficient: 180, valeurCle: 12.5, tnr: 2250 })
  // L'ODF est un forfait, pas une valeur de clé.
  assert.equal(cotationDe('D629').valeurCle, null)
  assert.equal(cotationDe('D629').tnr, 1500)
})

test('cotation : un code inconnu n\'est jamais deviné', () => {
  assert.equal(cotationDe('X999'), null)
  assert.equal(cotationDe(''), null)
})

test('catalogue : les codes corrigés désignent bien l\'acte du texte', () => {
  assert.match(acteParCode('D714').libelle, /suivantes/)      // pas « dent de lait »
  assert.match(acteParCode('D715').libelle, /dent de lait/)
  assert.match(acteParCode('D755').libelle, /jacket/)         // pas « inlay-core »
  assert.match(acteParCode('D758').libelle, /Inlay-core/)
  assert.equal(acteParCode('D719'), null)                     // anesthésie générale : pas au cabinet
})

test('catalogue : chaque acte de la nomenclature n\'y est qu\'une fois', () => {
  const codes = ACTES_DENTAIRES.filter((a) => !a.assimile).map((a) => a.code)
  assert.equal(new Set(codes).size, codes.length)
})

test('assimilation : le code de référence garde son acte, l\'assimilé emprunte sa cotation', () => {
  assert.match(acteParCode('D510').libelle, /bride fibreuse/)
  const frenectomie = ACTES_DENTAIRES.find((a) => a.assimile && /Frénectomie/.test(a.libelle))
  assert.equal(frenectomie.code, 'D510')
  assert.equal(frenectomie.coefficient, 10)
  assert.equal(frenectomie.accord, true)
  // Prothèse maxillo-faciale : la convention ne fixe pas la valeur, on ne l'invente pas.
  assert.equal(cotationDe('D806').valeurCle, null)
})

test('NGAP art. 9 A : consultation et acte le même jour', () => {
  const al = alertesNgap([
    { code: 'C', label: 'Consultation', lettre_cle: 'C', coefficient: 1, amount: 200, acte_date: '2026-11-14', tooth: null },
    { code: 'D708', label: 'Détartrage', lettre_cle: 'D', coefficient: 12, amount: 400, acte_date: '2026-11-14', tooth: null },
  ], '2026-11-14')
  assert.ok(al.some((a) => /Consultation et acte/.test(a.titre)))
})

test('NGAP art. 9 B : le deuxième acte à 50 %, les extractions suivantes exclues', () => {
  const al = alertesNgap([
    { code: 'D700', label: 'o', lettre_cle: 'D', coefficient: 10, amount: 0, tooth: '16' },
    { code: 'D706', label: 'c', lettre_cle: 'D', coefficient: 25, amount: 0, tooth: '36' },
  ], '2026-11-14')
  const r = al.find((a) => /même séance/.test(a.titre))
  assert.match(r.detail, /D706 D 25, D700 D 10\/2/)
  const ext = alertesNgap([
    { code: 'D713', label: 'e', lettre_cle: 'D', coefficient: 10, amount: 0, tooth: '18' },
    { code: 'D714', label: 'e', lettre_cle: 'D', coefficient: 5, amount: 0, tooth: '28' },
  ], '2026-11-14')
  assert.ok(!ext.some((a) => /même séance/.test(a.titre)))
})

test('NGAP chap. VII : majoration enfant sur dent permanente seulement', () => {
  const ligne = (tooth) => [{ code: 'D706', label: 'c', lettre_cle: 'D', coefficient: 25, amount: 0, tooth }]
  assert.ok(alertesNgap(ligne('36'), '2026-11-14', '2016-03-01').some((a) => /D 37.5/.test(a.detail)))
  assert.ok(!alertesNgap(ligne('75'), '2026-11-14', '2016-03-01').some((a) => /majoration/.test(a.titre)))
  assert.ok(!alertesNgap(ligne('36'), '2026-11-14', '2010-03-01').some((a) => /majoration/.test(a.titre)))
})

test('âge : années révolues', () => {
  assert.equal(ageAu('2013-11-15', '2026-11-14'), 12)
  assert.equal(ageAu('2013-11-14', '2026-11-14'), 13)
  assert.equal(ageAu(null, '2026-11-14'), null)
})

test('canalaire : le groupe de dents fait le code', () => {
  assert.equal(canalairePourDent('11'), 'D704')
  assert.equal(canalairePourDent('43'), 'D704')
  assert.equal(canalairePourDent('24'), 'D705')
  assert.equal(canalairePourDent('36'), 'D706')
  assert.equal(canalairePourDent('84'), 'D706') // molaire de lait
})

// ── Les actes de la séance, lus sur le schéma ───────────────────────────────

test('séance : une carie seulement constatée n\'est pas un acte', () => {
  assert.deepEqual(actesDeLaSeance([ev('36', ['carie'], { carie: 'constate' })], RDV), [])
})

test('séance : une obturation réalisée se cote selon ses faces', () => {
  const a = actesDeLaSeance([
    ev('36', ['obturation'], { obturation: 'realise' }, { faces_after: { obturation: ['O', 'M'] } }),
    ev('46', ['obturation'], { obturation: 'realise' }, { faces_after: { obturation: ['O', 'M', 'D'] } }),
    ev('11', ['carie'], { carie: 'realise' }),
  ], RDV)
  assert.deepEqual(a, [{ tooth: '11', code: 'D700' }, { tooth: '36', code: 'D701' }, { tooth: '46', code: 'D702' }])
})

test('séance : deux extractions — la première D713, la suivante D714', () => {
  const a = actesDeLaSeance([
    ev('18', ['extraite'], { extraite: 'realise' }),
    ev('28', ['extraite'], { extraite: 'realise' }),
    ev('75', ['extraite'], { extraite: 'realise' }),
  ], RDV)
  assert.deepEqual(a, [{ tooth: '18', code: 'D713' }, { tooth: '28', code: 'D714' }, { tooth: '75', code: 'D715' }])
})

test('séance : traitement de racine + couronne sur la même dent', () => {
  const a = actesDeLaSeance([
    ev('36', ['endodontie', 'couronne'], { endodontie: 'realise', couronne: 'realise' }),
  ], RDV)
  assert.deepEqual(a, [{ tooth: '36', code: 'D706' }, { tooth: '36', code: 'D754' }])
})

test('séance : seul le rendez-vous en cours compte, et le dernier état l\'emporte', () => {
  const a = actesDeLaSeance([
    ev('36', ['obturation'], { obturation: 'realise' }, { appointment_id: 'autre' }),
    ev('46', ['obturation'], { obturation: 'realise' }, { created_at: '2026-11-14T10:00:00Z' }),
    // Remis « à faire » plus tard dans la séance : ne part pas sur la feuille.
    ev('46', ['obturation'], { obturation: 'planifie' }, { created_at: '2026-11-14T10:05:00Z' }),
  ], RDV)
  assert.deepEqual(a, [])
  assert.deepEqual(actesDeLaSeance([ev('36', ['obturation'], { obturation: 'realise' })], null), [])
})

// ── La ligne cotée ──────────────────────────────────────────────────────────

test('ligne : cotation officielle, et le dernier tarif du cabinet en montant', () => {
  const l = ligneCotee('d708', { tarifs: { D708: 400 } })
  assert.deepEqual(l, { code: 'D708', label: acteParCode('D708').libelle, lettreCle: 'D', coefficient: '12', valeurCle: '17.5', amount: '400' })
})

test('ligne : sans tarif du cabinet, le tarif de référence', () => {
  assert.equal(ligneCotee('D713').amount, '175')
})

test('ligne : une vieille cotation du cabinet ne passe pas devant le texte', () => {
  const l = ligneCotee('D714', { cotations: { D714: { lettre_cle: 'D', coefficient: 30, valeur_cle: 20 } } })
  assert.equal(l.coefficient, '5')
  assert.equal(l.valeurCle, '17.5')
})

test('ligne : la consultation prend la valeur que le cabinet lui a donnée', () => {
  const l = ligneCotee('C', { cotations: { C: { lettre_cle: 'C', coefficient: 1, valeur_cle: 150 } }, tarifs: { C: 200 } })
  assert.deepEqual([l.lettreCle, l.coefficient, l.valeurCle, l.amount], ['C', '1', '150', '200'])
  // Sans mémoire : C 1, valeur à compléter.
  const vierge = ligneCotee('C')
  assert.deepEqual([vierge.lettreCle, vierge.coefficient, vierge.valeurCle], ['C', '1', ''])
})

test('libellé : retrouvé au catalogue malgré accents et espaces', () => {
  assert.equal(codeDuLibelle('extraction d’une dent permanente', ACTES_DENTAIRES), 'D713')
  assert.equal(codeDuLibelle('Composite', ACTES_DENTAIRES), null)
})
