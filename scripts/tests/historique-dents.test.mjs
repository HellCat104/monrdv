// Les tests du journal des dents (lib/dental-history.ts).
//
// Ce journal est la pièce que le dentiste opposera à un patient qui affirme
// « cette dent était saine ». Deux défauts réels y ont été trouvés à l'audit
// de novembre 2026 : un changement de FACE seul ne laissait pas de ligne
// lisible, et le passage « à faire → réalisé » n'en laissait aucune.
import test from 'node:test'
import assert from 'node:assert/strict'
import { diffTeeth, describeToothChange, parseToothEvent } from './dental-history.js'

test('diffTeeth : une dent qui ne change pas ne produit rien', () => {
  const t = { 36: { s: ['carie'], f: { carie: ['O'] }, p: { carie: 'planifie' } } }
  assert.equal(diffTeeth(t, t).length, 0)
})

test('diffTeeth : un changement de FACE seul est un changement', () => {
  const c = diffTeeth(
    { 36: { s: ['carie'], f: { carie: ['O'] } } },
    { 36: { s: ['carie'], f: { carie: ['O', 'M'] } } },
  )
  assert.equal(c.length, 1)
  const d = describeToothChange(c[0].before, c[0].after, c[0].facesBefore, c[0].facesAfter, c[0].naturesBefore, c[0].naturesAfter)
  assert.equal(d.kind, 'faces')
})

test('diffTeeth : « à faire » → « réalisé » laisse une ligne, et elle le dit', () => {
  const c = diffTeeth(
    { 36: { s: ['obturation'], p: { obturation: 'planifie' } } },
    { 36: { s: ['obturation'], p: { obturation: 'realise' } } },
  )
  assert.equal(c.length, 1)
  assert.equal(c[0].naturesBefore.obturation, 'planifie')
  assert.equal(c[0].naturesAfter.obturation, 'realise')
  const d = describeToothChange(c[0].before, c[0].after, c[0].facesBefore, c[0].facesAfter, c[0].naturesBefore, c[0].naturesAfter)
  assert.equal(d.kind, 'nature')
  assert.match(d.texte, /À faire → Réalisé/)
})

test('diffTeeth : une nature absente vaut « constaté » des deux côtés — pas de faux changement', () => {
  assert.equal(diffTeeth(
    { 36: { s: ['carie'] } },
    { 36: { s: ['carie'], p: { carie: 'constate' } } },
  ).length, 0)
})

test('diffTeeth : un ajout d’état reste un ajout, même si la nature est posée en même temps', () => {
  const c = diffTeeth(
    { 36: { s: ['carie'] } },
    { 36: { s: ['carie', 'obturation'], p: { obturation: 'planifie' } } },
  )
  const d = describeToothChange(c[0].before, c[0].after, c[0].facesBefore, c[0].facesAfter, c[0].naturesBefore, c[0].naturesAfter)
  assert.equal(d.kind, 'ajout')
})

test('diffTeeth : l’ancien format chaîne est lu comme un état, pas comme une dent vierge', () => {
  const c = diffTeeth({ 16: { s: 'carie' } }, { 16: { s: ['carie', 'couronne'] } })
  const d = describeToothChange(c[0].before, c[0].after)
  assert.equal(d.kind, 'ajout')
})

test('parseToothEvent : relit faces, natures et séance (v100)', () => {
  const e = parseToothEvent({
    id: 'x', tooth: '36', states_before: ['obturation'], states_after: ['obturation'],
    faces_before: {}, faces_after: {},
    natures_before: { obturation: 'planifie' }, natures_after: { obturation: 'realise' },
    appointment_id: 'rdv-1', note: null, actor_role: 'medecin', actor_email: null, created_at: '2026-11-14T10:00:00Z',
  })
  assert.equal(e.appointment_id, 'rdv-1')
  assert.equal(e.natures_after.obturation, 'realise')
})

test('parseToothEvent : une ligne antérieure à la v100 n’a pas de natures inventées', () => {
  const e = parseToothEvent({
    id: 'x', tooth: '36', states_before: [], states_after: ['carie'],
    note: null, actor_role: 'medecin', actor_email: null, created_at: '2026-01-01T10:00:00Z',
  })
  assert.equal(e.natures_before, undefined)
  assert.equal(e.appointment_id, null)
})
