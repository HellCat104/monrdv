// Les traits communs aux formulaires de remboursement imprimés.
//
// Les quatre imprimés — CNSS, CNOPS, RMA, FAR — n'ont ni la même trame ni les
// mêmes couleurs, mais ils écrivent tous de la même façon : des numéros en
// cases d'un chiffre, des cases à cocher carrées, et des lignes « Libellé :
// ....... » avec parfois l'arabe en regard. Ces trois gestes sont ici, une
// fois, pour que corriger la taille d'une case les corrige tous.

/** Une valeur écrite chiffre par chiffre dans la grille du formulaire.
 *
 *  Les cases non remplies restent vides — on ne complète pas un numéro
 *  d'immatriculation avec des zéros qu'on aurait inventés. */
export function Cases({ valeur, nombre }: { valeur?: string | null; nombre: number }) {
  const car = String(valeur ?? '').replace(/\s/g, '').split('')
  return (
    <span className="inline-flex align-middle">
      {Array.from({ length: nombre }).map((_, i) => (
        <span
          key={i}
          className="w-[13px] h-[16px] border border-gray-500 border-l-0 first:border-l text-[9px] leading-[15px] text-center font-mono"
        >
          {car[i] ?? ''}
        </span>
      ))}
    </span>
  )
}

/** Une case à cocher du formulaire, cochée ou non. */
export function Case({ cochee }: { cochee: boolean }) {
  return (
    <span className="inline-block w-[12px] h-[12px] border border-gray-700 align-middle text-[10px] leading-[10px] text-center font-bold">
      {cochee ? '×' : ''}
    </span>
  )
}

/** Un cercle à cocher — RMA en met deux pour « Devis » et « Exécution ». */
export function Pastille({ cochee }: { cochee: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-[13px] h-[13px] rounded-full border border-gray-700 align-middle">
      {cochee && <span className="w-[7px] h-[7px] rounded-full bg-gray-900" />}
    </span>
  )
}

/** Une ligne « Libellé : valeur » du formulaire, avec ses pointillés. */
export function Champ({ fr, ar, children, large = false }: {
  fr: string
  ar?: string
  children?: React.ReactNode
  /** Réserve la hauteur d'une ligne même sans valeur : pour les cases que le
   *  praticien complète au stylo. */
  large?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2 py-[3px]">
      <span className="text-[9.5px] text-gray-900 shrink-0">{fr} :</span>
      <span className={`flex-1 border-b border-dotted border-gray-400 text-[10px] font-medium text-gray-900 ${large ? 'min-h-[13px]' : ''}`}>
        {children}
      </span>
      {ar && <span className="text-[9px] text-gray-700 shrink-0" dir="rtl">{ar}</span>}
    </div>
  )
}

/** Une date ISO en jour/mois/année. Rend une chaîne vide pour tout ce qui n'en
 *  est pas une : une case vide vaut mieux qu'une date inventée sur un document
 *  qui engage un remboursement. */
export function jourFr(j?: string | null): string {
  const s = String(j ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}

/** Les huit chiffres d'une date, pour les grilles « JJ MM AAAA ». */
export const chiffresDate = (j?: string | null) => jourFr(j).replace(/\//g, '')
