// BAC À SABLE — les écrans du généraliste, sur un cabinet inventé.
//
// ── À QUOI ÇA SERT ──────────────────────────────────────────────────────────
//
// Juger un écran se fait à l'œil. Cette page rend les VRAIS composants — même
// code, même mise en page, mêmes règles — mais sur des patients inventés et
// sans aucune base de données. On ouvre http://localhost:3000/apercu, on
// regarde, on dit ce qui va et ce qui ne va pas, et rien n'est écrit nulle
// part.
//
// Les patients et les dates ci-dessous sont faux. Les CONSTATS, eux, sont
// calculés par le vrai moteur (lib/preparation) : si « tension élevée aux deux
// dernières mesures » s'affiche ici, c'est qu'il l'aurait affiché en vrai.
//
// ── À SUPPRIMER ─────────────────────────────────────────────────────────────
//
// Le jour où ces écrans sont validés et branchés. Une page d'aperçu qui
// survit en production est une porte qui ne mène nulle part — ou, pire, qui
// fait croire à des données.
import Link from 'next/link'
import { preparer, type DossierPourPreparation } from '@/lib/preparation'
import ResumePatient from '@/components/dashboard/ResumePatient'
import MaJourneeVue, { type LigneJournee } from '@/components/dashboard/MaJourneeVue'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** EN LIGNE, CETTE PAGE N'EXISTE PAS.
 *
 *  Un bac à sable est fait pour être regardé sur sa machine. Publié sur
 *  monrdv.co.ma, c'est une URL sans mot de passe qui montre des patientes
 *  inventées à qui tombe dessus — un prospect, un confrère, Google. Le
 *  404 est renvoyé AVANT tout rendu : il n'y a rien à deviner, pas même
 *  le titre de la page.
 *
 *  En local (`npm run dev`), rien ne change. */
function horsLigne() {
  if (process.env.NODE_ENV === 'production') notFound()
}

/** Le jour de référence de l'aperçu. Figé, pour que les « il y a 18 mois »
 *  restent les mêmes d'une semaine sur l'autre et qu'on puisse en discuter. */
const AUJOURDHUI = '2026-11-06'

function dossier(sur: Partial<DossierPourPreparation>): DossierPourPreparation {
  return {
    patient: {}, constantes: [], consultations: [], ordonnances: [],
    documents: [], rappels: [], aujourdhui: AUJOURDHUI, ...sur,
  }
}

/** Mme Berrada : l'hypertendue diabétique qu'on suit depuis dix ans. Le cas
 *  qui justifie tout l'encart — quatre choses à savoir, aucune visible dans
 *  la liste des rendez-vous. */
const BERRADA = dossier({
  patient: {
    age: 58,
    allergies: 'Sulfamides (éruption, 2009)',
    conditions: ['Hypertension artérielle', 'Diabète de type 2'],
    chronic_conditions: 'Dyslipidémie',
    surgeries: 'Césarienne 1994',
    current_treatments: 'Amlodipine 5 mg\nMetformine 850 mg × 2',
    anamnese_maj: '2025-02-10',
  },
  constantes: [
    { measured_at: '2026-10-02', values: { systolic: 152, diastolic: 94, heart_rate: 78, weight: 78, height: 162 } },
    { measured_at: '2026-06-18', values: { systolic: 148, diastolic: 92, heart_rate: 74, weight: 77, height: 162 } },
  ],
  consultations: [
    { date: '2026-10-02', titre: 'Suivi d’hypertension artérielle' },
    { date: '2026-06-18', titre: 'Renouvellement de traitement' },
    { date: '2026-02-10', titre: 'Lombalgie aiguë' },
  ],
  ordonnances: [{ created_at: '2026-06-18' }],
  documents: [{ created_at: '2025-05-06', file_name: 'Bilan sanguin mai 2025.pdf' }],
  rappels: [{ due_date: '2026-10-15', reason: 'Contrôle tensionnel à 3 mois' }],
})

/** M. Alaoui : jeune, pas de suivi, rien au dossier. Le cas où l'encart doit
 *  se taire presque entièrement — s'il crie ici, il criera partout. */
const ALAOUI = dossier({
  patient: { age: 31 },
  constantes: [{ measured_at: '2026-11-06', values: { temperature: 38.4, systolic: 118, diastolic: 72 } }],
  consultations: [{ date: '2024-09-12', titre: 'Angine' }],
})

/** Mme Ouazzani : la perte de poids. Un signe d'alarme qui ne se voit qu'en
 *  soustrayant deux lignes de constantes — exactement ce qu'on ne fait pas. */
const OUAZZANI = dossier({
  patient: {
    age: 67,
    conditions: ['Hypothyroïdie'],
    current_treatments: 'Lévothyroxine 75 µg',
  },
  constantes: [
    { measured_at: '2026-10-20', values: { weight: 58, height: 158, systolic: 126, diastolic: 78 } },
    { measured_at: '2026-05-04', values: { weight: 66, height: 158, systolic: 124, diastolic: 76 } },
  ],
  consultations: [{ date: '2026-05-04', titre: 'Suivi d’hypothyroïdie' }],
  ordonnances: [{ created_at: '2026-05-04' }],
})

const LIGNES: LigneJournee[] = [
  {
    rdv: { id: '1', time: '09:00', patient_id: 'apercu-berrada', notes: 'Suivi tension', patient: { first_name: 'Fatima', last_name: 'Berrada', age: 58 } },
    points: preparer(BERRADA).points.filter((p) => p.niveau !== 'info'),
  },
  {
    rdv: { id: '3', time: '10:20', patient_id: 'apercu-ouazzani', notes: 'Fatigue', patient: { first_name: 'Khadija', last_name: 'Ouazzani', age: 67 } },
    points: preparer(OUAZZANI).points.filter((p) => p.niveau !== 'info'),
  },
].filter((l) => l.points.length > 0)

export default function ApercuGeneraliste() {
  horsLigne()
  return (
    <div className="min-h-screen bg-gray-50 py-5">
      <div className="max-w-3xl mx-auto px-4 space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Bac à sable — branche « cabinet complet » du généraliste</p>
          <p className="text-[12px] text-amber-800 leading-snug mt-1">
            Trois patients inventés, aucune base de données derrière. Les écrans sont les vrais,
            et les constats sont calculés par le vrai moteur : ce que vous lisez ici est ce que
            le logiciel afficherait sur ces dossiers. Journée de référence : 6 novembre 2026.
          </p>
          <p className="text-[12px] text-amber-800 mt-1.5">
            <Link href="/apercu/consultation" className="underline font-medium">
              Voir aussi l&apos;écran de consultation structurée →
            </Link>
          </p>
        </div>

        <Bloc
          titre="1. Ma journée"
          quoi="Sur l’accueil, au-dessus des rendez-vous. Ce que les dossiers du jour contiennent déjà et qu’on n’irait pas chercher dossier par dossier. Les patients sans rien à signaler n’y figurent pas — ici, celui de 9 h 40 est absent de la liste."
        >
          <MaJourneeVue lignes={LIGNES} total={3} />
        </Bloc>

        <Bloc
          titre="2. Résumé patient — une chronique suivie"
          quoi="En tête du dossier et en tête de la consultation. Mme Berrada : allergie, deux maladies chroniques, deux traitements, une tension qui monte depuis deux visites, un bilan qui a dix-huit mois, un rappel échu."
        >
          <ResumePatient preparation={preparer(BERRADA)} />
        </Bloc>

        <Bloc
          titre="3. Résumé patient — une perte de poids"
          quoi="Huit kilos en cinq mois : visible seulement en soustrayant deux lignes de constantes. C’est le genre de chose qu’un logiciel doit faire et qu’un humain pressé ne fait pas."
        >
          <ResumePatient preparation={preparer(OUAZZANI)} />
        </Bloc>

        <Bloc
          titre="4. Résumé patient — un dossier neuf"
          quoi="M. Alaoui, 31 ans, fièvre. Rien au dossier. L’encart doit se taire presque entièrement : s’il crie ici, on cessera de le lire ailleurs."
        >
          <ResumePatient preparation={preparer(ALAOUI)} />
        </Bloc>
      </div>
    </div>
  )
}

function Bloc({ titre, quoi, children }: { titre: string; quoi: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-bold text-gray-900">{titre}</h2>
        <p className="text-[12px] text-gray-500 leading-snug mt-0.5">{quoi}</p>
      </div>
      {children}
    </section>
  )
}
