// Le résumé du dossier, écrit tout seul — pour les courriers au confrère.
//
// Un médecin qui adresse son patient a tout sous les yeux dans sa fiche :
// antécédents, allergies, traitement en cours, dernières constantes, la
// dernière ordonnance. Il le recopiait à la main, ou — plus souvent — ne le
// recopiait pas : « je vous adresse Mme X pour avis » et le confrère rappelle
// pour demander ce qu'elle prend.
//
// LA RÈGLE DE CE FICHIER : on ne met que ce qu'on SAIT. Une rubrique vide ne
// s'imprime pas. Un courrier qui annonce « Allergies : — » fait douter de
// toutes les autres lignes : le confrère ne peut pas savoir si c'est « aucune
// allergie connue » ou « personne n'a rempli le champ ». Mieux vaut le silence
// que l'ambiguïté sur une allergie.
//
// Le texte produit reste ÉDITABLE à l'écran : c'est un point de départ qui
// évite la page blanche, pas un document signé d'avance.
import { formatDateFr } from '@/lib/utils'
import { VITAL_DEFS } from '@/types'

export interface DossierResume {
  allergies?: string | null
  chronic_conditions?: string | null
  surgeries?: string | null
  current_treatments?: string | null
  /** Étiquettes de pathologie (v72) : elles disent les cohortes, pas la
   *  nuance clinique. Elles complètent `chronic_conditions`, jamais l'inverse. */
  conditions?: string[] | null
  derniereNote?: { date: string; texte: string } | null
  dernieresConstantes?: { date: string; texte: string } | null
  derniereOrdonnance?: { date: string; contenu: string } | null
  /** Le champ libre « Vaccinations » de la fiche. Du texte, tel que le médecin
   *  l'a saisi — on ne cherche pas à le structurer pour un courrier. */
  vaccins?: string | null
}

/** Les constantes sous forme de phrase. Les deux tensions se recollent en
 *  « TA 120/80 » : séparées, elles ne veulent rien dire pour le lecteur. */
export function texteConstantes(valeurs: Record<string, number> | null | undefined): string {
  if (!valeurs) return ''
  const bouts: string[] = []
  const { systolic, diastolic } = valeurs
  if (systolic && diastolic) bouts.push(`TA ${systolic}/${diastolic} mmHg`)
  for (const def of VITAL_DEFS) {
    if (def.key === 'systolic' || def.key === 'diastolic') continue
    const v = valeurs[def.key]
    if (typeof v === 'number' && !Number.isNaN(v)) bouts.push(`${def.label} ${v} ${def.unit}`)
  }
  return bouts.join(' · ')
}

/** Coupe un texte long sans le trancher au milieu d'un mot. Une note de
 *  consultation peut faire deux pages : la recopier entière dans un courrier
 *  le rendrait illisible, et ce n'est pas ce qu'on demande à un confrère de
 *  lire. */
function extrait(texte: string, max = 400): string {
  const t = texte.trim().replace(/\n{3,}/g, '\n\n')
  if (t.length <= max) return t
  const coupe = t.slice(0, max)
  const dernierEspace = coupe.lastIndexOf(' ')
  return `${coupe.slice(0, dernierEspace > 0 ? dernierEspace : max)}…`
}

export function blocResumeMedical(d: DossierResume): string {
  const lignes: string[] = []
  const ajoute = (titre: string, valeur?: string | null) => {
    const v = (valeur ?? '').trim()
    if (v) lignes.push(`${titre} :\n${v}`)
  }

  // Les allergies en PREMIER, et c'est voulu : c'est la seule rubrique dont
  // l'ignorance peut tuer, et un confrère pressé lit le haut de la page.
  ajoute('Allergies', d.allergies)

  // Antécédents : le texte libre du médecin d'abord, les étiquettes ensuite et
  // seulement si elles apportent autre chose.
  const etiquettes = (d.conditions ?? []).filter(Boolean)
  const antecedents = [
    (d.chronic_conditions ?? '').trim(),
    etiquettes.length > 0 ? etiquettes.join(', ') : '',
  ].filter(Boolean).join(' — ')
  ajoute('Antécédents', antecedents)
  ajoute('Antécédents chirurgicaux', d.surgeries)
  ajoute('Traitement de fond', d.current_treatments)

  if (d.derniereOrdonnance) {
    ajoute(`Dernière ordonnance (${formatDateFr(d.derniereOrdonnance.date)})`, extrait(d.derniereOrdonnance.contenu, 300))
  }
  if (d.dernieresConstantes) {
    ajoute(`Dernières constantes (${formatDateFr(d.dernieresConstantes.date)})`, d.dernieresConstantes.texte)
  }
  if (d.derniereNote) {
    ajoute(`Dernière consultation (${formatDateFr(d.derniereNote.date)})`, extrait(d.derniereNote.texte))
  }
  ajoute('Vaccinations', d.vaccins)

  return lignes.join('\n\n')
}
