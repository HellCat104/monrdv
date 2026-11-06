// Les tests du moteur de préparation.
//
// ── POURQUOI CE MODULE-LÀ ET PAS UN AUTRE ───────────────────────────────────
//
// `lib/preparation.ts` est le seul endroit de la branche généraliste qui
// DÉCIDE quelque chose : si la tension est signalée, si le bilan est jugé
// vieux, si un rappel est échu. Tout le reste affiche. Une erreur ici ne fait
// pas planter un écran — elle fait taire une alerte, ou en invente une, et
// personne ne s'en aperçoit.
//
// Le module ne dépend de rien et ne lit aucune date « maintenant » : le jour
// de référence est passé en paramètre. C'est ce qui rend ces tests possibles
// sans base, sans Next et sans horloge.
//
// Lancement : node scripts/tester-preparation.mjs (il compile puis exécute).
import test from 'node:test'
import assert from 'node:assert/strict'
import { preparer, moisEntre, calculerIMC, frJour } from './preparation.js'

const AUJ = '2026-11-06'

/** Un dossier vide, à compléter champ par champ dans chaque test. */
function dossier(sur = {}) {
  return {
    patient: {},
    constantes: [],
    consultations: [],
    ordonnances: [],
    documents: [],
    rappels: [],
    aujourdhui: AUJ,
    ...sur,
  }
}

const titres = (p) => p.points.map((x) => x.titre)
const aPoint = (p, debut) => p.points.some((x) => x.titre.startsWith(debut))

// ════════════════════════════════════════════════════════════════════════════
// Les utilitaires de date — le Maroc est à UTC+0 et toISOString décale
// ════════════════════════════════════════════════════════════════════════════

test('moisEntre compte les mois pleins', () => {
  assert.equal(moisEntre('2026-11-06', '2026-11-06'), 0)
  assert.equal(moisEntre('2026-10-06', '2026-11-06'), 1)
  assert.equal(moisEntre('2026-10-07', '2026-11-06'), 0, 'un jour de moins = pas un mois plein')
  assert.equal(moisEntre('2025-11-06', '2026-11-06'), 12)
  assert.equal(moisEntre('2025-05-06', '2026-11-06'), 18)
})

test('moisEntre ne casse pas sur une date illisible', () => {
  assert.equal(moisEntre('', AUJ), 0)
  assert.equal(moisEntre('hier', AUJ), 0)
  assert.equal(moisEntre(undefined, AUJ), 0)
})

test('moisEntre accepte un horodatage complet', () => {
  assert.equal(moisEntre('2025-11-06T14:32:00.000Z', AUJ), 12)
})

test('frJour rend du JJ/MM/AAAA, et rien sur une entrée illisible', () => {
  assert.equal(frJour('2026-11-06'), '06/11/2026')
  assert.equal(frJour('2026-01-31T23:50:00Z'), '31/01/2026')
  assert.equal(frJour('n’importe quoi'), '')
})

test('calculerIMC exige poids ET taille', () => {
  assert.equal(calculerIMC({ weight: 78, height: 165 }).toFixed(1), '28.7')
  assert.equal(calculerIMC({ weight: 78 }), null)
  assert.equal(calculerIMC({ height: 165 }), null)
  // Une taille en mètres (1,65) est une saisie, pas une taille : on se tait
  // plutôt que d'annoncer un IMC de 28 000.
  assert.equal(calculerIMC({ weight: 78, height: 1.65 }), null)
})

// ════════════════════════════════════════════════════════════════════════════
// L'allergie
// ════════════════════════════════════════════════════════════════════════════

test('une allergie remonte en urgent et en premier', () => {
  const p = preparer(dossier({
    patient: { allergies: 'Pénicilline', current_treatments: 'Metformine 850' },
    ordonnances: [{ created_at: '2025-01-01' }],   // vieille : fera un point aussi
  }))
  assert.equal(p.points[0].niveau, 'urgent')
  assert.equal(p.points[0].titre, 'Allergie')
  assert.equal(p.allergies, 'Pénicilline')
})

test('pas d’allergie renseignée : aucun point d’allergie', () => {
  const p = preparer(dossier({ patient: { allergies: '   ' } }))
  assert.equal(p.allergies, null)
  assert.ok(!aPoint(p, 'Allergie'))
})

// ════════════════════════════════════════════════════════════════════════════
// La tension — deux mesures hautes font une tendance, une seule non
// ════════════════════════════════════════════════════════════════════════════

test('deux tensions hautes de suite : attention', () => {
  const p = preparer(dossier({
    constantes: [
      { measured_at: '2026-10-02', values: { systolic: 152, diastolic: 94 } },
      { measured_at: '2026-07-11', values: { systolic: 148, diastolic: 92 } },
    ],
  }))
  const pt = p.points.find((x) => x.titre.startsWith('Tension élevée aux deux'))
  assert.ok(pt, 'le point attendu est absent')
  assert.equal(pt.niveau, 'attention')
  // Le constat doit citer les deux mesures ET leurs dates : une alerte qu'on
  // ne peut pas vérifier est une alerte qu'on finit par ignorer.
  assert.match(pt.detail, /152\/94 le 02\/10\/2026/)
  assert.match(pt.detail, /148\/92 le 11\/07\/2026/)
})

test('une seule tension haute : info, et le texte le dit', () => {
  const p = preparer(dossier({
    constantes: [
      { measured_at: '2026-10-02', values: { systolic: 152, diastolic: 94 } },
      { measured_at: '2026-07-11', values: { systolic: 124, diastolic: 78 } },
    ],
  }))
  const pt = p.points.find((x) => x.titre.startsWith('Tension élevée à la dernière'))
  assert.ok(pt)
  assert.equal(pt.niveau, 'info')
  assert.match(pt.detail, /une seule mesure ne fait pas une tendance/i)
})

test('la diastolique seule suffit à qualifier une tension de haute', () => {
  const p = preparer(dossier({
    constantes: [
      { measured_at: '2026-10-02', values: { systolic: 132, diastolic: 96 } },
      { measured_at: '2026-07-11', values: { systolic: 128, diastolic: 92 } },
    ],
  }))
  assert.ok(aPoint(p, 'Tension élevée aux deux'))
})

test('139/89 n’est pas signalé — le seuil est 140/90', () => {
  const p = preparer(dossier({
    constantes: [
      { measured_at: '2026-10-02', values: { systolic: 139, diastolic: 89 } },
      { measured_at: '2026-07-11', values: { systolic: 138, diastolic: 88 } },
    ],
  }))
  assert.ok(!aPoint(p, 'Tension élevée'))
})

test('une seule prise au dossier : pas de tendance inventée', () => {
  const p = preparer(dossier({
    constantes: [{ measured_at: '2026-10-02', values: { systolic: 152, diastolic: 94 } }],
  }))
  assert.ok(aPoint(p, 'Tension élevée à la dernière'))
  assert.ok(!aPoint(p, 'Tension élevée aux deux'))
})

// ════════════════════════════════════════════════════════════════════════════
// Le poids
// ════════════════════════════════════════════════════════════════════════════

test('une perte de 5 % ou plus est signalée, avec les deux chiffres', () => {
  const p = preparer(dossier({
    constantes: [
      { measured_at: '2026-10-02', values: { weight: 66 } },
      { measured_at: '2026-04-02', values: { weight: 72 } },
    ],
  }))
  const pt = p.points.find((x) => x.titre === 'Perte de poids')
  assert.ok(pt)
  assert.match(pt.detail, /72 kg le 02\/04\/2026/)
  assert.match(pt.detail, /66 kg le 02\/10\/2026/)
  assert.match(pt.detail, /-6 kg/)
})

test('une prise de poids est signalée comme telle, pas comme une perte', () => {
  const p = preparer(dossier({
    constantes: [
      { measured_at: '2026-10-02', values: { weight: 80 } },
      { measured_at: '2026-04-02', values: { weight: 72 } },
    ],
  }))
  const pt = p.points.find((x) => x.titre === 'Prise de poids')
  assert.ok(pt)
  assert.match(pt.detail, /\+8 kg/)
})

test('une variation sous 5 % reste du bruit', () => {
  const p = preparer(dossier({
    constantes: [
      { measured_at: '2026-10-02', values: { weight: 70 } },
      { measured_at: '2026-04-02', values: { weight: 72 } },
    ],
  }))
  assert.ok(!aPoint(p, 'Perte de poids'))
  assert.ok(!aPoint(p, 'Prise de poids'))
})

// ════════════════════════════════════════════════════════════════════════════
// Le bilan — seulement pour qui a un suivi au long cours
// ════════════════════════════════════════════════════════════════════════════

test('bilan de plus de 12 mois chez un chronique : attention, avec le nom du fichier', () => {
  const p = preparer(dossier({
    patient: { chronic_conditions: 'Diabète de type 2' },
    documents: [{ created_at: '2025-05-06', file_name: 'Bilan sanguin mai 2025.pdf' }],
  }))
  const pt = p.points.find((x) => x.titre.startsWith('Dernier bilan il y a'))
  assert.ok(pt)
  assert.equal(pt.titre, 'Dernier bilan il y a 18 mois')
  assert.match(pt.detail, /Bilan sanguin mai 2025\.pdf/)
})

test('un bilan récent ne dit rien', () => {
  const p = preparer(dossier({
    patient: { chronic_conditions: 'Diabète de type 2' },
    documents: [{ created_at: '2026-09-01', file_name: 'HbA1c.pdf' }],
  }))
  assert.ok(!aPoint(p, 'Dernier bilan'))
})

test('un chronique sans aucun bilan au dossier : signalé en info', () => {
  const p = preparer(dossier({ patient: { chronic_conditions: 'Hypertension artérielle' } }))
  const pt = p.points.find((x) => x.titre === 'Aucun bilan au dossier')
  assert.ok(pt)
  assert.equal(pt.niveau, 'info')
})

test('un patient SANS suivi au long cours n’est pas sommé d’avoir un bilan', () => {
  const p = preparer(dossier({ documents: [] }))
  assert.ok(!aPoint(p, 'Aucun bilan'))
  assert.ok(!aPoint(p, 'Dernier bilan'))
})

test('une ordonnance rangée dans les documents n’est pas prise pour un bilan', () => {
  const p = preparer(dossier({
    patient: { chronic_conditions: 'Diabète' },
    documents: [{ created_at: '2026-10-01', file_name: 'Ordonnance octobre.pdf' }],
  }))
  assert.ok(aPoint(p, 'Aucun bilan au dossier'), 'une ordonnance a été comptée comme un bilan')
})

// ════════════════════════════════════════════════════════════════════════════
// L'ordonnance de fond
// ════════════════════════════════════════════════════════════════════════════

test('traitement de fond et ordonnance de plus de 3 mois : attention', () => {
  const p = preparer(dossier({
    patient: { current_treatments: 'Amlodipine 5 mg' },
    ordonnances: [{ created_at: '2026-06-01' }],
  }))
  const pt = p.points.find((x) => x.titre.startsWith('Dernière ordonnance il y a'))
  assert.ok(pt)
  assert.equal(pt.titre, 'Dernière ordonnance il y a 5 mois')
  assert.match(pt.detail, /Amlodipine 5 mg/)
})

test('traitement de fond sans aucune ordonnance au dossier : info', () => {
  const p = preparer(dossier({ patient: { current_treatments: 'Levothyrox 75' } }))
  const pt = p.points.find((x) => x.titre.startsWith('Traitement de fond sans'))
  assert.ok(pt)
  assert.equal(pt.niveau, 'info')
})

test('sans traitement de fond, l’ancienneté de l’ordonnance ne regarde personne', () => {
  const p = preparer(dossier({ ordonnances: [{ created_at: '2020-01-01' }] }))
  assert.ok(!aPoint(p, 'Dernière ordonnance'))
})

// ════════════════════════════════════════════════════════════════════════════
// Les rappels
// ════════════════════════════════════════════════════════════════════════════

test('un rappel échu ou dû aujourd’hui est signalé', () => {
  const p = preparer(dossier({
    rappels: [
      { due_date: '2026-09-15', reason: 'Contrôle tensionnel' },
      { due_date: AUJ, reason: 'Vaccin grippe' },
    ],
  }))
  const echus = p.points.filter((x) => x.titre === 'Rappel de suivi arrivé à échéance')
  assert.equal(echus.length, 2, 'un rappel dû le jour même doit compter')
  assert.match(echus[0].detail, /Contrôle tensionnel/)
})

test('un rappel à venir ne dit rien', () => {
  const p = preparer(dossier({ rappels: [{ due_date: '2027-03-01', reason: 'Contrôle' }] }))
  assert.ok(!aPoint(p, 'Rappel de suivi'))
})

test('un rappel sans motif est quand même signalé, sans tiret orphelin', () => {
  const p = preparer(dossier({ rappels: [{ due_date: '2026-01-01', reason: null }] }))
  const pt = p.points.find((x) => x.titre === 'Rappel de suivi arrivé à échéance')
  assert.ok(pt)
  assert.equal(pt.detail, 'prévu le 01/01/2026.')
})

// ════════════════════════════════════════════════════════════════════════════
// Le dossier muet, et le questionnaire qui a vieilli
// ════════════════════════════════════════════════════════════════════════════

test('un dossier sans rien le dit, et ne se tait pas', () => {
  const p = preparer(dossier())
  assert.ok(aPoint(p, 'Aucun antécédent renseigné'))
})

test('un seul antécédent suffit à faire taire ce point', () => {
  const p = preparer(dossier({ patient: { conditions: ['Asthme'] } }))
  assert.ok(!aPoint(p, 'Aucun antécédent'))
  assert.deepEqual(p.antecedents, ['Asthme'])
})

test('un questionnaire de plus de 12 mois est signalé avec sa date', () => {
  const p = preparer(dossier({ patient: { anamnese_maj: '2025-02-10' } }))
  const pt = p.points.find((x) => x.titre.startsWith('Questionnaire médical vieux de'))
  assert.ok(pt)
  assert.equal(pt.titre, 'Questionnaire médical vieux de 20 mois')
  assert.match(pt.detail, /10\/02\/2025/)
})

test('un questionnaire récent ne dit rien', () => {
  const p = preparer(dossier({ patient: { anamnese_maj: '2026-06-10' } }))
  assert.ok(!aPoint(p, 'Questionnaire médical'))
})

// ════════════════════════════════════════════════════════════════════════════
// La lecture du dossier : antécédents, traitements, constantes en mots
// ════════════════════════════════════════════════════════════════════════════

test('les antécédents viennent des étiquettes, du texte libre et des chirurgies', () => {
  const p = preparer(dossier({
    patient: {
      conditions: ['Diabète type 2'],
      chronic_conditions: 'Hypertension artérielle\nDyslipidémie',
      surgeries: 'Césarienne 1994',
    },
  }))
  assert.deepEqual(p.antecedents, [
    'Diabète type 2',
    'Hypertension artérielle',
    'Dyslipidémie',
    'Chirurgie : Césarienne 1994',
  ])
})

test('le point-virgule sépare aussi bien que le retour à la ligne', () => {
  const p = preparer(dossier({ patient: { current_treatments: 'Metformine 850 ; Ramipril 5' } }))
  assert.deepEqual(p.traitements, ['Metformine 850', 'Ramipril 5'])
})

test('les lignes vides et les espaces ne font pas d’antécédent fantôme', () => {
  const p = preparer(dossier({ patient: { chronic_conditions: '\n\n  \nAsthme\n\n' } }))
  assert.deepEqual(p.antecedents, ['Asthme'])
})

test('les constantes sont mises en mots, avec l’IMC quand il est calculable', () => {
  const p = preparer(dossier({
    constantes: [{
      measured_at: '2026-10-02T09:14:00Z',
      values: { systolic: 148, diastolic: 92, heart_rate: 76, weight: 78, height: 165 },
    }],
  }))
  assert.equal(p.dernieresConstantes, 'TA 148/92 · FC 76 · 78 kg · IMC 28,7')
  assert.equal(p.constantesLe, '2026-10-02')
})

test('une prise de constantes vide ne produit pas une phrase vide', () => {
  const p = preparer(dossier({ constantes: [{ measured_at: '2026-10-02', values: {} }] }))
  assert.equal(p.dernieresConstantes, null)
})

test('au plus trois dernières consultations, dans l’ordre reçu', () => {
  const p = preparer(dossier({
    consultations: [
      { date: '2026-10-02', titre: 'Suivi HTA' },
      { date: '2026-07-11', titre: 'Angine' },
      { date: '2026-03-04', titre: 'Certificat' },
      { date: '2025-12-01', titre: 'Lombalgie' },
    ],
  }))
  assert.equal(p.dernieresConsultations.length, 3)
  assert.equal(p.dernieresConsultations[0].titre, 'Suivi HTA')
})

// ════════════════════════════════════════════════════════════════════════════
// L'ordre des points — l'urgent d'abord, sinon l'écran ne sert à rien
// ════════════════════════════════════════════════════════════════════════════

test('urgent, puis attention, puis info', () => {
  const p = preparer(dossier({
    patient: {
      allergies: 'Sulfamides',
      chronic_conditions: 'Diabète',
      anamnese_maj: '2024-01-01',
    },
    constantes: [
      { measured_at: '2026-10-02', values: { systolic: 160, diastolic: 98 } },
      { measured_at: '2026-07-11', values: { systolic: 155, diastolic: 95 } },
    ],
  }))
  const niveaux = p.points.map((x) => x.niveau)
  const rang = { urgent: 0, attention: 1, info: 2 }
  for (let i = 1; i < niveaux.length; i++) {
    assert.ok(rang[niveaux[i - 1]] <= rang[niveaux[i]], `ordre cassé : ${niveaux.join(' > ')}`)
  }
  assert.equal(niveaux[0], 'urgent')
})

test('chaque point porte un titre et un détail non vides', () => {
  const p = preparer(dossier({
    patient: { allergies: 'Aspirine', current_treatments: 'Furosémide', chronic_conditions: 'Insuffisance cardiaque' },
    constantes: [
      { measured_at: '2026-10-02', values: { systolic: 150, diastolic: 95, weight: 60 } },
      { measured_at: '2026-04-02', values: { systolic: 150, diastolic: 95, weight: 70 } },
    ],
    rappels: [{ due_date: '2026-10-01', reason: 'Contrôle' }],
  }))
  assert.ok(p.points.length >= 4, `attendu au moins 4 points, reçu ${p.points.length} : ${titres(p)}`)
  for (const pt of p.points) {
    assert.ok(pt.titre.trim().length > 0)
    assert.ok(pt.detail.trim().length > 0, `détail vide pour « ${pt.titre} »`)
  }
})

test('rien ne plante sur un dossier aux champs null ou absents', () => {
  const p = preparer({
    patient: {
      birth_date: null, age: null, allergies: null, chronic_conditions: null,
      conditions: null, surgeries: null, current_treatments: null, anamnese_maj: null,
    },
    constantes: [], consultations: [], ordonnances: [], documents: [], rappels: [],
    aujourdhui: AUJ,
  })
  assert.equal(p.allergies, null)
  assert.deepEqual(p.antecedents, [])
  assert.equal(p.dernieresConstantes, null)
})
