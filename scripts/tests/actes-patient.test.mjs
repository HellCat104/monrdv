// Les tests du registre des actes du dentiste (lib/actes-patient.ts).
//
// Une règle fausse ici ne fait planter aucun écran : elle propose un faux prix,
// crée une obturation pour trois dents au lieu de trois obturations, ou
// dessine une extraction sur une dent qu'on vient seulement de prévoir
// d'extraire.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  trierDents, libelleDents, catalogueDuCabinet, prixPropose, derniersPrix, clePrix,
  filtrerCatalogue, repartirDents, etatsDeLActe, changementsSchema, verifierSaisie,
  acteDepuisLigneDevis, codeDuLibelleDevis, totauxActes, GROUPE_PERSO,
} from './actes-patient.js'

// ── Ordre des dents ─────────────────────────────────────────────────────────

test('les dents se lisent dans l’ordre du schéma, sans doublon', () => {
  assert.deepEqual(trierDents(['21', '11', '18', '11']), ['18', '11', '21'])
  assert.deepEqual(trierDents(['31', '41', '48', '38']), ['48', '41', '31', '38'])
  assert.equal(libelleDents([]), '—')
  assert.equal(libelleDents(['26', '16']), '16, 26')
})

// ── Catalogue et prix ───────────────────────────────────────────────────────

test('le catalogue reprend la NGAP et y applique les réglages du cabinet', () => {
  const cat = catalogueDuCabinet([
    { id: 't1', cle: 'D700', libelle: 'x', prix: 250, actif: true },
    { id: 't2', cle: 'D713', libelle: 'x', prix: null, actif: false },
    { id: 't3', cle: null, libelle: 'Implant titane', prix: 6000, actif: true },
  ])
  const d700 = cat.find((a) => a.cle === 'D700')
  assert.equal(d700.prixCabinet, 250)
  // Le tarif de référence vient de la cotation officielle (D700 = D 10 × 17,50).
  assert.equal(d700.tnr, 175)
  assert.equal(cat.find((a) => a.cle === 'D713').actif, false)
  const perso = cat.find((a) => a.perso)
  assert.equal(perso.libelle, 'Implant titane')
  assert.equal(perso.groupe, GROUPE_PERSO)
  assert.equal(perso.code, null)
  // Les actes masqués ne sont plus proposés…
  assert.ok(!filtrerCatalogue(cat, '').some((a) => a.cle === 'D713'))
  // … mais la recherche ignore les accents et l'ordre des mots.
  assert.ok(filtrerCatalogue(cat, 'canalaire molaire').some((a) => a.code === 'D706'))
  assert.ok(filtrerCatalogue(cat, 'implant').some((a) => a.perso))
})

test('le prix proposé : celui du cabinet, sinon le dernier pratiqué, sinon la référence', () => {
  const acte = { code: 'D701', libelle: 'Obturation — cavité composée, 2 faces', prixCabinet: null, tnr: 175 }
  assert.deepEqual(prixPropose(acte, {}), { prix: 175, source: 'reference' })
  const memo = { [clePrix('D701', 'peu importe')]: 300 }
  assert.deepEqual(prixPropose(acte, memo), { prix: 300, source: 'dernier' })
  assert.deepEqual(prixPropose({ ...acte, prixCabinet: 350 }, memo), { prix: 350, source: 'cabinet' })
  // Un acte libre sans aucun prix connu : rien n'est inventé.
  assert.deepEqual(prixPropose({ code: null, libelle: 'Blanchiment', prixCabinet: null, tnr: null }, {}), { prix: null, source: null })
})

test('la mémoire des prix garde le plus récent et ignore les actes annulés', () => {
  const memo = derniersPrix([
    { code: 'D700', libelle: 'a', prix: 0, statut: 'fini' },
    { code: 'D700', libelle: 'a', prix: 220, statut: 'annule' },
    { code: 'D700', libelle: 'a', prix: 200, statut: 'fini' },
    { code: 'D700', libelle: 'a', prix: 150, statut: 'fini' },
    { code: null, libelle: '  Blanchiment  ', prix: 1500, statut: 'a_faire' },
  ])
  assert.equal(memo[clePrix('D700', '')], 200)
  assert.equal(memo[clePrix(null, 'blanchiment')], 1500)
})

// ── Un acte par dent ────────────────────────────────────────────────────────

test('un acte « par dent » se répartit, un acte de bloc reste entier', () => {
  // Quadrant 1 lu de l'extérieur vers le milieu : 16 avant 14, puis 26.
  assert.deepEqual(repartirDents('une', ['26', '14', '16']), [['16'], ['14'], ['26']])
  assert.deepEqual(repartirDents('bloc', ['31', '41']), [['41', '31']])
  assert.deepEqual(repartirDents(null, []), [[]])
  assert.deepEqual(repartirDents('une', ['46']), [['46']])
})

// ── Le schéma ───────────────────────────────────────────────────────────────

test('l’état posé sur le schéma dépend de l’acte', () => {
  assert.deepEqual(etatsDeLActe('D701', ''), { fini: 'obturation', prevu: 'obturation' })
  assert.deepEqual(etatsDeLActe('D706', ''), { fini: 'endodontie', prevu: 'endodontie' })
  // Une extraction PRÉVUE n'est pas une dent absente.
  assert.deepEqual(etatsDeLActe('D713', ''), { fini: 'extraite', prevu: 'a_extraire' })
  assert.deepEqual(etatsDeLActe('D754', ''), { fini: 'couronne', prevu: 'couronne' })
  // Le détartrage, la consultation, l'ODF : rien à dessiner sur une dent.
  assert.equal(etatsDeLActe('D708', 'Détartrage'), null)
  assert.equal(etatsDeLActe('C', 'Consultation'), null)
  // Hors nomenclature, le libellé décide — l'implant avant la couronne.
  assert.equal(etatsDeLActe(null, 'Couronne sur implant').fini, 'implant')
  assert.equal(etatsDeLActe(null, 'Facette céramique').fini, 'facette')
  assert.equal(etatsDeLActe(null, 'Blanchiment'), null)
  // Un acte ASSIMILÉ n'hérite pas du dessin de son code d'emprunt.
  assert.equal(etatsDeLActe('D710', 'Réimplantation et contention (acte assimilé)'), null)
})

test('fini → réalisé, à faire → planifié, annulé → rien', () => {
  const base = { code: 'D701', libelle: 'Obturation', dents: ['26', '16'], faces: ['M', 'O', 'X'] }
  const fini = changementsSchema({ ...base, statut: 'fini' })
  assert.deepEqual(fini.map((c) => c.dent), ['16', '26'])
  assert.ok(fini.every((c) => c.etat === 'obturation' && c.nature === 'realise'))
  assert.deepEqual(fini[0].faces, ['M', 'O'])
  const prevu = changementsSchema({ ...base, statut: 'a_faire' })
  assert.ok(prevu.every((c) => c.nature === 'planifie'))
  assert.deepEqual(changementsSchema({ ...base, statut: 'annule' }), [])
  assert.deepEqual(changementsSchema({ ...base, statut: 'fini', dents: [] }), [])
  // Les faces ne s'écrivent pas sur une couronne.
  assert.deepEqual(changementsSchema({ code: 'D754', libelle: '', statut: 'fini', dents: ['36'], faces: ['O'] })[0].faces, [])
})

// ── La saisie ───────────────────────────────────────────────────────────────

test('la saisie est vérifiée, avec un message lisible', () => {
  const ok = verifierSaisie({ libelle: '  Obturation  ', code: 'd 700', date_acte: '2026-11-17', dents: ['16', '16'], prix: '250,5', statut: 'fini', faces: ['o'] })
  assert.equal(ok.ok, true)
  assert.equal(ok.valeur.libelle, 'Obturation')
  assert.equal(ok.valeur.code, 'D700')
  assert.equal(ok.valeur.prix, 250.5)
  assert.deepEqual(ok.valeur.dents, ['16'])
  assert.deepEqual(ok.valeur.faces, ['O'])
  assert.equal(verifierSaisie({ libelle: '', date_acte: '2026-11-17', dents: [], prix: 1, statut: 'fini' }).ok, false)
  assert.match(verifierSaisie({ libelle: 'x', date_acte: '2026-11-17', dents: ['19'], prix: 1, statut: 'fini' }).erreur, /19/)
  assert.equal(verifierSaisie({ libelle: 'x', date_acte: '17/11/2026', dents: [], prix: 1, statut: 'fini' }).ok, false)
  assert.equal(verifierSaisie({ libelle: 'x', date_acte: '2026-11-17', dents: [], prix: -1, statut: 'fini' }).ok, false)
  assert.equal(verifierSaisie({ libelle: 'x', date_acte: '2026-11-17', dents: [], prix: 1, statut: 'termine' }).ok, false)
  // En modification, seuls les champs envoyés sont vérifiés.
  const partiel = verifierSaisie({ statut: 'en_cours' }, true)
  assert.deepEqual(partiel, { ok: true, valeur: { statut: 'en_cours' } })
})

// ── Le plan de traitement ───────────────────────────────────────────────────

test('une ligne de devis accepté devient un acte à faire, ou fini si cochée', () => {
  const devis = { accepted_at: '2026-10-01T09:00:00Z', created_at: '2026-09-28T09:00:00Z' }
  const ligne = { id: 'qi1', tooth: '36', label: 'Couronne céramo-métal', unit_price: 1500, quantity: 2, done: false, done_at: null, appointment_id: 'rdv' }
  const a = acteDepuisLigneDevis(ligne, devis)
  assert.equal(a.statut, 'a_faire')
  assert.equal(a.date_acte, '2026-10-01')
  assert.equal(a.prix, 3000)
  assert.deepEqual(a.dents, ['36'])
  assert.equal(a.code, 'D754')
  assert.equal(a.appointment_id, null)
  const f = acteDepuisLigneDevis({ ...ligne, done: true, done_at: '2026-11-05T10:00:00Z' }, devis)
  assert.equal(f.statut, 'fini')
  assert.equal(f.date_acte, '2026-11-05')
  assert.equal(f.appointment_id, 'rdv')
  // Un libellé libre n'invente pas de code ; une dent invalide est ignorée.
  assert.equal(codeDuLibelleDevis('Composite antérieur'), null)
  assert.deepEqual(acteDepuisLigneDevis({ ...ligne, tooth: '99' }, devis).dents, [])
})

test('les totaux par statut', () => {
  const t = totauxActes([
    { prix: 100, statut: 'fini' }, { prix: 50.5, statut: 'fini' }, { prix: 300, statut: 'a_faire' },
  ])
  assert.deepEqual(t.fini, { n: 2, montant: 150.5 })
  assert.deepEqual(t.a_faire, { n: 1, montant: 300 })
  assert.deepEqual(t.annule, { n: 0, montant: 0 })
})
