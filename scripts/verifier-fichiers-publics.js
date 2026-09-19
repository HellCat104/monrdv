// Contrôle de build : aucun lien DIRECT vers un fichier de public/.
//
// Le 19-09-2026, la documentation PDF corrigée s'affichait encore dans son
// ancienne version sur iPhone et sur Mac : Safari garde un fichier associé à
// son adresse, même après rechargement. Le remède — une adresse qui porte
// l'empreinte du contenu — ne protège que les liens qui passent par
// `fichierPublic()`. Ce contrôle garantit qu'il n'en existe pas d'autres :
//
//   1. toute mention d'un fichier de public/ dans le code doit être
//      l'argument d'un appel `fichierPublic('…')` ;
//   2. tout `fichierPublic('…')` doit viser un fichier qui existe vraiment.
//
// Une infraction fait ÉCHOUER le build — en local comme sur Vercel. Le
// problème ne peut donc pas revenir par simple oubli.
//
// Appelé par next.config.js pendant `next build` et `next dev` ; exécutable
// seul : `node scripts/verifier-fichiers-publics.js`.
const fs = require('fs')
const path = require('path')

const RACINE = path.join(__dirname, '..')
const DOSSIERS_SOURCE = ['app', 'components', 'lib']

function lister(dossier, filtre) {
  const res = []
  if (!fs.existsSync(dossier)) return res
  for (const nom of fs.readdirSync(dossier)) {
    const complet = path.join(dossier, nom)
    if (fs.statSync(complet).isDirectory()) res.push(...lister(complet, filtre))
    else if (!filtre || filtre(complet)) res.push(complet)
  }
  return res
}

// Retire les commentaires — expliquer un fichier dans un commentaire n'est pas
// y faire un lien. `(^|[^:])//` épargne les « https:// » des chaînes.
function sansCommentaires(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
}

function verifier() {
  const publics = lister(path.join(RACINE, 'public')).map(
    (f) => '/' + path.relative(path.join(RACINE, 'public'), f).split(path.sep).join('/'))
  const sources = DOSSIERS_SOURCE.flatMap((d) =>
    lister(path.join(RACINE, d), (f) => /\.(tsx?|jsx?|mjs)$/.test(f)))

  const erreurs = []
  for (const fichier of sources) {
    const code = sansCommentaires(fs.readFileSync(fichier, 'utf8'))
    const lignes = code.split('\n')
    const rel = path.relative(RACINE, fichier)

    // 2. Chaque fichierPublic('…') vise un fichier existant.
    for (const m of code.matchAll(/fichierPublic\(\s*(['"`])([^'"`]+)\1\s*\)/g)) {
      if (!publics.includes(m[2])) {
        const ligne = code.slice(0, m.index).split('\n').length
        erreurs.push(`${rel}:${ligne} — fichierPublic('${m[2]}') : ce fichier n'existe pas dans public/.`)
      }
    }

    // 1. Aucune autre mention d'un fichier public.
    lignes.forEach((texte, i) => {
      for (const pub of publics) {
        let pos = texte.indexOf(pub)
        while (pos !== -1) {
          const avant = texte.slice(0, pos)
          const dansAppel = /fichierPublic\(\s*['"`]$/.test(avant)
          // « /logo-monrdv.svg » ne doit pas matcher « /x/logo-monrdv.svg ».
          const bordOk = !/[\w-]$/.test(avant)
          if (!dansAppel && bordOk) {
            erreurs.push(
              `${rel}:${i + 1} — lien direct vers « ${pub} ». ` +
              `Écrire fichierPublic('${pub}') (import depuis '@/lib/fichiers-publics').`)
          }
          pos = texte.indexOf(pub, pos + 1)
        }
      }
    })
  }
  return erreurs
}

module.exports = { verifier }

if (require.main === module) {
  const erreurs = verifier()
  if (erreurs.length) {
    console.error('\n✖ Fichiers publics :\n  ' + erreurs.join('\n  ') + '\n')
    process.exit(1)
  }
  console.log('✓ Fichiers publics : tous les liens sont versionnés.')
}
