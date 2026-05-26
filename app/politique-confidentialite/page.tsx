import Link from 'next/link'
import { Stethoscope } from 'lucide-react'

export const metadata = {
  title: 'Politique de confidentialité — MonRDV',
  description: 'Politique de confidentialité et protection des données personnelles de MonRDV',
}

export default function PolitiqueConfidentialite() {
  return (
    <div className="min-h-screen bg-white">
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

          {/* 1 — Identité */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Identité du responsable de traitement</h2>
            <p className="text-gray-600 leading-relaxed">
              <strong>MonRDV</strong> est une plateforme de prise de rendez-vous médicaux en ligne au Maroc,
              exploitée par <strong>MonRDV</strong>, enregistrée au Maroc.<br />
              Responsable du traitement : <strong>Asma Adouach</strong><br />
              Email de contact :{' '}
              <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">
                asmaadouach@gmail.com
              </a>
            </p>
          </section>

          {/* 2 — Données collectées */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Données collectées</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Côté patient :</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                  <li>Nom et prénom</li>
                  <li>Numéro de téléphone</li>
                  <li>Adresse email (optionnelle)</li>
                  <li>Date et heure du rendez-vous</li>
                  <li>Motif de consultation (optionnel)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Côté médecin :</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
                  <li>Nom complet, email, numéro de téléphone</li>
                  <li>Spécialité, ville d&apos;exercice et numéro CNOM</li>
                  <li>Horaires de consultation</li>
                  <li>Notes médicales privées sur les patients (visibles uniquement par le médecin concerné)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 3 — Finalités */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">3. Finalités du traitement</h2>
            <p className="text-gray-600 mb-2">Vos données sont collectées <strong>uniquement</strong> pour :</p>
            <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
              <li>Permettre la prise de rendez-vous médicaux en ligne</li>
              <li>Envoyer des confirmations et rappels de rendez-vous par SMS ou email</li>
              <li>Permettre au médecin de gérer son agenda et ses patients</li>
              <li>Vérifier les qualifications des médecins inscrits</li>
            </ul>
            <p className="text-gray-600 mt-3 font-medium">
              Nous ne vendons, ne louons et ne partageons jamais vos données avec des tiers à des fins commerciales ou publicitaires.
            </p>
          </section>

          {/* 4 — Consentement */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">4. Consentement</h2>
            <p className="text-gray-600 leading-relaxed mb-2">
              Lors de la prise de rendez-vous, vous consentez explicitement au traitement de vos données de santé
              (nom, téléphone, motif de consultation) dans le seul but de gérer votre rendez-vous médical.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Vous pouvez retirer votre consentement à tout moment en demandant la suppression de vos données
              à{' '}
              <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">
                asmaadouach@gmail.com
              </a>{' '}
              ou directement depuis votre espace patient.
            </p>
          </section>

          {/* 5 — Accès */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Qui a accès à vos données ?</h2>
            <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
              <li><strong>Le médecin concerné</strong> — accède uniquement à ses propres patients et rendez-vous</li>
              <li><strong>Le patient</strong> — voit uniquement ses propres rendez-vous</li>
              <li><strong>L&apos;administrateur MonRDV</strong> — accède aux profils médecins uniquement pour la vérification et la gestion de la plateforme</li>
              <li><strong>Supabase (hébergeur)</strong> — stockage sécurisé sur serveurs AWS Europe</li>
            </ul>
          </section>

          {/* 6 — Sécurité */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">6. Sécurité des données</h2>
            <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
              <li>Toutes les données sont chiffrées en transit (HTTPS/TLS)</li>
              <li>Les mots de passe sont hachés et jamais stockés en clair</li>
              <li>Les accès sont protégés par authentification stricte</li>
              <li>Aucune donnée bancaire n&apos;est collectée ni stockée sur MonRDV</li>
            </ul>
          </section>

          {/* 7 — Conservation */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">7. Durée de conservation</h2>
            <ul className="list-disc list-inside text-gray-600 space-y-1 ml-2">
              <li><strong>Données de rendez-vous</strong> : conservées 3 ans à compter du rendez-vous</li>
              <li><strong>Données de compte patient</strong> : conservées jusqu&apos;à la suppression du compte</li>
              <li><strong>Données médecin</strong> : conservées pendant la durée du contrat + 1 an</li>
              <li>En cas de demande de suppression, vos données sont effacées dans un délai de <strong>30 jours</strong></li>
            </ul>
          </section>

          {/* 8 — Droits */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">8. Vos droits (loi 09-08)</h2>
            <p className="text-gray-600 mb-3">
              Conformément à la loi marocaine 09-08 relative à la protection des données personnelles, vous disposez des droits suivants :
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 ml-2">
              <li>
                <strong>Droit d&apos;accès</strong> — Obtenir une copie de toutes les données que nous détenons sur vous
              </li>
              <li>
                <strong>Droit de rectification</strong> — Corriger des données inexactes ou incomplètes
              </li>
              <li>
                <strong>Droit à l&apos;effacement</strong> — Demander la suppression de votre compte et de vos données
              </li>
              <li>
                <strong>Droit d&apos;opposition</strong> — Vous opposer au traitement de vos données
              </li>
            </ul>
            <div className="mt-4 bg-primary-50 border border-primary-100 rounded-xl p-4">
              <p className="text-sm text-primary-800 font-medium mb-1">Comment exercer vos droits ?</p>
              <p className="text-sm text-primary-700">
                Depuis votre espace patient → section &quot;Mes données&quot;, ou par email à{' '}
                <a href="mailto:asmaadouach@gmail.com" className="underline">asmaadouach@gmail.com</a>.
                Délai de réponse : <strong>30 jours maximum</strong>.
              </p>
            </div>
          </section>

          {/* 9 — Cookies */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">9. Cookies</h2>
            <p className="text-gray-600 leading-relaxed">
              MonRDV utilise uniquement des cookies techniques nécessaires au fonctionnement de la plateforme
              (session d&apos;authentification). Aucun cookie publicitaire ou de tracking n&apos;est utilisé.
            </p>
          </section>

          {/* 10 — Modifications */}
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">10. Modifications</h2>
            <p className="text-gray-600 leading-relaxed">
              Cette politique peut être mise à jour. En cas de modification importante,
              les utilisateurs seront informés par email ou via la plateforme.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-gray-100 py-6 px-4 text-center text-sm text-gray-400 mt-8">
        <Link href="/" className="hover:text-primary-500 transition-colors">← Retour à l&apos;accueil</Link>
      </footer>
    </div>
  )
}
