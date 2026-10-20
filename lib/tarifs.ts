// Faut-il montrer le prix d'un motif de consultation ? Une seule réponse, partout.
//
// La règle vivait en clair dans app/[slug]/BookingPageClient.tsx. Le chatbot
// WhatsApp doit afficher EXACTEMENT ce que le médecin a déjà choisi dans ses
// paramètres MonRDV — pas un second réglage à maintenir. Dupliquer la condition
// aurait garanti la divergence : le jour où la règle change d'un côté, le
// patient voit deux prix différents selon qu'il passe par le site ou WhatsApp.
//
// Trois conditions, et les trois comptent :
//   show_prices     — le choix explicite du médecin (v49, défaut true)
//   default_price   — le tarif peut n'avoir jamais été saisi (colonne nullable)
//   > 0             — un tarif laissé à 0 ne s'affiche pas « 0 Dh »
// Les deux premières sont indépendantes : un médecin peut autoriser l'affichage
// sans avoir rempli ses tarifs.

export interface MotifTarifable {
  name: string
  duration_minutes: number
  default_price?: number | null
}

export function tarifVisible(
  showPrices: boolean | null | undefined,
  defaultPrice: number | null | undefined
): boolean {
  return showPrices !== false && defaultPrice != null && Number(defaultPrice) > 0
}

/**
 * Libellé d'un motif tel que le patient le lit : « Détartrage — 45 min — 300 Dh ».
 * Le prix disparaît de lui-même si le médecin l'a masqué ou ne l'a pas saisi.
 */
export function libelleMotif(motif: MotifTarifable, showPrices: boolean | null | undefined): string {
  const base = `${motif.name} — ${motif.duration_minutes} min`
  return tarifVisible(showPrices, motif.default_price)
    ? `${base} — ${Math.round(Number(motif.default_price))} Dh`
    : base
}

/**
 * La durée et le tarif SEULS : « 45 min — 300 Dh ».
 *
 * Une ligne de liste WhatsApp a un titre de 24 caractères et une description de
 * 72. Mettre le libellé complet dans les deux donnait « Certificat médical —
 * 15… » en titre : le nom du motif coupé net, dans le seul champ que le patient
 * revoit ensuite dans sa propre bulle de réponse. Le NOM va donc au titre, et
 * ce détail à la description.
 */
export function detailMotif(motif: MotifTarifable, showPrices: boolean | null | undefined): string {
  const duree = `${motif.duration_minutes} min`
  return tarifVisible(showPrices, motif.default_price)
    ? `${duree} — ${Math.round(Number(motif.default_price))} Dh`
    : duree
}
