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

// Ombres de PDF que le moteur d'Apple dessine en pavés gris (19-09-2026).
//
// Un PDF imprimé depuis Chrome dessine ses ombres CSS avec un masque doux
// « Luminosity » dont la zone (/BBox) est exprimée en unités internes (échelle
// 0,24). Le moteur d'Apple — Safari, Aperçu, tous les navigateurs sur iPhone —
// ignore un tel masque dès que sa zone sort du rectangle de la page, et peint
// l'ombre en bloc plein. Chrome sur Mac, lui, l'affiche normalement : même
// fichier, deux apparences, et l'on croit à deux versions du document.
//
// Correction : python3 scripts/corriger-ombres-pdf.py entree.pdf sortie.pdf
function ombresFautives(chemin) {
  const brut = fs.readFileSync(chemin).toString('latin1')
  // Dans un flux d'objets compressé, les dictionnaires sont illisibles ici :
  // plutôt que de laisser passer sans avoir vérifié, on le signale.
  if (/\/Type\s*\/ObjStm/.test(brut)) {
    return ['objets compressés (ObjStm) : ombres non vérifiables — réenregistrer le PDF sans flux d\'objets']
  }
  const objet = (n) => {
    const m = brut.match(new RegExp('(?:^|[\\r\\n\\s])' + n + '\\s+0\\s+obj([\\s\\S]*?)endobj'))
    return m ? m[1] : ''
  }
  const pages = [...brut.matchAll(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g)]
    .map((m) => [+m[1], +m[2], +m[3], +m[4]])
  if (!pages.length) return []
  const W = Math.max(...pages.map((p) => p[2])), H = Math.max(...pages.map((p) => p[3]))
  const fautes = []
  for (const m of brut.matchAll(/\/S\s*\/Luminosity[\s\S]{0,80}?\/G\s+(\d+)\s+0\s+R/g)) {
    const bb = objet(m[1]).match(/\/BBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/)
    if (!bb) continue
    const [x0, y0, x1, y1] = bb.slice(1).map(Number)
    if (x0 < -0.5 || y0 < -0.5 || x1 > W + 0.5 || y1 > H + 0.5) {
      fautes.push(`ombre (groupe ${m[1]}, zone [${x0} ${y0} ${x1} ${y1}]) dessinée en pavé gris par Safari / iPhone / Aperçu`)
    }
  }
  return fautes
}

function verifier() {
  const publics = lister(path.join(RACINE, 'public')).map(
    (f) => '/' + path.relative(path.join(RACINE, 'public'), f).split(path.sep).join('/'))
  const sources = DOSSIERS_SOURCE.flatMap((d) =>
    lister(path.join(RACINE, d), (f) => /\.(tsx?|jsx?|mjs)$/.test(f)))

  const erreurs = []

  // 3. Aucun PDF publié avec des ombres que le moteur d'Apple dessine mal.
  for (const pub of publics.filter((p) => /\.pdf$/i.test(p))) {
    for (const faute of ombresFautives(path.join(RACINE, 'public', pub))) {
      erreurs.push(`public${pub} — ${faute}. Corriger : python3 scripts/corriger-ombres-pdf.py public${pub} public${pub}`)
    }
  }

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
