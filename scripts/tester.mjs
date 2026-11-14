#!/usr/bin/env node
// Lance TOUS les tests des modules purs : `npm test`.
//
// ── CE QUI EST TESTÉ ICI, ET CE QUI NE L'EST PAS ────────────────────────────
//
// Les modules qui DÉCIDENT sans base ni écran : le moteur de préparation, la
// synthèse et l'historique par visite du dentiste, le journal des dents,
// l'imagerie. Une erreur dans l'un d'eux ne fait pas planter d'écran — elle
// fait taire une alerte ou en invente une, et personne ne s'en aperçoit.
//
// Ce qui n'est PAS testé ici : les routes et la sécurité de la base (RLS,
// isolation entre cabinets). Il faut pour cela une base de test, que MonRDV
// n'a pas encore — voir supabase/TESTS-BASE.md.
//
// ── COMMENT ─────────────────────────────────────────────────────────────────
//
// `node --test`, sans framework (pas de Jest, pas de Vitest : une dépendance,
// une configuration et un cache de moins). Les modules sont compilés avec le
// TypeScript du projet dans un dossier temporaire DANS le dépôt — pour que
// `date-fns` & co se trouvent dans node_modules — puis leurs imports `@/lib/…`
// sont réécrits en chemins relatifs.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const atelier = join(racine, '.tests-tmp')

const MODULES = [
  'lib/preparation.ts',
  'lib/espace-dentaire.ts',
  'lib/imagerie.ts',
  'lib/dental.ts',
  'lib/dental-history.ts',
  'lib/utils.ts',
]

rmSync(atelier, { recursive: true, force: true })
mkdirSync(atelier, { recursive: true })
try {
  const config = join(atelier, 'tsconfig.json')
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: 'es2022', module: 'es2022', moduleResolution: 'bundler',
      strict: true, skipLibCheck: true, types: ['node'], noEmitOnError: true,
      baseUrl: racine, paths: { '@/*': ['./*'] },
      rootDir: racine, outDir: atelier, jsx: 'preserve',
    },
    files: MODULES.map((m) => join(racine, m)),
  }))
  execFileSync('npx', ['tsc', '-p', config], { cwd: racine, stdio: 'inherit' })

  // Les imports `@/lib/x` et `./x` deviennent `./x.js` : Node ne résout ni
  // les alias du projet, ni les modules sans extension.
  const lib = join(atelier, 'lib')
  for (const f of readdirSync(lib).filter((f) => f.endsWith('.js'))) {
    const p = join(lib, f)
    const src = readFileSync(p, 'utf8')
      .replace(/from '@\/lib\/([\w-]+)'/g, "from './$1.js'")
      .replace(/from '\.\/([\w-]+)'/g, "from './$1.js'")
      .replace(/from '@\/types'/g, "from '../types/index.js'")
    writeFileSync(p, src)
  }

  const tests = readdirSync(join(racine, 'scripts', 'tests')).filter((f) => f.endsWith('.test.mjs'))
  for (const t of tests) copyFileSync(join(racine, 'scripts', 'tests', t), join(lib, t))
  // Les FICHIERS, pas le dossier : passé un dossier, Node 24 le cherche comme
  // un module et échoue avec « Cannot find module ».
  execFileSync('node', ['--test', ...tests.map((t) => join(lib, t))], { stdio: 'inherit' })
  console.log(`\n✓ ${tests.length} fichiers de tests : tout passe.`)
} finally {
  rmSync(atelier, { recursive: true, force: true })
}
