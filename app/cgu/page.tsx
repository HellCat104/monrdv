import Link from 'next/link'
import { Stethoscope } from 'lucide-react'

export const metadata = {
  title: 'Conditions Générales d\'Utilisation — MonRDV',
  description: 'Conditions générales d\'utilisation de la plateforme MonRDV',
}

export default function CGUPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-primary-500 rounded-xl flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-xl">MonRDV</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Conditions Générales d&apos;Utilisation</h1>
        <p className="text-sm text-gray-400 mb-10">Dernière mise à jour : mai 2026</p>

        <div className="space-y-8">

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Présentation de la plateforme</h2>
            <p className="text-gray-600 leading-relaxed">
              MonRDV est une plateforme en ligne de mise en relation entre patients et professionnels de santé au Maroc,
              permettant la prise de rendez-vous médicaux en ligne. L&apos;utilisation de la plateforme implique
              l&apos;acceptation pleine et entière des présentes conditions générales d&apos;utilisation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Accès à la plateforme</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              La plateforme MonRDV est accessible gratuitement à tout patient souhaitant prendre un rendez-vous médical.
              L&apos;accès aux fonctionnalités complètes nécessite la création d&apos;un compte utilisateur.
            </p>
            <p className="text-gray-600 leading-relaxed">
              MonRDV se réserve le droit de suspendre ou de résilier l&apos;accès à la plateforme en cas de violation
              des présentes conditions, sans préavis ni indemnité.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">3. Inscription des professionnels de santé</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              Tout professionnel de santé souhaitant s&apos;inscrire sur MonRDV doit :
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 ml-2">
              <li>Être titulaire d&apos;un diplôme reconnu par les autorités marocaines compétentes</li>
              <li>Être inscrit au tableau de l&apos;Ordre des Médecins du Maroc ou de l&apos;ordre professionnel concerné</li>
              <li>Fournir un document justificatif valide (diplôme ou carte professionnelle)</li>
              <li>Renseigner des informations exactes et à jour sur son profil</li>
              <li>Ne pas exercer une spécialité différente de celle déclarée</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              Chaque demande d&apos;inscription est soumise à une vérification manuelle par l&apos;équipe MonRDV
              avant activation du compte. MonRDV se réserve le droit de refuser ou de suspendre tout compte
              ne respectant pas ces conditions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">4. Prise de rendez-vous</h2>
            <ul className="list-disc list-inside text-gray-600 space-y-2 ml-2">
              <li>MonRDV est un intermédiaire technique — il ne fournit pas lui-même de soins médicaux</li>
              <li>La prise de rendez-vous est gratuite pour les patients</li>
              <li>Le patient s&apos;engage à se présenter à l&apos;heure prévue ou à annuler dans un délai raisonnable</li>
              <li>Le médecin peut annuler ou modifier un rendez-vous en cas d&apos;urgence ou d&apos;empêchement</li>
              <li>MonRDV ne peut être tenu responsable en cas d&apos;absence du médecin ou du patient</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Abonnement médecin</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              L&apos;accès aux fonctionnalités professionnelles de MonRDV est soumis à un abonnement mensuel
              de <strong>149 DHS par mois</strong>, après une période d&apos;essai gratuite de 30 jours.
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 ml-2">
              <li>Le paiement s&apos;effectue par virement bancaire</li>
              <li>En cas de non-paiement, le profil du médecin sera suspendu et ne sera plus visible par les patients</li>
              <li>L&apos;abonnement est renouvelable chaque mois</li>
              <li>Aucun remboursement ne sera accordé pour une période entamée</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">6. Responsabilités</h2>
            <div className="space-y-3">
              <div>
                <h3 className="font-medium text-gray-700 mb-1">MonRDV s&apos;engage à :</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                  <li>Assurer la disponibilité de la plateforme dans la mesure du possible</li>
                  <li>Protéger les données personnelles des utilisateurs</li>
                  <li>Vérifier les qualifications des médecins inscrits</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-1">MonRDV ne peut être tenu responsable :</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                  <li>Des actes médicaux réalisés par les professionnels de santé inscrits</li>
                  <li>Des interruptions de service dues à des cas de force majeure</li>
                  <li>Des informations inexactes fournies par les utilisateurs</li>
                  <li>De la qualité des soins dispensés en consultation</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">7. Propriété intellectuelle</h2>
            <p className="text-gray-600 leading-relaxed">
              L&apos;ensemble des contenus de la plateforme MonRDV (logo, design, textes, fonctionnalités)
              est protégé par le droit de la propriété intellectuelle. Toute reproduction ou utilisation
              sans autorisation préalable est strictement interdite.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">8. Comportement des utilisateurs</h2>
            <p className="text-gray-600 leading-relaxed mb-2">Il est strictement interdit de :</p>
            <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
              <li>Usurper l&apos;identité d&apos;un professionnel de santé</li>
              <li>Publier des informations fausses ou trompeuses</li>
              <li>Utiliser la plateforme à des fins illicites ou frauduleuses</li>
              <li>Tenter de pirater ou de perturber le fonctionnement de la plateforme</li>
              <li>Collecter les données d&apos;autres utilisateurs sans autorisation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">9. Droit applicable</h2>
            <p className="text-gray-600 leading-relaxed">
              Les présentes conditions générales sont soumises au droit marocain. En cas de litige,
              les parties s&apos;engagent à rechercher une solution amiable avant tout recours judiciaire.
              À défaut, les tribunaux compétents du Maroc seront saisis.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">10. Contact</h2>
            <p className="text-gray-600 leading-relaxed">
              Pour toute question relative aux présentes CGU, contactez-nous à{' '}
              <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">
                asmaadouach@gmail.com
              </a>.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 py-6 px-4 text-center text-sm text-gray-400 mt-8">
        <Link href="/" className="hover:text-primary-500 transition-colors">← Retour à l&apos;accueil</Link>
        {' · '}
        <Link href="/politique-confidentialite" className="hover:text-primary-500 transition-colors">
          Politique de confidentialité
        </Link>
      </footer>
    </div>
  )
}
