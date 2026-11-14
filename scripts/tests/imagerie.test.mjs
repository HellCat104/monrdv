// Les tests de l'imagerie dentaire (lib/imagerie.ts).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  imagesDeLaDent, dentsAvecImage, comparableSurLaDent, jourImage, formatCliche, libelleType, typeImage,
} from './imagerie.js'

const img = (sur) => ({ id: 'x', file_path: 'p', file_name: 'n.jpg', created_at: '2026-11-14T10:00:00Z', ...sur })

test('jourImage : la date d’examen fait foi ; sans elle, la date de dépôt, annoncée comme estimée', () => {
  assert.deepEqual(jourImage(img({ date_examen: '2026-03-01' })), { jour: '2026-03-01', estime: false })
  assert.deepEqual(jourImage(img({})), { jour: '2026-11-14', estime: true })
})

test('imagesDeLaDent : du plus récent au plus ancien, panoramiques comprises', () => {
  const l = imagesDeLaDent([
    img({ id: 'ancien', type_image: 'retro', dents: ['36'], date_examen: '2026-01-01' }),
    img({ id: 'pano', type_image: 'panoramique', dents: [], date_examen: '2026-06-01' }),
    img({ id: 'recent', type_image: 'retro', dents: ['36'], date_examen: '2026-10-01' }),
    img({ id: 'autre', type_image: 'retro', dents: ['46'], date_examen: '2026-10-01' }),
    img({ id: 'papier', type_image: null, dents: ['36'] }),
  ], '36')
  assert.deepEqual(l.map((i) => i.id), ['recent', 'pano', 'ancien'])
})

test('dentsAvecImage : une panoramique n’allume pas les trente-deux dents', () => {
  const d = dentsAvecImage([
    img({ type_image: 'panoramique', dents: ['11', '21'] }),
    img({ type_image: 'retro', dents: ['36'] }),
  ])
  assert.deepEqual([...d], ['36'])
})

test('comparableSurLaDent : il faut deux DATES différentes', () => {
  const memeJour = [
    img({ id: 'a', type_image: 'retro', dents: ['36'], date_examen: '2026-10-01' }),
    img({ id: 'b', type_image: 'retro', dents: ['36'], date_examen: '2026-10-01' }),
  ]
  assert.equal(comparableSurLaDent(memeJour, '36'), false)
  assert.equal(comparableSurLaDent([...memeJour, img({ id: 'c', type_image: 'retro', dents: ['36'], date_examen: '2026-03-01' })], '36'), true)
})

test('formatCliche : un PDF n’est pas affiché comme une image', () => {
  assert.equal(formatCliche({ file_type: 'application/pdf', file_name: 'cr.pdf' }), 'pdf')
  assert.equal(formatCliche({ file_type: null, file_name: 'COMPTE-RENDU.PDF' }), 'pdf')
  assert.equal(formatCliche({ file_type: 'image/jpeg', file_name: 'retro.jpg' }), 'image')
})

test('types : CBCT et céphalométrie existent, l’ancienne clé `teleradio` reste lisible', () => {
  assert.equal(libelleType('cbct'), 'CBCT (cone beam)')
  assert.equal(libelleType('teleradio'), 'Céphalométrie')
  assert.equal(typeImage('teleradio').cible, false)
})
