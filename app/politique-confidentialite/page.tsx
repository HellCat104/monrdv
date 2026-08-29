import type { Metadata } from 'next'
import Link from 'next/link'
import { Stethoscope, Shield } from 'lucide-react'
import { LogoMonRDV } from '@/components/shared/LogoMonRDV'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — MonRDV',
  description:
    'Politique de confidentialité de MonRDV — conformité loi marocaine 09-08 et CNDP. Données collectées, finalités, droits des utilisateurs, durée de conservation, sécurité.',
}

function Section({ id, number, title, children }: {
  id: string
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-start gap-3 mb-4">
        <span className="shrink-0 w-8 h-8 rounded-lg bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold">
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

function InfoBox({ children, color = 'blue' }: { children: React.ReactNode; color?: 'blue' | 'green' | 'amber' | 'red' }) {
  const styles = {
    blue:  'bg-primary-50 border-primary-100 text-primary-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red:   'bg-red-50 border-red-200 text-red-800',
  }
  return (
    <div className={`border rounded-xl p-4 text-sm ${styles[color]}`}>
      {children}
    </div>
  )
}

const TOC = [
  { id: 'responsable',   n: '1',  title: 'Responsable du traitement' },
  { id: 'engagement',    n: '2',  title: 'Engagement CNDP (loi 09-08)' },
  { id: 'donnees',       n: '3',  title: 'Données collectées' },
  { id: 'bases',         n: '4',  title: 'Bases légales du traitement' },
  { id: 'finalites',     n: '5',  title: 'Finalités du traitement' },
  { id: 'sante',         n: '6',  title: 'Données de santé — protection renforcée' },
  { id: 'acces',         n: '7',  title: 'Qui accède à vos données ?' },
  { id: 'sous-traitants',n: '8',  title: 'Sous-traitants et transferts' },
  { id: 'conservation',  n: '9',  title: 'Durée de conservation' },
  { id: 'droits',        n: '10', title: 'Vos droits (loi 09-08)' },
  { id: 'exercer',       n: '11', title: 'Comment exercer vos droits ?' },
  { id: 'securite',      n: '12', title: 'Sécurité des données' },
  { id: 'cookies',       n: '13', title: 'Cookies et traceurs' },
  { id: 'mineurs',       n: '14', title: 'Données des mineurs' },
  { id: 'modifications', n: '15', title: 'Mises à jour de cette politique' },
  { id: 'reclamation',   n: '16', title: 'Réclamation auprès de la CNDP' },
  { id: 'contact',       n: '17', title: 'Contact' },
]

export default function PolitiqueConfidentialite() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <LogoMonRDV taille={36} />
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-12 flex gap-10">

        {/* Sommaire latéral — desktop */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sommaire</p>
            <nav className="space-y-1">
              {TOC.map(({ id, n, title }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-green-700 py-1 transition-colors"
                >
                  <span className="w-5 text-xs text-gray-300 font-mono">{n}.</span>
                  {title}
                </a>
              ))}
            </nav>
            <div className="mt-6 pt-6 border-t border-gray-100">
              <Link href="/cgu" className="text-xs text-primary-500 hover:underline">
                → Conditions Générales d&apos;Utilisation
              </Link>
            </div>
          </div>
        </aside>

        {/* Contenu principal */}
        <main className="flex-1 min-w-0">

          {/* Titre */}
          <div className="flex items-start gap-4 mb-8">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center shrink-0">
              <Shield className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Politique de confidentialité</h1>
              <p className="text-sm text-gray-400">Dernière mise à jour : août 2026 — Version 1.1</p>
              <div className="h-1 w-16 bg-green-500 rounded-full mt-3" />
            </div>
          </div>

          {/* Badge conformité */}
          <InfoBox color="green">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🇲🇦</span>
              <div>
                <p className="font-semibold mb-1">Conforme à la loi marocaine n° 09-08</p>
                <p>
                  Cette politique respecte la loi n° 09-08 du 18 février 2009 relative à la protection
                  des personnes physiques à l&apos;égard du traitement des données à caractère personnel,
                  et les recommandations de la <strong>Commission Nationale de contrôle de la protection
                  des Données à caractère Personnel (CNDP)</strong> du Royaume du Maroc.
                </p>
              </div>
            </div>
          </InfoBox>

          <div className="space-y-10 mt-10">

            {/* ─── 1. Responsable ─── */}
            <Section id="responsable" number="1" title="Responsable du traitement des données">
              <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-700 space-y-1.5">
                <p><strong>Nom de la plateforme :</strong> MonRDV</p>
                <p><strong>Statut juridique :</strong> Auto-entrepreneur, Maroc</p>
                <p><strong>Responsable du traitement :</strong> MonRDV</p>
                <p>
                  <strong>Email :</strong>{' '}
                  <a href="mailto:monrdvco@gmail.com" className="text-green-700 hover:underline">
                    monrdvco@gmail.com
                  </a>
                </p>
                <p>
                  <strong>Contact général :</strong>{' '}
                  <a href="mailto:monrdvco@gmail.com" className="text-green-700 hover:underline">
                    monrdvco@gmail.com
                  </a>
                </p>
                <p><strong>Pays :</strong> Royaume du Maroc</p>
              </div>
            </Section>

            {/* ─── 2. CNDP ─── */}
            <Section id="engagement" number="2" title="CNDP et loi 09-08">
              <p className="text-gray-600 leading-relaxed">
                Les traitements de données à caractère personnel opérés sur la Plateforme s&apos;inscrivent dans le cadre
                de la loi n° 09-08 et relèvent de la{' '}
                <strong>Commission Nationale de contrôle de la protection des Données à caractère Personnel (CNDP)</strong>.
              </p>
              <p className="text-gray-600 leading-relaxed">
                En vertu de l&apos;article 13 de la loi 09-08, MonRDV ne traite pas les données
                au-delà des finalités décrites dans la présente politique, ne cède pas les données à des tiers sans consentement,
                et garantit la sécurité et la confidentialité des données traitées.
              </p>
            </Section>

            {/* ─── 3. Données collectées ─── */}
            <Section id="donnees" number="3" title="Données collectées">

              <SubSection title="3.0 Deux niveaux de collecte selon le forfait du médecin :">
                <p className="text-gray-600 leading-relaxed">
                  L&apos;étendue des données collectées dépend du forfait souscrit par le médecin que
                  vous consultez :
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1 mt-2">
                  <li>
                    <strong>Forfait Agenda</strong> — la collecte se limite à la prise de rendez-vous :
                    nom, prénom, téléphone, date et heure du rendez-vous, et éventuellement une note
                    de contact. <strong>Aucune donnée de santé n&apos;est collectée ni conservée</strong> :
                    ni date de naissance, ni sexe, ni antécédent, ni ordonnance.
                  </li>
                  <li>
                    <strong>Forfait Cabinet complet</strong> — le médecin peut en outre tenir un dossier
                    médical (antécédents, constantes, notes de consultation), éditer des ordonnances et
                    des certificats, et établir une facturation. Ces données relèvent de la protection
                    renforcée décrite à l&apos;article 6.
                  </li>
                </ul>
                <p className="text-gray-600 leading-relaxed mt-2">
                  Les tableaux ci-dessous précisent, pour chaque donnée, le forfait concerné.
                </p>
              </SubSection>

              <SubSection title="3.1 Données des patients :">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-gray-600 border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Donnée</th>
                        <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Obligatoire</th>
                        <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Finalité</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-3 border border-gray-200">Nom et prénom</td>
                        <td className="p-3 border border-gray-200 text-center">✅ Oui</td>
                        <td className="p-3 border border-gray-200">Identification pour le médecin</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="p-3 border border-gray-200">Numéro de téléphone</td>
                        <td className="p-3 border border-gray-200 text-center">✅ Oui</td>
                        <td className="p-3 border border-gray-200">Permettre au médecin de contacter le patient</td>
                      </tr>
                      <tr>
                        <td className="p-3 border border-gray-200">Adresse email</td>
                        <td className="p-3 border border-gray-200 text-center">⬜ Non</td>
                        <td className="p-3 border border-gray-200">Confirmation email, espace patient</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="p-3 border border-gray-200">Date et heure du RDV</td>
                        <td className="p-3 border border-gray-200 text-center">✅ Oui</td>
                        <td className="p-3 border border-gray-200">Gestion de l&apos;agenda médecin</td>
                      </tr>
                      <tr>
                        <td className="p-3 border border-gray-200">Motif de consultation</td>
                        <td className="p-3 border border-gray-200 text-center">⬜ Non</td>
                        <td className="p-3 border border-gray-200">Information optionnelle pour le médecin</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="p-3 border border-gray-200">Âge (espace patient)</td>
                        <td className="p-3 border border-gray-200 text-center">⬜ Non</td>
                        <td className="p-3 border border-gray-200">Profil patient, visible uniquement par le patient</td>
                      </tr>
                      <tr>
                        <td className="p-3 border border-gray-200">Historique des rendez-vous</td>
                        <td className="p-3 border border-gray-200 text-center">✅ Oui</td>
                        <td className="p-3 border border-gray-200">Consultation via l&apos;espace patient personnel</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="p-3 border border-gray-200">
                          Date de naissance, sexe
                          <span className="block text-xs text-primary-600 font-medium">Forfait Cabinet complet uniquement</span>
                        </td>
                        <td className="p-3 border border-gray-200 text-center">⬜ Non</td>
                        <td className="p-3 border border-gray-200">Suivi médical (ex. courbes de croissance en pédiatrie)</td>
                      </tr>
                      <tr>
                        <td className="p-3 border border-gray-200">
                          Dossier médical : antécédents, allergies, traitements, constantes, notes,
                          ordonnances, certificats
                          <span className="block text-xs text-primary-600 font-medium">Forfait Cabinet complet uniquement</span>
                        </td>
                        <td className="p-3 border border-gray-200 text-center">⬜ Non</td>
                        <td className="p-3 border border-gray-200">Tenue du dossier de soins par le médecin (voir article 6)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </SubSection>

              <SubSection title="3.2 Données des médecins :">
                <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                  <li>Nom complet, adresse email, numéro de téléphone</li>
                  <li>Spécialité médicale, ville d&apos;exercice, adresse du cabinet</li>
                  <li>Numéro CNOM (Conseil National de l&apos;Ordre des Médecins)</li>
                  <li>Horaires de consultation et durée des créneaux</li>
                  <li>Photo de profil (optionnel)</li>
                  <li>Biographie professionnelle (optionnel)</li>
                  <li>Informations de facturation (pour l&apos;abonnement)</li>
                </ul>
              </SubSection>

              <SubSection title="3.3 Données techniques :">
                <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                  <li>Données de connexion (cookies de session, horodatage)</li>
                  <li>Adresse IP (collectée automatiquement par l&apos;infrastructure d&apos;hébergement)</li>
                  <li>Type de navigateur et système d&apos;exploitation (à des fins de compatibilité)</li>
                </ul>
              </SubSection>

              <InfoBox color="blue">
                <strong>Aucune donnée bancaire</strong> (numéros de carte, RIB, etc.) n&apos;est collectée
                ni stockée directement sur MonRDV. Les paiements s&apos;effectuent par virement bancaire
                en dehors de la Plateforme.
              </InfoBox>
            </Section>

            {/* ─── 4. Bases légales ─── */}
            <Section id="bases" number="4" title="Bases légales du traitement">
              <p className="text-gray-600 leading-relaxed mb-2">
                Conformément à l&apos;article 3 de la loi 09-08, chaque traitement repose sur une base légale :
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-600 border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Traitement</th>
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Base légale</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border border-gray-200">Gestion de la prise de rendez-vous</td>
                      <td className="p-3 border border-gray-200">Exécution du contrat de service (art. 3-3° loi 09-08)</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="p-3 border border-gray-200">Envoi d&apos;emails de confirmation et rappels</td>
                      <td className="p-3 border border-gray-200">Consentement explicite lors de la réservation</td>
                    </tr>
                    <tr>
                      <td className="p-3 border border-gray-200">Vérification des qualifications médicales</td>
                      <td className="p-3 border border-gray-200">Intérêt légitime (protection des patients)</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="p-3 border border-gray-200">Données de santé (motif de consultation)</td>
                      <td className="p-3 border border-gray-200">Consentement explicite (case cochée obligatoire)</td>
                    </tr>
                    <tr>
                      <td className="p-3 border border-gray-200">Conservation des données RDV</td>
                      <td className="p-3 border border-gray-200">Obligation légale et litige potentiel</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="p-3 border border-gray-200">Facturation abonnement médecin</td>
                      <td className="p-3 border border-gray-200">Exécution du contrat d&apos;abonnement</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>

            {/* ─── 5. Finalités ─── */}
            <Section id="finalites" number="5" title="Finalités du traitement">
              <p className="text-gray-600 leading-relaxed mb-1">
                Vos données sont collectées et traitées <strong>exclusivement</strong> pour les finalités suivantes :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 ml-1">
                <li>Permettre la prise de rendez-vous médicaux en ligne entre patients et médecins</li>
                <li>Envoyer des confirmations et rappels de rendez-vous par email</li>
                <li>Permettre aux médecins de gérer leur agenda, leurs patients et leurs disponibilités</li>
                <li>Vérifier les qualifications et l&apos;identité des professionnels de santé inscrits</li>
                <li>Gérer la facturation des abonnements des médecins</li>
                <li>Améliorer le fonctionnement et la sécurité de la Plateforme</li>
                <li>Respecter les obligations légales et réglementaires applicables</li>
              </ul>
              <InfoBox color="red">
                <strong>MonRDV ne vend, ne loue et ne cède jamais vos données personnelles à des tiers</strong>{' '}
                à des fins commerciales, publicitaires ou de profilage. Vos données ne sont utilisées
                que dans le cadre strict des finalités décrites ci-dessus.
              </InfoBox>
            </Section>

            {/* ─── 6. Données de santé ─── */}
            <Section id="sante" number="6" title="Données de santé — protection renforcée">
              <p className="text-gray-600 leading-relaxed">
                Certaines données traitées sur MonRDV constituent des <strong>données de santé à caractère
                personnel</strong> au sens de l&apos;article 1er de la loi 09-08 (ex. : motif de consultation,
                notes médicales du médecin). Ces données bénéficient d&apos;une protection renforcée.
              </p>
              <InfoBox>
                <p className="font-semibold mb-1">📋 Selon le forfait de votre médecin</p>
                <p>
                  Si votre médecin utilise le <strong>forfait Agenda</strong>, la plateforme ne collecte
                  et ne conserve <strong>aucune donnée de santé</strong> vous concernant : seules vos
                  coordonnées et l&apos;horaire de votre rendez-vous sont enregistrés. Le présent article
                  ne s&apos;applique qu&apos;aux médecins ayant souscrit le <strong>forfait Cabinet complet</strong>.
                </p>
              </InfoBox>
              <p className="text-gray-600 leading-relaxed">
                Conformément à l&apos;article 23 de la loi 09-08, le traitement de données de santé est
                autorisé uniquement lorsque la personne concernée a donné son <strong>consentement exprès</strong>.
                Ce consentement est recueilli via la case à cocher lors de la prise de rendez-vous.
              </p>
              <InfoBox color="amber">
                <p className="font-semibold mb-1">⚕️ Accès strictement limité</p>
                <p>
                  Les notes médicales saisies par un médecin sur MonRDV sont <strong>visibles uniquement
                  par ce médecin</strong>. Ni les autres médecins, ni les patients, ni l&apos;administrateur MonRDV
                  n&apos;y ont accès dans le cadre des opérations courantes.
                </p>
              </InfoBox>
            </Section>

            {/* ─── 7. Accès ─── */}
            <Section id="acces" number="7" title="Qui a accès à vos données ?">
              <div className="space-y-3">
                {[
                  {
                    who: '👤 Le patient',
                    what: 'Accède uniquement à ses propres rendez-vous et informations personnelles, via son espace patient sécurisé.'
                  },
                  {
                    who: '🩺 Le médecin concerné',
                    what: 'Accède uniquement aux données de ses propres patients (nom, téléphone, RDV). Il ne peut pas voir les patients d\'un autre médecin.'
                  },
                  {
                    who: '🛡️ L\'administrateur MonRDV',
                    what: 'Accède aux profils médecins pour vérification et gestion de la plateforme. Accès aux rendez-vous uniquement en cas de litige ou signalement.'
                  },
                  {
                    who: '🖥️ Supabase (hébergeur BDD)',
                    what: 'Sous-traitant technique assurant le stockage sécurisé. Accès limité à l\'infrastructure, sans accès aux données au sens métier.'
                  },
                  {
                    who: '📧 Resend (emails)',
                    what: 'Service d\'envoi d\'emails (hébergé dans l\'Union européenne). Reçoit l\'adresse email et le contenu de l\'email de confirmation/rappel uniquement pour l\'envoi. Données non conservées au-delà de la transmission.'
                  },
                ].map(({ who, what }) => (
                  <div key={who} className="bg-gray-50 rounded-xl p-4 flex gap-3">
                    <span className="text-base shrink-0 mt-0.5">{who.split(' ')[0]}</span>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{who.replace(/^[^ ]+ /, '')}</p>
                      <p className="text-gray-500 text-sm mt-0.5">{what}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* ─── 8. Sous-traitants ─── */}
            <Section id="sous-traitants" number="8" title="Sous-traitants et transferts de données">
              <p className="text-gray-600 leading-relaxed">
                MonRDV fait appel aux sous-traitants techniques suivants, choisis pour leur conformité
                aux standards de sécurité internationaux :
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-600 border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Prestataire</th>
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Rôle</th>
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Données transmises</th>
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Localisation</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border border-gray-200 font-medium">Supabase</td>
                      <td className="p-3 border border-gray-200">Base de données + authentification</td>
                      <td className="p-3 border border-gray-200">Toutes les données de la plateforme</td>
                      <td className="p-3 border border-gray-200">AWS eu-west-1 (Irlande, UE)</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="p-3 border border-gray-200 font-medium">Vercel</td>
                      <td className="p-3 border border-gray-200">Hébergement de l&apos;application web</td>
                      <td className="p-3 border border-gray-200">Requêtes HTTP, logs techniques</td>
                      <td className="p-3 border border-gray-200">USA / UE (Edge Network)</td>
                    </tr>
                    <tr>
                      <td className="p-3 border border-gray-200 font-medium">Resend</td>
                      <td className="p-3 border border-gray-200">Envoi d&apos;emails transactionnels</td>
                      <td className="p-3 border border-gray-200">Adresse email, contenu email</td>
                      <td className="p-3 border border-gray-200">UE (eu-west-1, Irlande)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Ces transferts hors du Maroc sont encadrés par des clauses contractuelles de protection
                et par les politiques de confidentialité de chaque prestataire. MonRDV s&apos;assure que
                ces sous-traitants présentent des garanties suffisantes conformément à l&apos;article 43
                de la loi 09-08.
              </p>
            </Section>

            {/* ─── 9. Conservation ─── */}
            <Section id="conservation" number="9" title="Durée de conservation des données">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-600 border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Type de donnée</th>
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Durée de conservation</th>
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border border-gray-200">Données de rendez-vous</td>
                      <td className="p-3 border border-gray-200 font-medium">5 ans</td>
                      <td className="p-3 border border-gray-200">Traçabilité médicale, litiges éventuels</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="p-3 border border-gray-200">Compte patient actif</td>
                      <td className="p-3 border border-gray-200 font-medium">Durée du compte + 1 an</td>
                      <td className="p-3 border border-gray-200">Gestion du service</td>
                    </tr>
                    <tr>
                      <td className="p-3 border border-gray-200">Compte médecin actif</td>
                      <td className="p-3 border border-gray-200 font-medium">Durée du contrat + 1 an</td>
                      <td className="p-3 border border-gray-200">Obligations contractuelles</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="p-3 border border-gray-200">Données de facturation</td>
                      <td className="p-3 border border-gray-200 font-medium">10 ans</td>
                      <td className="p-3 border border-gray-200">Obligation comptable et fiscale marocaine</td>
                    </tr>
                    <tr>
                      <td className="p-3 border border-gray-200">Logs de connexion</td>
                      <td className="p-3 border border-gray-200 font-medium">12 mois</td>
                      <td className="p-3 border border-gray-200">Sécurité, détection des fraudes</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="p-3 border border-gray-200">Données anonymisées (statistiques)</td>
                      <td className="p-3 border border-gray-200 font-medium">Indéfiniment</td>
                      <td className="p-3 border border-gray-200">Amélioration du service (non nominatives)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Au-delà de ces durées, les données sont <strong>supprimées définitivement ou anonymisées</strong>.
                En cas de demande de suppression par l&apos;utilisateur, les données actives sont effacées
                dans un délai de <strong>30 jours</strong>, sous réserve des obligations légales de conservation.
              </p>
            </Section>

            {/* ─── 10. Droits ─── */}
            <Section id="droits" number="10" title="Vos droits en vertu de la loi 09-08">
              <p className="text-gray-600 leading-relaxed mb-3">
                Conformément aux articles 7 à 10 de la loi marocaine n° 09-08, vous disposez des droits suivants :
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  {
                    icon: '📋',
                    title: 'Droit d\'accès',
                    desc: 'Obtenir une copie de l\'ensemble des données vous concernant que MonRDV détient.',
                    article: 'Art. 7 loi 09-08'
                  },
                  {
                    icon: '✏️',
                    title: 'Droit de rectification',
                    desc: 'Corriger des données inexactes, incomplètes ou périmées vous concernant.',
                    article: 'Art. 8 loi 09-08'
                  },
                  {
                    icon: '🗑️',
                    title: 'Droit à l\'effacement',
                    desc: 'Demander la suppression de vos données personnelles et de votre compte.',
                    article: 'Art. 8 loi 09-08'
                  },
                  {
                    icon: '🚫',
                    title: 'Droit d\'opposition',
                    desc: 'Vous opposer au traitement de vos données pour des raisons légitimes.',
                    article: 'Art. 9 loi 09-08'
                  },
                  {
                    icon: '⏸️',
                    title: 'Droit à la limitation',
                    desc: 'Demander la suspension temporaire du traitement de vos données.',
                    article: 'Art. 10 loi 09-08'
                  },
                  {
                    icon: '📤',
                    title: 'Droit à la portabilité',
                    desc: 'Recevoir vos données dans un format structuré et lisible par machine.',
                    article: 'Bonne pratique'
                  },
                ].map(({ icon, title, desc, article }) => (
                  <div key={title} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{icon}</span>
                      <p className="font-semibold text-gray-800 text-sm">{title}</p>
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed mb-2">{desc}</p>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      {article}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* ─── 11. Exercer ses droits ─── */}
            <Section id="exercer" number="11" title="Comment exercer vos droits ?">
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-primary-50 border border-primary-100 rounded-xl p-4">
                  <span className="text-2xl">👤</span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm mb-1">Via votre espace patient (recommandé)</p>
                    <p className="text-sm text-gray-600">
                      Connectez-vous à votre compte → section <strong>&quot;Mes données&quot;</strong> →
                      vous pouvez consulter, modifier ou supprimer vos données directement.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
                  <span className="text-2xl">📧</span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm mb-1">Par email</p>
                    <p className="text-sm text-gray-600">
                      Envoyez votre demande à{' '}
                      <a href="mailto:monrdvco@gmail.com" className="text-green-700 hover:underline">
                        monrdvco@gmail.com
                      </a>{' '}
                      en précisant : votre nom complet, le type de droit que vous souhaitez exercer,
                      et une pièce d&apos;identité pour vérification.
                    </p>
                  </div>
                </div>
              </div>
              <InfoBox color="green">
                <strong>Délai de traitement :</strong> MonRDV s&apos;engage à répondre à toute demande
                dans un délai de <strong>30 jours calendaires</strong> à compter de la réception de
                la demande complète, conformément à l&apos;article 7 de la loi 09-08.
              </InfoBox>
            </Section>

            {/* ─── 12. Sécurité ─── */}
            <Section id="securite" number="12" title="Sécurité des données">
              <p className="text-gray-600 leading-relaxed">
                MonRDV met en œuvre les mesures techniques et organisationnelles appropriées pour protéger
                vos données contre la perte, l&apos;accès non autorisé, la divulgation ou l&apos;altération,
                conformément à l&apos;article 23 de la loi 09-08.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: '🔒', title: 'Chiffrement en transit', desc: 'Toutes les communications entre votre navigateur et nos serveurs sont chiffrées via HTTPS/TLS 1.3.' },
                  { icon: '🗄️', title: 'Chiffrement au repos', desc: 'Les données stockées dans la base de données sont chiffrées (AES-256) par Supabase.' },
                  { icon: '🔑', title: 'Authentification sécurisée', desc: 'Les mots de passe sont hachés avec bcrypt. L\'authentification multi-facteurs est disponible.' },
                  { icon: '🛡️', title: 'Contrôle d\'accès (RLS)', desc: 'Chaque utilisateur n\'accède qu\'à ses propres données grâce aux politiques de sécurité au niveau des lignes (Row Level Security).' },
                  { icon: '🚫', title: 'Aucune donnée bancaire', desc: 'Aucune information de paiement n\'est collectée ni stockée sur la plateforme.' },
                  { icon: '🔍', title: 'Tokens sécurisés', desc: 'Les liens d\'annulation de RDV utilisent des tokens cryptographiques générés aléatoirement (256 bits).' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">{icon}</span>
                      <p className="font-semibold text-gray-800 text-sm">{title}</p>
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                En cas de violation de données susceptible de présenter un risque pour les droits et libertés
                des personnes concernées, MonRDV s&apos;engage à notifier les personnes affectées dans les
                meilleurs délais et à en informer la CNDP conformément aux dispositions légales applicables.
              </p>
            </Section>

            {/* ─── 13. Cookies ─── */}
            <Section id="cookies" number="13" title="Cookies et traceurs">
              <p className="text-gray-600 leading-relaxed">
                MonRDV utilise des cookies <strong>strictement nécessaires</strong> au fonctionnement de la
                Plateforme. Ces cookies ne sont pas soumis à consentement préalable car ils sont
                indispensables au service.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-600 border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Cookie</th>
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Finalité</th>
                      <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border border-gray-200 font-mono text-xs">sb-*</td>
                      <td className="p-3 border border-gray-200">Session d&apos;authentification Supabase</td>
                      <td className="p-3 border border-gray-200">Session / 7 jours</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="p-3 border border-gray-200 font-mono text-xs">rl:*</td>
                      <td className="p-3 border border-gray-200">Rate limiting (protection contre les abus)</td>
                      <td className="p-3 border border-gray-200">1 minute</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <InfoBox color="green">
                <strong>Aucun cookie publicitaire, analytique ou de tracking tiers</strong> n&apos;est utilisé.
                MonRDV ne fait pas appel à Google Analytics, Meta Pixel ou tout autre outil de suivi comportemental.
              </InfoBox>
            </Section>

            {/* ─── 14. Mineurs ─── */}
            <Section id="mineurs" number="14" title="Données des mineurs">
              <p className="text-gray-600 leading-relaxed">
                MonRDV est accessible aux personnes majeures (18 ans et plus).
                Pour les patients mineurs, la prise de rendez-vous doit être effectuée par un parent
                ou tuteur légal. Les données de l&apos;enfant mineur sont alors traitées sous la responsabilité
                du représentant légal qui a donné son consentement.
              </p>
              <p className="text-gray-600 leading-relaxed">
                MonRDV ne collecte pas sciemment de données personnelles de mineurs de manière autonome.
                Si vous constatez qu&apos;un mineur a fourni des données sans autorisation parentale,
                contactez-nous à{' '}
                <a href="mailto:monrdvco@gmail.com" className="text-green-700 hover:underline">
                  monrdvco@gmail.com
                </a>{' '}
                pour suppression immédiate.
              </p>
            </Section>

            {/* ─── 15. Modifications ─── */}
            <Section id="modifications" number="15" title="Mises à jour de cette politique">
              <p className="text-gray-600 leading-relaxed">
                La présente politique de confidentialité peut être mise à jour pour refléter des évolutions
                du service, de la législation ou des pratiques de sécurité. La date de dernière mise à jour
                est indiquée en haut de ce document.
              </p>
              <p className="text-gray-600 leading-relaxed">
                En cas de modification substantielle affectant vos droits, les utilisateurs enregistrés
                seront informés par email avec un préavis de <strong>15 jours</strong> avant l&apos;entrée en
                vigueur. La poursuite de l&apos;utilisation de la Plateforme après cette date vaut acceptation
                des modifications.
              </p>
            </Section>

            {/* ─── 16. Réclamation ─── */}
            <Section id="reclamation" number="16" title="Réclamation auprès de la CNDP">
              <p className="text-gray-600 leading-relaxed">
                Si vous estimez que le traitement de vos données personnelles par MonRDV n&apos;est pas
                conforme à la loi n° 09-08, vous disposez du droit d&apos;introduire une réclamation auprès
                de la Commission Nationale de contrôle de la protection des Données à caractère Personnel :
              </p>
              <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-700 space-y-1.5">
                <p className="font-semibold text-gray-900">CNDP — Commission Nationale de contrôle de la protection des Données à caractère Personnel</p>
                <p>📍 Angle avenue Annakhil et avenue Mehdi Ben Barka, Hay Ryad, Rabat, Maroc</p>
                <p>
                  🌐{' '}
                  <a
                    href="https://www.cndp.ma"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 hover:underline"
                  >
                    www.cndp.ma
                  </a>
                </p>
                <p>📞 +212 (0)5 37 68 25 00</p>
              </div>
              <p className="text-gray-500 text-sm">
                Nous vous encourageons à nous contacter en premier lieu afin de trouver une solution amiable
                à toute préoccupation relative à la protection de vos données.
              </p>
            </Section>

            {/* ─── 17. Contact ─── */}
            <Section id="contact" number="17" title="Contact — Protection des données">
              <p className="text-gray-600 leading-relaxed">
                Pour toute question relative à cette politique ou au traitement de vos données personnelles :
              </p>
              <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-700 space-y-2">
                <p>
                  🔒 <strong>Email dédié protection des données :</strong>{' '}
                  <a href="mailto:monrdvco@gmail.com" className="text-green-700 hover:underline">
                    monrdvco@gmail.com
                  </a>
                </p>
                <p>
                  📧 <strong>Email général :</strong>{' '}
                  <a href="mailto:monrdvco@gmail.com" className="text-green-700 hover:underline">
                    monrdvco@gmail.com
                  </a>
                </p>
                <p>⏱ <strong>Délai de réponse :</strong> 30 jours maximum (conformément à la loi 09-08)</p>
              </div>
            </Section>

          </div>

          {/* Bas de page */}
          <div className="mt-16 pt-8 border-t border-gray-100 flex flex-wrap justify-between items-center gap-4 text-sm text-gray-400">
            <p>© 2026 MonRDV — Tous droits réservés</p>
            <div className="flex gap-4">
              <Link href="/cgu" className="hover:text-green-600 transition-colors">
                CGU
              </Link>
              <Link href="/" className="hover:text-green-600 transition-colors">
                ← Accueil
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
