import type { Metadata } from 'next'
import Link from 'next/link'
import { Stethoscope } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Conditions Générales d\'Utilisation — MonRDV',
  description:
    'Conditions générales d\'utilisation de la plateforme MonRDV — prise de rendez-vous médicaux en ligne au Maroc. Droits et obligations des médecins et patients, abonnement, responsabilités.',
}

// Composant réutilisable pour les sections
function Section({ id, number, title, children }: {
  id: string
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-start gap-3 mb-4">
        <span className="shrink-0 w-8 h-8 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-bold">
          {number}
        </span>
        <h2 className="text-xl font-semibold text-gray-800 pt-1">{title}</h2>
      </div>
      <div className="ml-11 space-y-3">{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 text-sm text-primary-800">
      {children}
    </div>
  )
}

function WarnBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
      {children}
    </div>
  )
}

const TOC = [
  { id: 'editeur',         n: '1',  title: 'Éditeur de la plateforme' },
  { id: 'acceptation',     n: '2',  title: 'Acceptation des CGU' },
  { id: 'description',     n: '3',  title: 'Description du service' },
  { id: 'acces',           n: '4',  title: 'Accès à la plateforme' },
  { id: 'inscription',     n: '5',  title: 'Inscription et compte utilisateur' },
  { id: 'obligations-med', n: '6',  title: 'Obligations des médecins' },
  { id: 'obligations-pat', n: '7',  title: 'Obligations des patients' },
  { id: 'rdv',             n: '8',  title: 'Prise de rendez-vous' },
  { id: 'abonnement',      n: '9',  title: 'Abonnement médecin' },
  { id: 'suspension',      n: '10', title: 'Suspension et résiliation de compte' },
  { id: 'responsabilite',  n: '11', title: 'Limitation de responsabilité' },
  { id: 'pi',              n: '12', title: 'Propriété intellectuelle' },
  { id: 'comportement',    n: '13', title: 'Comportements interdits' },
  { id: 'donnees',         n: '14', title: 'Données personnelles' },
  { id: 'droit',           n: '15', title: 'Droit applicable' },
  { id: 'modifications',   n: '16', title: 'Modifications des CGU' },
  { id: 'contact',         n: '17', title: 'Contact' },
]

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

      <div className="max-w-5xl mx-auto px-4 py-12 flex gap-10">

        {/* Sommaire latéral — desktop uniquement */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sommaire</p>
            <nav className="space-y-1">
              {TOC.map(({ id, n, title }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 py-1 transition-colors"
                >
                  <span className="w-5 text-xs text-gray-300 font-mono">{n}.</span>
                  {title}
                </a>
              ))}
            </nav>
            <div className="mt-6 pt-6 border-t border-gray-100">
              <Link href="/politique-confidentialite" className="text-xs text-primary-500 hover:underline">
                → Politique de confidentialité
              </Link>
            </div>
          </div>
        </aside>

        {/* Contenu principal */}
        <main className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            Conditions Générales d&apos;Utilisation
          </h1>
          <p className="text-sm text-gray-400 mb-2">Dernière mise à jour : mai 2026 — Version 1.0</p>
          <div className="h-1 w-16 bg-primary-500 rounded-full mb-10" />

          <div className="space-y-10">

            {/* ─── 1. Éditeur ─── */}
            <Section id="editeur" number="1" title="Éditeur de la plateforme">
              <p className="text-gray-600 leading-relaxed">
                La plateforme <strong>MonRDV</strong> (ci-après « la Plateforme ») est éditée par :
              </p>
              <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-700 space-y-1">
                <p><strong>Dénomination :</strong> MonRDV</p>
                <p><strong>Statut juridique :</strong> Auto-entrepreneur</p>
                <p><strong>Responsable :</strong> Asma Adouach</p>
                <p><strong>Pays d'exploitation :</strong> Maroc 🇲🇦</p>
                <p>
                  <strong>Contact :</strong>{' '}
                  <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">
                    asmaadouach@gmail.com
                  </a>
                </p>
                <p>
                  <strong>Hébergement :</strong> Vercel Inc. (infrastructure) / Supabase (base de données — serveurs AWS, région Europe)
                </p>
              </div>
            </Section>

            {/* ─── 2. Acceptation ─── */}
            <Section id="acceptation" number="2" title="Acceptation des CGU">
              <p className="text-gray-600 leading-relaxed">
                L&apos;accès à la Plateforme et son utilisation impliquent l&apos;acceptation pleine,
                entière et sans réserve des présentes Conditions Générales d&apos;Utilisation (CGU).
              </p>
              <p className="text-gray-600 leading-relaxed">
                Pour les <strong>médecins</strong>, l&apos;acceptation est formalisée lors de l&apos;inscription
                par la validation de la case « J&apos;accepte les CGU ». Pour les <strong>patients</strong>,
                l&apos;acceptation est réputée acquise dès la prise de rendez-vous, après validation de la case
                de consentement correspondante.
              </p>
              <p className="text-gray-600 leading-relaxed">
                L&apos;utilisation de la Plateforme est réservée aux personnes majeures (18 ans et plus).
                Toute personne mineure doit être représentée par un parent ou tuteur légal.
              </p>
            </Section>

            {/* ─── 3. Description du service ─── */}
            <Section id="description" number="3" title="Description du service">
              <p className="text-gray-600 leading-relaxed">
                MonRDV est une plateforme numérique de <strong>mise en relation entre patients et professionnels de santé</strong> au Maroc,
                permettant la prise de rendez-vous médicaux en ligne. MonRDV agit exclusivement en qualité
                d&apos;intermédiaire technique et n&apos;est en aucun cas un prestataire de soins médicaux.
              </p>

              <SubSection title="Le service comprend :">
                <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                  <li>La recherche de médecins par spécialité et/ou ville</li>
                  <li>La consultation des disponibilités en temps réel</li>
                  <li>La réservation d&apos;un créneau de consultation</li>
                  <li>L&apos;envoi de confirmations et rappels par email</li>
                  <li>La gestion d&apos;agenda pour les professionnels de santé</li>
                  <li>Un espace patient sécurisé pour consulter et annuler ses rendez-vous</li>
                </ul>
              </SubSection>

              <InfoBox>
                <strong>MonRDV ne fournit pas de consultations médicales en ligne (télémédecine).</strong>{' '}
                La plateforme facilite uniquement la prise de rendez-vous physiques.
                Tout acte médical relève de la responsabilité exclusive du professionnel de santé.
              </InfoBox>
            </Section>

            {/* ─── 4. Accès ─── */}
            <Section id="acces" number="4" title="Accès à la plateforme">
              <p className="text-gray-600 leading-relaxed">
                La Plateforme est accessible via tout navigateur web moderne. MonRDV met en œuvre
                les mesures raisonnables pour assurer une disponibilité continue, mais ne peut garantir
                une disponibilité permanente et sans interruption.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Des interruptions temporaires peuvent survenir pour des raisons de maintenance, de mise à jour
                ou en cas de force majeure (panne réseau, cyberattaque, catastrophe naturelle, etc.).
                MonRDV s&apos;engage à informer les utilisateurs en cas d&apos;interruption planifiée.
              </p>
              <p className="text-gray-600 leading-relaxed">
                La <strong>prise de rendez-vous est gratuite pour les patients</strong>.
                L&apos;accès aux fonctionnalités de gestion professionnelle est soumis à un abonnement
                payant pour les médecins (voir article 9).
              </p>
            </Section>

            {/* ─── 5. Inscription ─── */}
            <Section id="inscription" number="5" title="Inscription et compte utilisateur">
              <SubSection title="Compte médecin :">
                <p className="text-gray-600 leading-relaxed mb-2">
                  Tout professionnel de santé souhaitant s&apos;inscrire doit :
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                  <li>Être titulaire d&apos;un diplôme reconnu par les autorités marocaines</li>
                  <li>Être régulièrement inscrit au <strong>Conseil National de l&apos;Ordre des Médecins du Maroc (CNOM)</strong></li>
                  <li>Fournir son numéro CNOM lors de l&apos;inscription</li>
                  <li>Renseigner des informations exactes, complètes et à jour</li>
                  <li>Ne pas se déclarer spécialiste d&apos;une discipline qu&apos;il ne pratique pas</li>
                </ul>
                <p className="text-gray-600 leading-relaxed mt-2">
                  Chaque demande est soumise à une <strong>vérification manuelle</strong> par l&apos;équipe MonRDV
                  avant activation. MonRDV se réserve le droit de refuser toute inscription sans justification.
                </p>
              </SubSection>

              <SubSection title="Compte patient :">
                <p className="text-gray-600 leading-relaxed">
                  Les patients peuvent prendre rendez-vous <strong>sans création de compte</strong>.
                  La création d&apos;un compte patient (via email ou téléphone) est optionnelle et permet
                  d&apos;accéder à l&apos;historique des rendez-vous et à l&apos;espace de gestion des données personnelles.
                </p>
              </SubSection>

              <SubSection title="Sécurité du compte :">
                <p className="text-gray-600 leading-relaxed">
                  Chaque utilisateur est responsable de la confidentialité de ses identifiants de connexion.
                  Toute utilisation frauduleuse signalée doit être notifiée immédiatement à{' '}
                  <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">
                    asmaadouach@gmail.com
                  </a>.
                </p>
              </SubSection>
            </Section>

            {/* ─── 6. Obligations médecins ─── */}
            <Section id="obligations-med" number="6" title="Obligations des médecins">
              <p className="text-gray-600 leading-relaxed mb-1">
                En s&apos;inscrivant sur MonRDV, le médecin s&apos;engage à :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-1">
                <li>Maintenir ses informations de profil exactes et à jour (spécialité, horaires, coordonnées)</li>
                <li>Honorer les rendez-vous confirmés ou prévenir le patient en cas d&apos;empêchement</li>
                <li>Respecter le secret médical et la confidentialité des données patients</li>
                <li>Utiliser les notes médicales de la plateforme à des fins strictement professionnelles</li>
                <li>Respecter le <strong>Code de déontologie médicale marocain</strong> en toutes circonstances</li>
                <li>Ne pas utiliser MonRDV pour des actes non couverts par son inscription au CNOM</li>
                <li>Informer MonRDV de toute suspension ou radiation de l&apos;Ordre des Médecins dans les 48 heures</li>
                <li>Régler son abonnement dans les délais convenus</li>
              </ul>
              <WarnBox>
                Le non-respect de ces obligations peut entraîner la suspension immédiate du compte
                sans remboursement de la période d&apos;abonnement en cours.
              </WarnBox>
            </Section>

            {/* ─── 7. Obligations patients ─── */}
            <Section id="obligations-pat" number="7" title="Obligations des patients">
              <p className="text-gray-600 leading-relaxed mb-1">
                En utilisant MonRDV, le patient s&apos;engage à :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-1">
                <li>Fournir des informations exactes lors de la prise de rendez-vous (nom, téléphone)</li>
                <li>Se présenter à l&apos;heure au rendez-vous ou l&apos;annuler dans un délai raisonnable</li>
                <li>Utiliser la plateforme uniquement pour des prises de rendez-vous réelles et légitimes</li>
                <li>Ne pas harceler, insulter ou menacer un professionnel de santé via la plateforme</li>
                <li>Ne pas effectuer de fausses réservations dans le but de bloquer des créneaux</li>
              </ul>
            </Section>

            {/* ─── 8. Prise de rendez-vous ─── */}
            <Section id="rdv" number="8" title="Prise de rendez-vous">
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-1">
                <li>Les réservations sont acceptées à partir du <strong>lendemain</strong> de la date de prise de rendez-vous (aucune réservation le jour même)</li>
                <li>Un email de confirmation est envoyé au patient après chaque réservation</li>
                <li>Un rappel par email est envoyé la veille du rendez-vous</li>
                <li>Le patient peut annuler son rendez-vous via le lien inclus dans l&apos;email ou depuis son espace patient</li>
                <li>En cas d&apos;annulation par le médecin, le patient en est informé dans les meilleurs délais</li>
                <li>MonRDV ne peut être tenu responsable des absences, retards ou annulations de dernière minute</li>
              </ul>
            </Section>

            {/* ─── 9. Abonnement ─── */}
            <Section id="abonnement" number="9" title="Abonnement médecin">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center">
                    <span className="text-white font-bold text-sm">299<br/>DH</span>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">Abonnement mensuel</p>
                    <p className="text-gray-500 text-sm">Accès à toutes les fonctionnalités professionnelles</p>
                  </div>
                </div>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    Profil public visible par les patients
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    Agenda illimité, notifications email patients
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    Récapitulatif quotidien par email
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    Gestion des patients, notes médicales privées
                  </li>
                </ul>
              </div>

              <SubSection title="Période d'essai :">
                <p className="text-gray-600 leading-relaxed">
                  Tout nouveau médecin inscrit bénéficie d&apos;une <strong>période d&apos;essai gratuite de 30 jours</strong>,
                  sans engagement, après validation de son compte par MonRDV.
                  Aucune information bancaire n&apos;est requise durant cette période.
                </p>
              </SubSection>

              <SubSection title="Facturation et paiement :">
                <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                  <li>Le montant de l&apos;abonnement est de <strong>299 DHS (dirhams marocains) par mois</strong>, toutes taxes comprises</li>
                  <li>Le paiement s&apos;effectue par <strong>virement bancaire</strong> au début de chaque période mensuelle</li>
                  <li>Une facture est émise et envoyée par email à chaque règlement</li>
                  <li>L&apos;abonnement est renouvelé automatiquement chaque mois sauf résiliation explicite</li>
                  <li><strong>Aucun remboursement</strong> ne sera accordé pour une période d&apos;abonnement déjà entamée</li>
                  <li>Les tarifs sont susceptibles d&apos;évoluer avec un préavis de <strong>30 jours</strong></li>
                </ul>
              </SubSection>

              <SubSection title="Non-paiement :">
                <p className="text-gray-600 leading-relaxed">
                  En cas de non-paiement à l&apos;échéance, MonRDV adressera une relance par email.
                  Sans régularisation dans un délai de <strong>7 jours calendaires</strong> suivant la relance,
                  le profil du médecin sera <strong>suspendu</strong> et ne sera plus visible par les patients.
                  La réactivation est possible dès régularisation du paiement.
                </p>
              </SubSection>
            </Section>

            {/* ─── 10. Suspension ─── */}
            <Section id="suspension" number="10" title="Suspension et résiliation de compte">
              <SubSection title="Résiliation à l'initiative du médecin :">
                <p className="text-gray-600 leading-relaxed">
                  Le médecin peut résilier son abonnement à tout moment en adressant une demande à{' '}
                  <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">asmaadouach@gmail.com</a>.
                  La résiliation prend effet à la fin de la période mensuelle en cours.
                  Les données du compte sont conservées 1 an après la résiliation, sauf demande de suppression.
                </p>
              </SubSection>

              <SubSection title="Suspension à l'initiative de MonRDV :">
                <p className="text-gray-600 leading-relaxed mb-2">
                  MonRDV se réserve le droit de <strong>suspendre immédiatement</strong> un compte sans préavis ni indemnité dans les cas suivants :
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                  <li>Violation des présentes CGU</li>
                  <li>Fourniture d&apos;informations fausses ou trompeuses lors de l&apos;inscription</li>
                  <li>Usurpation d&apos;identité ou exercice illégal de la médecine</li>
                  <li>Radiation ou suspension de l&apos;Ordre des Médecins</li>
                  <li>Comportement frauduleux ou abusif envers des patients</li>
                  <li>Non-paiement persistant de l&apos;abonnement</li>
                  <li>Décision judiciaire ou administrative l&apos;exigeant</li>
                </ul>
              </SubSection>

              <SubSection title="Résiliation à l'initiative du patient :">
                <p className="text-gray-600 leading-relaxed">
                  Le patient peut demander la suppression de son compte et de ses données à tout moment
                  depuis la section «&nbsp;Mes données&nbsp;» de son espace patient, ou par email.
                </p>
              </SubSection>
            </Section>

            {/* ─── 11. Responsabilité ─── */}
            <Section id="responsabilite" number="11" title="Limitation de responsabilité">
              <SubSection title="MonRDV s'engage à :">
                <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                  <li>Assurer la disponibilité de la Plateforme avec un niveau de service raisonnable</li>
                  <li>Protéger les données personnelles conformément à la loi 09-08</li>
                  <li>Vérifier les qualifications déclarées des médecins inscrits</li>
                  <li>Traiter les réclamations dans un délai raisonnable</li>
                </ul>
              </SubSection>

              <SubSection title="MonRDV ne peut être tenu responsable :">
                <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                  <li>Des actes, diagnostics ou traitements médicaux réalisés par les professionnels inscrits</li>
                  <li>Des informations médicales erronées communiquées par un médecin</li>
                  <li>Des absences, retards ou annulations de rendez-vous</li>
                  <li>Des interruptions de service dues à la force majeure</li>
                  <li>Des informations inexactes délibérément fournies par les utilisateurs</li>
                  <li>Des dommages indirects résultant de l&apos;utilisation ou de l&apos;impossibilité d&apos;utiliser la Plateforme</li>
                  <li>Des pannes ou indisponibilités des services tiers (hébergement, service d&apos;envoi d&apos;emails)</li>
                </ul>
              </SubSection>

              <WarnBox>
                <strong>MonRDV est un intermédiaire technique, pas un prestataire médical.</strong>{' '}
                Toute décision médicale appartient exclusivement au professionnel de santé.
                En cas de doute médical urgent, contactez le <strong>15</strong> (SAMU) ou le <strong>150</strong> (Police Secours).
              </WarnBox>
            </Section>

            {/* ─── 12. PI ─── */}
            <Section id="pi" number="12" title="Propriété intellectuelle">
              <p className="text-gray-600 leading-relaxed">
                L&apos;ensemble des éléments composant la Plateforme MonRDV — logo, charte graphique, design,
                architecture, textes, fonctionnalités logicielles — est protégé par le droit marocain
                de la propriété intellectuelle (loi n° 2-00 relative aux droits d&apos;auteur).
              </p>
              <p className="text-gray-600 leading-relaxed">
                Toute reproduction, représentation, modification, publication ou adaptation de tout ou partie
                des éléments de la Plateforme, quel que soit le moyen ou le procédé utilisé, est strictement
                interdite sans autorisation écrite préalable de MonRDV.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Les médecins conservent la propriété de leurs données professionnelles (profil, agenda).
                MonRDV dispose uniquement d&apos;un droit d&apos;hébergement et d&apos;affichage sur la Plateforme.
              </p>
            </Section>

            {/* ─── 13. Comportement ─── */}
            <Section id="comportement" number="13" title="Comportements interdits">
              <p className="text-gray-600 leading-relaxed mb-2">
                Il est formellement interdit, sous peine de suspension immédiate et de poursuites judiciaires :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                <li>D&apos;usurper l&apos;identité d&apos;un professionnel de santé ou d&apos;un patient</li>
                <li>De publier des informations médicales fausses ou trompeuses</li>
                <li>De tenter d&apos;accéder frauduleusement aux systèmes ou données d&apos;autres utilisateurs</li>
                <li>D&apos;utiliser des robots, scripts ou outils automatisés pour accéder à la Plateforme</li>
                <li>De procéder à de la vente, revente ou cession des données collectées via MonRDV</li>
                <li>D&apos;utiliser la Plateforme à des fins de spam, de prospection commerciale ou de marketing non sollicité</li>
                <li>D&apos;introduire des virus ou tout programme malveillant dans les systèmes MonRDV</li>
                <li>D&apos;effectuer des réservations fictives dans le but de nuire à un médecin ou à la Plateforme</li>
              </ul>
            </Section>

            {/* ─── 14. Données ─── */}
            <Section id="donnees" number="14" title="Données personnelles">
              <p className="text-gray-600 leading-relaxed">
                Le traitement des données personnelles sur MonRDV est régi par la{' '}
                <strong>loi marocaine n° 09-08</strong> du 18 février 2009 relative à la protection des
                personnes physiques à l&apos;égard du traitement des données à caractère personnel.
              </p>
              <p className="text-gray-600 leading-relaxed">
                MonRDV a procédé aux déclarations requises auprès de la{' '}
                <strong>Commission Nationale de contrôle de la protection des Données à caractère Personnel (CNDP)</strong>.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Pour le détail complet de la politique de traitement des données, merci de consulter notre{' '}
                <Link href="/politique-confidentialite" className="text-primary-500 hover:underline font-medium">
                  Politique de confidentialité
                </Link>.
              </p>
            </Section>

            {/* ─── 15. Droit applicable ─── */}
            <Section id="droit" number="15" title="Droit applicable et juridiction compétente">
              <p className="text-gray-600 leading-relaxed">
                Les présentes Conditions Générales d&apos;Utilisation sont soumises au <strong>droit marocain</strong>,
                notamment au Code des obligations et contrats (DOC), à la loi n° 31-08 sur la protection
                des consommateurs, à la loi n° 09-08 sur la protection des données personnelles,
                et aux textes réglementant l&apos;exercice de la médecine au Maroc.
              </p>
              <p className="text-gray-600 leading-relaxed">
                En cas de litige, les parties s&apos;engagent à rechercher une solution amiable dans un délai de
                30 jours à compter de la notification du différend. À défaut de règlement amiable,
                le litige sera soumis à la juridiction compétente du <strong>Royaume du Maroc</strong>.
              </p>
            </Section>

            {/* ─── 16. Modifications ─── */}
            <Section id="modifications" number="16" title="Modifications des CGU">
              <p className="text-gray-600 leading-relaxed">
                MonRDV se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs
                enregistrés seront informés par email en cas de modification substantielle, avec un préavis
                de <strong>15 jours</strong>. La poursuite de l&apos;utilisation de la Plateforme après la date
                d&apos;entrée en vigueur des nouvelles CGU vaut acceptation de celles-ci.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Si l&apos;une des dispositions des présentes CGU est jugée invalide ou inapplicable par une
                juridiction compétente, les autres dispositions demeurent pleinement en vigueur
                (<em>clause de divisibilité</em>).
              </p>
            </Section>

            {/* ─── 17. Contact ─── */}
            <Section id="contact" number="17" title="Contact">
              <p className="text-gray-600 leading-relaxed">
                Pour toute question, réclamation ou signalement relatif aux présentes CGU :
              </p>
              <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-700 space-y-2">
                <p>
                  📧 Email général :{' '}
                  <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">
                    asmaadouach@gmail.com
                  </a>
                </p>
                <p>
                  🔒 Protection des données :{' '}
                  <a href="mailto:asmaadouach@gmail.com" className="text-primary-500 hover:underline">
                    asmaadouach@gmail.com
                  </a>
                </p>
                <p>💬 WhatsApp support : disponible via la page d&apos;accueil</p>
                <p>⏱ Délai de réponse : <strong>48 heures ouvrées</strong> maximum</p>
              </div>
            </Section>

          </div>

          {/* Bas de page */}
          <div className="mt-16 pt-8 border-t border-gray-100 flex flex-wrap justify-between items-center gap-4 text-sm text-gray-400">
            <p>© 2026 MonRDV — Tous droits réservés</p>
            <div className="flex gap-4">
              <Link href="/politique-confidentialite" className="hover:text-primary-500 transition-colors">
                Politique de confidentialité
              </Link>
              <Link href="/" className="hover:text-primary-500 transition-colors">
                ← Accueil
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
