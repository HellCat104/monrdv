// L'écran des modèles a quitté la branche gastro : la table est commune, et un
// dentiste en a le même usage. L'ancienne adresse reste valide — elle est dans
// les favoris des praticiens qui s'en servent depuis des mois.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AncienneAdresseModeles() {
  redirect('/modeles')
}
