// Le motif `config.matcher` de middleware.ts couvre-t-il TOUTES les routes
// que le middleware protège ?
//
// POURQUOI CE TEST : depuis le 16-11-2026, le middleware ne s'exécute plus que
// sur les préfixes qu'il traite (il tournait sur chaque page publique pour n'y
// rien faire, et son démarrage à froid ralentissait la première ouverture).
// Next exige un motif écrit en dur : il ne peut pas être déduit des tableaux
// `sensitiveRoutes`, `protectedRoutes` et `adminRoutes`. Le jour où l'on
// ajoute une route à un tableau sans l'ajouter au motif, le middleware ne la
// verrait jamais — plus de quota, plus de redirection vers /login — sans
// aucune erreur visible. Ce test rend cet oubli bruyant.
//
// Le fichier est lu comme du TEXTE : il importe `next/server`, que Node seul
// ne sait pas charger. (Ce test est copié dans .tests-tmp/lib/ par
// scripts/tester.mjs : la racine du dépôt est deux dossiers au-dessus.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = readFileSync(join(racine, 'middleware.ts'), 'utf8')

/** Les chaînes d'un tableau `const nom = [ ... ]` du middleware. */
function tableau(nom) {
  const m = source.match(new RegExp(`const ${nom} = \\[([\\s\\S]*?)\\]`))
  assert.ok(m, `tableau ${nom} introuvable dans middleware.ts`)
  // Commentaires retirés d'abord : « liste d'attente » contient une apostrophe.
  const sansCommentaires = m[1].replace(/\/\/.*$/gm, '')
  return [...sansCommentaires.matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/** Les motifs de `config.matcher`, transformés en expressions régulières
 *  comme le fait Next (motif complet, ancré au début et à la fin). */
function motifs() {
  const bloc = source.match(/matcher:\s*\[([\s\S]*?)\]\s*,?\s*\}/)
  assert.ok(bloc, 'config.matcher introuvable dans middleware.ts')
  return [...bloc[1].matchAll(/'([^']+)'/g)].map((x) => new RegExp('^' + x[1].replace(/\\\\/g, '\\') + '$'))
}

const routes = [
  ...tableau('sensitiveRoutes'),
  ...tableau('protectedRoutes'),
  ...tableau('adminRoutes'),
]
const regles = motifs()
const couvert = (chemin) => regles.some((r) => r.test(chemin))

test('les tableaux du middleware sont bien lus', () => {
  assert.ok(routes.length >= 15, `seulement ${routes.length} routes lues`)
  assert.ok(routes.includes('/dashboard'))
  assert.ok(routes.includes('/api/appointments'))
  assert.ok(routes.includes('/admin'))
})

test('chaque route protégée ou limitée passe par le middleware, sous-chemins compris', () => {
  for (const r of routes) {
    assert.ok(couvert(r), `${r} n'est pas couverte par config.matcher`)
    assert.ok(couvert(r + '/x/y'), `${r}/x/y n'est pas couverte par config.matcher`)
  }
})

test('les pages publiques ne réveillent plus le middleware', () => {
  for (const p of ['/', '/dr-mohammed-ben-ali', '/medecin/dentiste/casablanca', '/recherche',
    '/login', '/inscription', '/cgu', '/patient/dashboard', '/_next/static/chunks/a.js']) {
    assert.ok(!couvert(p), `${p} déclenche encore le middleware`)
  }
})
