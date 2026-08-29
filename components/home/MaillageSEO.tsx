// Maillage interne et contenu de fond de la page d'accueil.
//
// Deux manques identifiés à l'audit de référencement :
//
// 1. Les pages ville/spécialité n'étaient liées depuis NULLE PART. Elles
//    figuraient dans le sitemap, ce qui suffit à les faire découvrir, mais pas
//    à leur transmettre de poids : Google répartit l'autorité d'un site par ses
//    liens internes, et une page orpheline n'en reçoit aucune.
//
// 2. La page d'accueil ne comptait que ~600 mots. Sur une requête disputée
//    comme « rdv médecin maroc », c'est insuffisant pour démontrer qu'on traite
//    le sujet — les pages qui gagnent répondent aux questions réelles.
//
// On ne liste QUE les combinaisons ayant au moins un médecin réservable : une
// page vide dessert le référencement bien plus qu'elle ne le sert.

import Link from 'next/link'
import { MapPin, Stethoscope } from 'lucide-react'

export interface LienSEO {
  href: string
  libelle: string
  nombre: number
}

export function MaillageSEO({ villes, specialites }: { villes: LienSEO[]; specialites: LienSEO[] }) {
  if (villes.length === 0 && specialites.length === 0) return null

  return (
    <section className="bg-white py-14 px-4 border-t border-gray-100">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Prendre rendez-vous avec un médecin au Maroc
        </h2>
        <p className="text-gray-600 mb-8 max-w-2xl">
          MonRDV vous permet de trouver un praticien et de réserver votre créneau en ligne,
          à toute heure, sans appeler le cabinet. La confirmation est immédiate et un rappel
          vous est envoyé avant la consultation.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {villes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary-500" /> Par ville
              </h3>
              <ul className="space-y-1.5">
                {villes.map((v) => (
                  <li key={v.href}>
                    <Link href={v.href} className="text-sm text-gray-600 hover:text-primary-600 hover:underline">
                      {v.libelle}
                      <span className="text-gray-400"> · {v.nombre} praticien{v.nombre > 1 ? 's' : ''}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {specialites.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4 text-primary-500" /> Par spécialité
              </h3>
              <ul className="space-y-1.5">
                {specialites.map((s) => (
                  <li key={s.href}>
                    <Link href={s.href} className="text-sm text-gray-600 hover:text-primary-600 hover:underline">
                      {s.libelle}
                      <span className="text-gray-400"> · {s.nombre} praticien{s.nombre > 1 ? 's' : ''}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// Questions réellement tapées dans Google autour de la prise de rendez-vous
// médical au Maroc. Le balisage FAQPage associé permet à Google d'afficher
// ces réponses directement dans ses résultats.
export const QUESTIONS_FREQUENTES = [
  {
    q: 'Comment prendre rendez-vous avec un médecin au Maroc ?',
    r: 'Recherchez votre praticien sur MonRDV par nom, spécialité ou ville, choisissez un créneau disponible dans son agenda et confirmez. La réservation prend moins de deux minutes, se fait à toute heure, et vous recevez une confirmation immédiate par e-mail ainsi qu’un rappel avant votre consultation.',
  },
  {
    q: 'La prise de rendez-vous sur MonRDV est-elle gratuite pour les patients ?',
    r: 'Oui. MonRDV est entièrement gratuit pour les patients : la recherche d’un médecin, la réservation, la modification et l’annulation d’un rendez-vous ne coûtent rien. Seuls les cabinets médicaux souscrivent un abonnement.',
  },
  {
    q: 'Puis-je annuler ou déplacer mon rendez-vous médical en ligne ?',
    r: 'Oui. Chaque e-mail de confirmation contient un lien d’annulation. Vous pouvez libérer votre créneau en un clic, sans appeler le secrétariat — et le cabinet est prévenu automatiquement.',
  },
  {
    q: 'Puis-je prendre rendez-vous le jour même ?',
    r: 'Cela dépend du praticien. Chaque médecin choisit le délai minimum entre la réservation et la consultation. Lorsqu’il autorise le jour même, les créneaux encore disponibles apparaissent directement dans son agenda.',
  },
  {
    q: 'Mes données médicales sont-elles protégées ?',
    r: 'Oui. Vos données sont chiffrées, cloisonnées par cabinet et accessibles uniquement à votre médecin et aux membres de son équipe qu’il a autorisés. Chaque consultation de dossier est enregistrée, et vous pouvez demander l’effacement de vos données à tout moment depuis votre espace patient.',
  },
  {
    q: 'Quels médecins puis-je trouver sur MonRDV ?',
    r: 'MonRDV référence des médecins généralistes, pédiatres, cardiologues, dermatologues, gynécologues, dentistes, psychologues, kinésithérapeutes et de nombreuses autres spécialités, dans les principales villes du Maroc.',
  },
] as const

export function FAQ() {
  return (
    <section className="bg-gray-50 py-14 px-4 border-t border-gray-100">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Questions fréquentes</h2>
        <div className="space-y-3">
          {QUESTIONS_FREQUENTES.map(({ q, r }) => (
            // <details> plutôt qu'un accordéon en JavaScript : le contenu est
            // présent dans le HTML servi, donc lu par Google même replié.
            <details key={q} className="bg-white rounded-xl border border-gray-100 p-4 group">
              <summary className="font-medium text-gray-900 cursor-pointer list-none flex items-center justify-between gap-3">
                {q}
                <span className="text-primary-500 shrink-0 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="text-sm text-gray-600 mt-3 leading-relaxed">{r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
