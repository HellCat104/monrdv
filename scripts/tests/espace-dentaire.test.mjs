// Les tests de l'espace patient du dentiste (lib/espace-dentaire.ts).
//
// Ce module décide de ce que le dentiste voit avant de toucher une dent —
// dernière visite, plan en cours, dernière radio — et de ce que l'historique
// rattache à chaque visite. Une erreur ici ne fait pas planter d'écran : elle
// montre le mauvais diagnostic, ou fait disparaître un acte de l'historique.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  syntheseDentaire, rdvDuJour, contexteDent, regrouperParVisite, visiteVide,
  pointsDeCloture, premiereLigne,
} from './espace-dentaire.js'

const AUJ = '2026-11-14'

function dossier(sur = {}) {
  return { rdvs: [], consultations: [], plans: [], images: [], ...sur }
}

// ── Le rendez-vous du jour (bascule Dossier → Consultation) ────────────────

test('rdvDuJour : le patient en consultation passe avant celui qui attend', () => {
  const r = rdvDuJour([
    { id: 'a', date: AUJ, time: '09:00', queue_status: 'arrive' },
    { id: 'b', date: AUJ, time: '10:00', queue_status: 'en_consultation' },
  ], AUJ)
  assert.equal(r.id, 'b')
})

test('rdvDuJour : un rendez-vous terminé, annulé ou d’un autre jour ne s’ouvre pas', () => {
  assert.equal(rdvDuJour([
    { id: 'a', date: AUJ, time: '09:00', queue_status: 'parti' },
    { id: 'b', date: AUJ, time: '10:00', status: 'cancelled' },
    { id: 'c', date: '2026-11-13', time: '10:00' },
    { id: 'd', date: AUJ, time: '11:00', queue_status: 'hopital' },
  ], AUJ), null)
})

test('rdvDuJour : sans file d’attente, le premier de la journée', () => {
  const r = rdvDuJour([
    { id: 'tard', date: AUJ, time: '16:00' },
    { id: 'tot', date: AUJ, time: '08:30' },
  ], AUJ)
  assert.equal(r.id, 'tot')
})

// ── La synthèse avant consultation ──────────────────────────────────────────

test('synthèse : dossier neuf = vide, rien n’est inventé', () => {
  const s = syntheseDentaire(dossier(), AUJ)
  assert.equal(s.vide, true)
  assert.equal(s.derniereVisite, null)
  assert.equal(s.planActif, null)
  assert.equal(s.derniereRadio, null)
})

test('synthèse : la dernière visite est AVANT aujourd’hui, avec le diagnostic de sa consultation', () => {
  const s = syntheseDentaire(dossier({
    rdvs: [
      { id: 'auj', date: AUJ, time: '10:00', motif: 'Contrôle' },
      { id: 'r1', date: '2026-10-12', time: '09:00', motif: 'Douleur dentaire' },
      { id: 'r0', date: '2026-09-01', time: '09:00', motif: 'Détartrage' },
    ],
    consultations: [
      { id: 'c1', appointment_id: 'r1', created_at: '2026-10-12T09:30:00Z', motif: 'Douleur molaire gauche', diagnostic: 'Principal : Carie 36\nSecondaires : tartre' },
    ],
  }), AUJ)
  assert.equal(s.derniereVisite.date, '2026-10-12')
  assert.equal(s.derniereVisite.motif, 'Douleur molaire gauche')
  assert.equal(s.derniereVisite.diagnostic, 'Principal : Carie 36')
  assert.equal(s.derniereVisite.consultationId, 'c1')
})

test('synthèse : un rendez-vous annulé n’est pas « la dernière visite »', () => {
  const s = syntheseDentaire(dossier({
    rdvs: [
      { id: 'x', date: '2026-11-10', status: 'cancelled', motif: 'Annulé' },
      { id: 'r', date: '2026-10-01', motif: 'Contrôle' },
    ],
  }), AUJ)
  assert.equal(s.derniereVisite.date, '2026-10-01')
})

test('synthèse : le plan actif est le dernier accepté, avec ce qui reste et la prochaine séance', () => {
  const s = syntheseDentaire(dossier({
    plans: [
      { id: 'vieux', label: 'Ancien', status: 'termine', created_at: '2026-01-01', items: [] },
      {
        id: 'p', label: 'Plan 2026', status: 'accepte', created_at: '2026-10-12',
        items: [
          { id: 'i1', tooth: '36', label: 'Pulpectomie', done: true, session_no: 1 },
          { id: 'i2', tooth: '36', label: 'Couronne', done: false, session_no: 3 },
          { id: 'i3', tooth: '36', label: 'Obturation canalaire', done: false, session_no: 2 },
        ],
      },
      { id: 'prop', label: 'Implant', status: 'propose', created_at: '2026-11-01', items: [] },
    ],
  }), AUJ)
  assert.equal(s.planActif.id, 'p')
  assert.equal(s.planActif.restants, 2)
  assert.equal(s.planActif.faits, 1)
  assert.equal(s.planActif.prochain, 'Obturation canalaire (dent 36)')
  assert.equal(s.plansEnAttente, 1)
})

test('synthèse : la dernière radio se choisit par date D’EXAMEN, pas de dépôt', () => {
  const s = syntheseDentaire(dossier({
    images: [
      { id: 'a', file_path: 'a', file_name: 'a', created_at: '2026-11-10T10:00:00Z', type_image: 'retro', dents: ['36'], date_examen: '2026-03-01' },
      { id: 'b', file_path: 'b', file_name: 'b', created_at: '2026-10-01T10:00:00Z', type_image: 'panoramique', dents: [], date_examen: '2026-10-01' },
    ],
  }), AUJ)
  assert.equal(s.derniereRadio.type, 'Panoramique')
  assert.equal(s.derniereRadio.date, '2026-10-01')
  assert.equal(s.derniereRadio.estime, false)
})

test('premiereLigne : saute les lignes de trame restées vides', () => {
  assert.equal(premiereLigne('Principal :\nSecondaires :\nCarie 46'), 'Carie 46')
  assert.equal(premiereLigne('Principal : Carie 36'), 'Principal : Carie 36')
  assert.equal(premiereLigne('Principal :\nSecondaires :'), null)
  assert.equal(premiereLigne(''), null)
})

// ── Ce que le dossier sait d'une dent ───────────────────────────────────────

test('contexteDent : les lignes de la dent, à faire d’abord, hors plans annulés', () => {
  const c = contexteDent('36', [
    { id: 'p1', label: 'Plan', status: 'accepte', created_at: '2026-10-01', items: [
      { id: 'fait', tooth: '36', label: 'Pulpectomie', done: true, done_at: '2026-10-12' },
      { id: 'afaire', tooth: '36', label: 'Couronne', done: false },
      { id: 'autre', tooth: '46', label: 'Composite', done: false },
    ] },
    { id: 'p2', label: 'Annulé', status: 'annule', created_at: '2026-09-01', items: [
      { id: 'x', tooth: '36', label: 'Extraction', done: false },
    ] },
  ], [])
  assert.deepEqual(c.plan.map((l) => l.id), ['afaire', 'fait'])
})

test('contexteDent : une panoramique remonte pour n’importe quelle dent', () => {
  const c = contexteDent('11', [], [
    { id: 'pano', file_path: 'p', file_name: 'p', created_at: '2026-01-01', type_image: 'panoramique', dents: [] },
    { id: 'retro46', file_path: 'r', file_name: 'r', created_at: '2026-01-01', type_image: 'retro', dents: ['46'] },
  ])
  assert.deepEqual(c.images.map((i) => i.id), ['pano'])
})

// ── L'historique par visite ─────────────────────────────────────────────────

test('regrouperParVisite : chaque élément va à SA séance, rien ne fuit vers une autre', () => {
  const v = regrouperParVisite(
    [{ id: 'r1', date: '2026-10-12' }, { id: 'r2', date: '2026-11-02' }],
    {
      consultations: [{ id: 'c1', appointment_id: 'r1', created_at: '2026-10-12', diagnostic: 'Carie 36', dents: ['36'] }],
      plans: [{ id: 'p', label: null, status: 'accepte', created_at: '', items: [
        { id: 'a1', tooth: '36', label: 'Pulpectomie', done: true, appointment_id: 'r1' },
        { id: 'a2', tooth: '36', label: 'Couronne', done: false, appointment_id: 'r2' },
      ] }],
      changements: [{ tooth: '36', appointment_id: 'r1', texte: 'Ajout : Traitement de racine' }],
      images: [{ id: 'i1', file_path: 'x', file_name: 'x', created_at: '2026-11-02', type_image: 'retro', dents: ['36'], appointment_id: 'r2' }],
      ordonnances: [{ appointment_id: 'r1' }, { appointment_id: 'r1' }],
    },
  )
  const [r1, r2] = v
  assert.equal(r1.consultation.id, 'c1')
  assert.deepEqual(r1.actes.map((a) => a.id), ['a1'])
  assert.equal(r1.dents.length, 1)
  assert.equal(r1.ordonnances, 2)
  assert.equal(r1.images.length, 0)
  // Une ligne de plan NON faite n'est pas un acte de la visite, même rattachée.
  assert.equal(r2.actes.length, 0)
  assert.equal(r2.images.length, 1)
  assert.deepEqual(r1.dentsConcernees, ['36'])
})

test('regrouperParVisite : un cliché ancien sans séance va à la visite de sa date d’examen, pas à une date estimée', () => {
  const v = regrouperParVisite([{ id: 'r', date: '2026-10-12' }], {
    consultations: [], plans: [], changements: [], ordonnances: [],
    images: [
      { id: 'exam', file_path: 'a', file_name: 'a', created_at: '2026-10-20T00:00:00Z', type_image: 'retro', dents: ['36'], date_examen: '2026-10-12' },
      { id: 'estime', file_path: 'b', file_name: 'b', created_at: '2026-10-12T00:00:00Z', type_image: 'retro', dents: ['36'] },
    ],
  })
  assert.deepEqual(v[0].images.map((i) => i.id), ['exam'])
})

test('regrouperParVisite : un changement de dent sans séance n’est daté d’aucune visite', () => {
  const v = regrouperParVisite([{ id: 'r', date: '2026-10-12' }], {
    consultations: [], plans: [], images: [], ordonnances: [],
    changements: [{ tooth: '36', appointment_id: null, texte: 'Ajout : Carie' }],
  })
  assert.equal(v[0].dents.length, 0)
  assert.equal(visiteVide(v[0]), true)
})

// ── Avant de terminer ───────────────────────────────────────────────────────

test('clôture : un contrôle sans acte ni diagnostic n’est pas une erreur', () => {
  const p = pointsDeCloture({ consultationEcrite: true, diagnostic: false, actesFaits: 0, dentsModifiees: 0, ordonnances: 0, images: 0, noteLibre: false })
  assert.equal(p.filter((x) => x.niveau === 'attention').length, 0)
})

test('clôture : des actes sans diagnostic sont signalés', () => {
  const p = pointsDeCloture({ consultationEcrite: true, diagnostic: false, actesFaits: 2, dentsModifiees: 1, ordonnances: 0, images: 0, noteLibre: false })
  assert.ok(p.some((x) => x.niveau === 'attention' && /diagnostic/.test(x.texte)))
  assert.ok(p.some((x) => /2 actes/.test(x.texte)))
})

test('clôture : rien d’écrit du tout est signalé', () => {
  const p = pointsDeCloture({ consultationEcrite: false, diagnostic: false, actesFaits: 0, dentsModifiees: 0, ordonnances: 0, images: 0, noteLibre: false })
  assert.ok(p.some((x) => x.niveau === 'attention' && /Ni consultation ni note/.test(x.texte)))
})
