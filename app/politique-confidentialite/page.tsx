import Link from 'next/link'
import { Stethoscope } from 'lucide-react'

export const metadata = {
  title: 'Politique de confidentialité — MonRDV',
  description: 'Politique de confidentialité et protection des données personnelles de MonRDV',
}

export default function PolitiqueConfidentialite() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Politique de confidentialité</h1>
        <p className="text-sm text-gray-400 mb-10">Dernière mise à jour : mai 2026</p>

        <div className="prose prose-gray max-w-none space-y-8">

          {/* 1 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Qui sommes-nous ?</h2>
            <p className="text-gray-600 leading-relaxed">
              MonRDV est une plateforme de prise de rendez-vous médicaux en ligne au Maroc.
              Elle met en relation des patients avec des professionnels de santé inscrits sur la plateforme.
              Pour toute question relative à vos données, contactez-nous à{' '}
              <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">
                asmaadouach@gmail.com
              </a>.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Données collectées</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Côté patient :</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                  <li>Nom et prénom</li>
                  <li>Numéro de téléphone</li>
                  <li>Date et heure du rendez-vous</li>
                  <li>Notes éventuelles liées au rendez-vous</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Côté médecin :</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                  <li>Nom complet, email, numéro de téléphone</li>
                  <li>Spécialité et ville d'exercice</li>
                  <li>Diplôme ou carte professionnelle (document de vérification)</li>
                  <li>Horaires de consultation</li>
                  <li>Notes médicales privées sur les patients (visibles uniquement par le médecin concerné)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">3. Utilisation des données</h2>
            <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
              <li>Permettre la prise de rendez-vous en ligne</li>
              <li>Envoyer des confirmations et rappels de rendez-vous</li>
              <li>Permettre au médecin de gérer son agenda</li>
              <li>Vérifier l'identité et les qualifications des médecins inscrits</li>
              <li>Améliorer le fonctionnement de la plateforme</li>
            </ul>
            <p className="text-gray-600 mt-3">
              Nous ne vendons ni ne partageons vos données avec des tiers à des fins commerciales.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">4. Accès aux données</h2>
            <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
              <li><strong>Chaque médecin</strong> n'a accès qu'à ses propres patients et rendez-vous — il ne peut jamais consulter les données d'un autre médecin.</li>
              <li><strong>Les patients</strong> voient uniquement leurs propres rendez-vous.</li>
              <li><strong>L'administrateur MonRDV</strong> a accès aux informations de profil des médecins uniquement dans le cadre de la vérification et de la gestion de la plateforme.</li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Sécurité des données</h2>
            <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
              <li>Toutes les données sont chiffrées en transit (HTTPS/TLS)</li>
              <li>Les données sont hébergées sur des serveurs sécurisés (Supabase / AWS)</li>
              <li>Les mots de passe sont chiffrés et ne sont jamais stockés en clair</li>
              <li>Les accès sont protégés par authentification</li>
              <li>Aucune donnée bancaire n'est collectée ni stockée sur MonRDV — les paiements se font directement en cabinet</li>
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">6. Conservation des données</h2>
            <p className="text-gray-600 leading-relaxed">
              Les données sont conservées aussi longtemps que le compte est actif.
              En cas de suppression du compte, les données personnelles sont supprimées dans un délai de 30 jours,
              sauf obligation légale de conservation.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">7. Vos droits</h2>
            <p className="text-gray-600 mb-2">Conformément à la loi marocaine 09-08 relative à la protection des données personnelles, vous avez le droit de :</p>
            <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
              <li>Accéder à vos données personnelles</li>
              <li>Rectifier des données inexactes</li>
              <li>Demander la suppression de vos données</li>
              <li>Vous opposer au traitement de vos données</li>
            </ul>
            <p className="text-gray-600 mt-3">
              Pour exercer ces droits, contactez-nous à{' '}
              <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">
                asmaadouach@gmail.com
              </a>.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">8. Cookies</h2>
            <p className="text-gray-600 leading-relaxed">
              MonRDV utilise uniquement des cookies techniques nécessaires au fonctionnement de la plateforme
              (session d'authentification). Aucun cookie publicitaire ou de tracking n'est utilisé.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">9. Modifications</h2>
            <p className="text-gray-600 leading-relaxed">
              Cette politique peut être mise à jour. En cas de modification importante,
              les utilisateurs seront informés par email ou via la plateforme.
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 px-4 text-center text-sm text-gray-400 mt-8">
        <Link href="/" className="hover:text-primary-500 transition-colors">← Retour à l'accueil</Link>
      </footer>
    </div>
  )
}
