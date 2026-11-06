#!/usr/bin/env node
// Lance les tests du moteur de préparation.
//
// ── POURQUOI UN SCRIPT ET PAS UN FRAMEWORK ──────────────────────────────────
//
// Le projet n'a pas de Jest, pas de Vitest, et en ajouter un pour un module
// pur de trois cents lignes, c'est une dépendance, une configuration et un
// cache de plus dans un dépôt qui n'en a pas besoin. `node --test` est dans
// Node depuis la 18 et suffit.
//
// Ce que ce script fait : compiler `lib/preparation.ts` SEUL avec le TypeScript
// du projet (il ne dépend de rien — c'est voulu), poser le résultat à côté des
// tests dans un dossier temporaire, et lancer `node --test`.
//
// Lancement : node scripts/tester-preparation.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const atelier = mkdtempSync(join(tmpdir(), 'monrdv-tests-'))

try {
  // Compilation isolée : pas de tsconfig du projet (ses alias `@/` et son
  // `jsx` n'ont rien à faire ici), pas de types de Next.
  execFileSync('npx', [
    'tsc', join(racine, 'lib', 'preparation.ts'),
    '--outDir', atelier,
    '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler',
    '--strict', '--noEmitOnError',
  ], { cwd: racine, stdio: 'inherit' })

  const test = join(atelier, 'preparation.test.mjs')
  copyFileSync(join(racine, 'scripts', 'tests', 'preparation.test.mjs'), test)

  // Le FICHIER, pas le dossier : passé un dossier, Node 24 le cherche comme
  // un module et échoue avec « Cannot find module ».
  execFileSync('node', ['--test', test], { stdio: 'inherit' })
  console.log('\n✓ Moteur de préparation : tous les tests passent.')
} finally {
  rmSync(atelier, { recursive: true, force: true })
}
