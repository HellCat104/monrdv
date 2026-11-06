'use client'

// La consultation du généraliste, DANS le dossier — pas à côté.
//
// ── CE QUI NE MARCHAIT PAS ──────────────────────────────────────────────────
//
// L'écran de consultation ne montrait que le formulaire. Pour voir un
// traitement en cours, relire la consultation de mars ou envoyer un résumé du
// parcours à un confrère, il fallait quitter la page — et perdre ce qu'on
// venait d'écrire, puisque rien n'était encore enregistré. En pratique, le
// médecin ouvrait le dossier dans un second onglet et recopiait.
//
// ── LA RÈGLE QUI TIENT TOUT ─────────────────────────────────────────────────
//
// Le formulaire reste MONTÉ en permanence : changer de rubrique le masque
// (classe `hidden`), ça ne le démonte pas. Une case remplie puis quittée pour
// vérifier une allergie est toujours remplie au retour. C'est la raison d'être
// de cet écran ; tout le reste en découle.
//
// ── CE QUE CES RUBRIQUES SONT, ET NE SONT PAS ───────────────────────────────
//
// Elles sont en LECTURE SEULE. Modifier un antécédent, importer un résultat,
// corriger une adresse se fait dans le dossier, qui sait le faire. Ici on
// consulte pendant qu'on consulte. Chaque rubrique porte le lien vers le
// dossier, et ce lien ouvre un nouvel onglet — jamais au prix de la
// consultation en cours.
//
// ── CLASSEMENT ──────────────────────────────────────────────────────────────
//
// Trois groupes, dans l'ordre où on s'en sert : ce qu'on écrit aujourd'hui,
// qui est le patient, ce qu'on lui remet. Les rubriques vides restent
// visibles : « aucun traitement en cours » est une information, et l'absence
// d'une ligne de menu en serait une autre, qu'on devrait aller vérifier.
import { Fragment, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Stethoscope, UserRound, ShieldAlert, Pill, BellRing, History,
  FlaskConical, Activity, Syringe, FileText, ExternalLink, ArrowLeft,
  Printer, Mail, Download, Phone,
} from 'lucide-react'
import { formatDateFr, formatDateShort } from '@/lib/utils'
import { CATEGORIES_DOCUMENT, type CategorieDocument } from '@/types'

const DOC_BUCKET = 'patient-documents'

export type CleRubrique =
  | 'consultation' | 'documents'
  | 'identite' | 'contact'
  | 'antecedents' | 'traitements' | 'constantes' | 'passees' | 'examens'
  | 'vaccins' | 'rappels'

/** Un intitulé et sa valeur, déjà mis en forme côté serveur. Le composant
 *  n'interprète aucune donnée patient. */
export interface Champ { label: string; valeur: string }

export interface DonneesDossier {
  // ── CE QUI EST ADMINISTRATIF ──────────────────────────────────────────
  //
  // Qui est la personne, comment on la joint, qui prévenir, qui paie. Rien
  // de clinique : pas une allergie, pas une constante, pas un antécédent.
  /** Nom, naissance, âge, sexe, CIN. */
  identite: Champ[]
  /** Téléphone, e-mail, adresse. */
  contact: Champ[]
  /** Qui prévenir, et à quel numéro (v97). */
  urgence: Champ[]
  /** Mutuelle et organisme. */
  couverture: Champ[]

  // ── CE QUI EST MÉDICAL ────────────────────────────────────────────────
  //
  // Le groupe sanguin est ici et non dans l'état civil : c'est une donnée de
  // santé, qu'on cherche avant un geste, pas en remplissant une facture.
  groupeSanguin: string
  allergies: string
  etiquettes: string[]
  chroniques: string
  chirurgies: string
  familiaux: string
  anamneseMaj: string | null
  traitements: string
  ordonnances: { id: string; created_at: string; content: string }[]
  rappels: { id: string; due_date: string; reason: string | null }[]
  consultations: { id: string; date_consultation: string; motif: string | null; diagnostic: string | null; statut: string }[]
  documents: { id: string; file_name: string; file_path: string; categorie: string | null; created_at: string }[]
  constantes: { mesureLe: string; lignes: string[] } | null
  vaccins: { id: string; libelle: string; administre_le: string; rappel_le: string | null }[]
  /** Aujourd'hui, au format AAAA-MM-JJ et à l'heure du Maroc : sert à dire
   *  qu'un rappel est échu. Calculé côté serveur — `new Date()` dans le
   *  navigateur donnerait la date du fuseau du téléphone. */
  aujourdhui: string
}

export default function DossierDeConsultation({
  patient, donnees, retourCr, children,
}: {
  patient: { id: string; first_name: string; last_name: string; age?: number | null }
  donnees: DonneesDossier
  /** Où mène l'aperçu d'un compte rendu déjà validé. */
  retourCr: string
  /** Le formulaire de consultation. Toujours monté. */
  children: ReactNode
}) {
  const [rubrique, setRubrique] = useState<CleRubrique>('consultation')
  const supabase = createClient()

  async function ouvrirDocument(chemin: string) {
    const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(chemin, 120)
    if (error || !data) { alert('Impossible d’ouvrir ce document.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const dossierHref = `/patients/${patient.id}`
  const echus = donnees.rappels.filter((r) => r.due_date <= donnees.aujourdhui).length

  // DEUX DOSSIERS, DEUX GROUPES. L'administratif (qui est la personne,
  // comment on la joint, qui paie) et le médical (ce qu'elle a, ce qu'elle
  // prend, ce qu'on lui a trouvé) ne se mélangent pas : on ne cherche pas
  // une mutuelle en ouvrant un dossier médical, et une allergie n'a rien à
  // faire à côté d'un numéro de téléphone.
  const groupes: { titre: string; items: { cle: CleRubrique; label: string; icone: ReactNode; compte?: number; alerte?: boolean }[] }[] = [
    {
      titre: 'Aujourd’hui',
      items: [
        { cle: 'consultation', label: 'Consultation du jour', icone: <Stethoscope className="h-4 w-4" /> },
        { cle: 'documents', label: 'Établir un document', icone: <FileText className="h-4 w-4" /> },
      ],
    },
    {
      titre: 'Dossier administratif',
      items: [
        { cle: 'identite', label: 'Identité', icone: <UserRound className="h-4 w-4" /> },
        { cle: 'contact', label: 'Contact et couverture', icone: <Phone className="h-4 w-4" /> },
      ],
    },
    {
      titre: 'Dossier médical',
      items: [
        { cle: 'antecedents', label: 'Allergies, antécédents', icone: <ShieldAlert className="h-4 w-4" />, alerte: !!donnees.allergies.trim() },
        { cle: 'traitements', label: 'Traitements', icone: <Pill className="h-4 w-4" /> },
        { cle: 'constantes', label: 'Constantes', icone: <Activity className="h-4 w-4" /> },
        { cle: 'passees', label: 'Consultations', icone: <History className="h-4 w-4" />, compte: donnees.consultations.length },
        { cle: 'examens', label: 'Résultats d’examens', icone: <FlaskConical className="h-4 w-4" />, compte: donnees.documents.length },
        { cle: 'vaccins', label: 'Vaccins', icone: <Syringe className="h-4 w-4" />, compte: donnees.vaccins.length },
        { cle: 'rappels', label: 'Rappels', icone: <BellRing className="h-4 w-4" />, compte: donnees.rappels.length, alerte: echus > 0 },
      ],
    },
  ]

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* TÉLÉPHONE : une liste déroulante, pas un bandeau de onze pastilles.
          Alignées à la file, elles font se toucher « Identité » et « Allergies »
          et la séparation des deux dossiers disparaît — or c'est précisément
          ce qui ne doit jamais se confondre. La liste native, elle, garde les
          deux intitulés, tient sur une ligne et s'ouvre en plein écran. */}
      <div className="lg:hidden w-full">
        <select
          value={rubrique}
          onChange={(e) => setRubrique(e.target.value as CleRubrique)}
          aria-label="Rubrique du dossier"
          className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800"
        >
          {groupes.map((g) => (
            <optgroup key={g.titre} label={g.titre}>
              {g.items.map((it) => (
                <option key={it.cle} value={it.cle}>
                  {it.label}{it.compte ? ` (${it.compte})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* GRAND ÉCRAN : le rail, toujours visible, qui montre le classement
          sans qu'on ait à l'ouvrir. */}
      <nav className="hidden lg:flex w-full lg:w-56 lg:shrink-0 lg:flex-col lg:gap-0.5 lg:sticky lg:top-4">
        {groupes.map((g) => (
          <Fragment key={g.titre}>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 px-2 pt-3 pb-1">
              {g.titre}
            </p>
            {g.items.map((it) => {
              const actif = it.cle === rubrique
              return (
                <button
                  key={it.cle}
                  type="button"
                  onClick={() => setRubrique(it.cle)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] border transition ${
                    actif
                      ? 'bg-primary-50 text-primary-700 border-primary-100 font-medium'
                      : 'text-gray-600 border-transparent hover:bg-gray-50'
                  }`}
                >
                  <span className={actif ? 'text-primary-600' : 'text-gray-400'}>{it.icone}</span>
                  <span className="min-w-0 truncate">{it.label}</span>
                  {it.compte != null && it.compte > 0 && (
                    <span className={`ml-auto text-[10px] rounded-full px-1.5 py-0.5 shrink-0 ${actif ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                      {it.compte}
                    </span>
                  )}
                  {it.alerte && (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" title="À regarder" />
                  )}
                </button>
              )
            })}
          </Fragment>
        ))}
      </nav>

      <div className="flex-1 min-w-0 w-full">
        {/* Masqué, jamais démonté : ce qui a été tapé survit à un détour par
            les antécédents. */}
        <div className={rubrique === 'consultation' ? '' : 'hidden'}>{children}</div>

        {rubrique !== 'consultation' && (
          <div className="space-y-4 pb-16">
            <button
              type="button"
              onClick={() => setRubrique('consultation')}
              className="flex items-center gap-1.5 text-[13px] text-primary-600 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Revenir à la consultation du jour
            </button>

            {rubrique === 'identite' && (
              <>
                <Administratif />
                <Carte titre="Identité" href={dossierHref} lien="Modifier dans le dossier">
                  <Liste champs={donnees.identite} vide="Aucune information d’état civil renseignée." />
                </Carte>
              </>
            )}

            {rubrique === 'contact' && (
              <>
                <Administratif />
                <Carte titre="Coordonnées" href={dossierHref} lien="Modifier dans le dossier">
                  <Liste champs={donnees.contact} vide="Aucune coordonnée renseignée." />
                </Carte>
                <Carte titre="Contact d’urgence">
                  <Liste champs={donnees.urgence} vide="Aucun contact d’urgence renseigné." />
                </Carte>
                <Carte titre="Couverture">
                  <Liste champs={donnees.couverture} vide="Aucune mutuelle renseignée." />
                </Carte>
              </>
            )}

            {rubrique === 'antecedents' && (
              <>
                <Carte titre="Allergies" href={dossierHref} lien="Modifier dans le dossier">
                  {donnees.allergies.trim() ? (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {donnees.allergies}
                    </p>
                  ) : <Vide quoi="Aucune allergie connue au dossier." />}
                </Carte>
                <Carte titre="Antécédents">
                  {donnees.groupeSanguin && (
                    <p className="text-sm text-gray-900 mb-2">
                      <span className="text-[11px] text-gray-400">Groupe sanguin</span>{' '}
                      <b>{donnees.groupeSanguin}</b>
                    </p>
                  )}
                  {donnees.etiquettes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {donnees.etiquettes.map((e) => (
                        <span key={e} className="text-[11px] bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">{e}</span>
                      ))}
                    </div>
                  )}
                  <Bloc titre="Pathologies chroniques" texte={donnees.chroniques} />
                  <Bloc titre="Chirurgicaux" texte={donnees.chirurgies} />
                  <Bloc titre="Familiaux" texte={donnees.familiaux} />
                  {donnees.etiquettes.length === 0 && !donnees.groupeSanguin && !donnees.chroniques.trim() && !donnees.chirurgies.trim() && !donnees.familiaux.trim() && (
                    <Vide quoi="Aucun antécédent renseigné." />
                  )}
                  {donnees.anamneseMaj && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      Questionnaire de santé mis à jour le {formatDateFr(donnees.anamneseMaj)}.
                    </p>
                  )}
                </Carte>
              </>
            )}

            {rubrique === 'traitements' && (
              <>
                <Carte titre="Traitements en cours" href={dossierHref} lien="Modifier dans le dossier">
                  {donnees.traitements.trim()
                    ? <p className="text-sm text-gray-900 whitespace-pre-wrap">{donnees.traitements}</p>
                    : <Vide quoi="Aucun traitement en cours renseigné." />}
                </Carte>
                <Carte titre="Dernières ordonnances">
                  {donnees.ordonnances.length === 0 ? <Vide quoi="Aucune ordonnance établie ici." /> : (
                    <ul className="space-y-2">
                      {donnees.ordonnances.map((o) => (
                        <li key={o.id} className="border-l-2 border-gray-100 pl-3">
                          <p className="text-[11px] text-gray-400 tabular-nums">{formatDateShort(o.created_at)}</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{o.content}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Carte>
              </>
            )}

            {rubrique === 'rappels' && (
              <Carte titre="Rappels de suivi" href={dossierHref} lien="Gérer dans le dossier">
                {donnees.rappels.length === 0 ? <Vide quoi="Aucun rappel en attente." /> : (
                  <ul className="space-y-1.5">
                    {donnees.rappels.map((r) => {
                      const echu = r.due_date <= donnees.aujourdhui
                      return (
                        <li key={r.id} className="flex items-baseline gap-2">
                          <span className={`text-xs tabular-nums shrink-0 ${echu ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                            {formatDateShort(r.due_date)}
                          </span>
                          <span className="text-sm text-gray-800 min-w-0">{r.reason ?? 'Contrôle'}</span>
                          {echu && <span className="text-[10px] text-red-600 shrink-0">échu</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Carte>
            )}

            {rubrique === 'passees' && (
              <Carte titre="Consultations précédentes">
                {donnees.consultations.length === 0 ? <Vide quoi="Aucune consultation enregistrée." /> : (
                  <ul className="space-y-1.5">
                    {donnees.consultations.map((c) => {
                      const titre = (c.motif ?? '').trim() || (c.diagnostic ?? '').trim() || 'Consultation'
                      const validee = c.statut === 'validee'
                      return (
                        <li key={c.id} className="flex items-baseline gap-2">
                          <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{formatDateShort(c.date_consultation)}</span>
                          {validee ? (
                            <a href={`${retourCr}/${c.id}`} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-primary-600 hover:underline min-w-0 truncate">
                              {titre}
                            </a>
                          ) : (
                            <span className="text-sm text-gray-700 min-w-0 truncate">{titre}</span>
                          )}
                          {!validee && (
                            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">brouillon</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Carte>
            )}

            {rubrique === 'examens' && (
              <Carte titre="Résultats d’examens" href={dossierHref} lien="Importer dans le dossier">
                {donnees.documents.length === 0 ? <Vide quoi="Aucun résultat importé." /> : (
                  <ul className="space-y-1.5">
                    {donnees.documents.map((d) => (
                      <li key={d.id} className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{formatDateShort(d.created_at)}</span>
                        <button type="button" onClick={() => ouvrirDocument(d.file_path)}
                          className="text-sm text-primary-600 hover:underline min-w-0 truncate text-left">
                          {d.file_name}
                        </button>
                        {d.categorie && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 shrink-0">
                            {CATEGORIES_DOCUMENT.find((c) => c.cle === d.categorie as CategorieDocument)?.label ?? d.categorie}
                          </span>
                        )}
                        <Download className="h-3.5 w-3.5 text-gray-300 ml-auto shrink-0" />
                      </li>
                    ))}
                  </ul>
                )}
              </Carte>
            )}

            {rubrique === 'constantes' && (
              <Carte titre="Dernières constantes" href={dossierHref} lien="Mesurer dans le dossier">
                {!donnees.constantes ? <Vide quoi="Aucune mesure enregistrée." /> : (
                  <>
                    <p className="text-[11px] text-gray-400 mb-1.5">Prise du {formatDateFr(donnees.constantes.mesureLe)}</p>
                    <ul className="space-y-0.5">
                      {donnees.constantes.lignes.map((l) => (
                        <li key={l} className="text-sm text-gray-800">{l}</li>
                      ))}
                    </ul>
                  </>
                )}
              </Carte>
            )}

            {rubrique === 'vaccins' && (
              <Carte titre="Vaccins administrés" href={`/vaccin/${patient.id}`} lien="Enregistrer un vaccin">
                {donnees.vaccins.length === 0 ? <Vide quoi="Aucun vaccin enregistré ici." /> : (
                  <ul className="space-y-1.5">
                    {donnees.vaccins.map((v) => (
                      <li key={v.id} className="flex items-baseline gap-2">
                        <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{formatDateShort(v.administre_le)}</span>
                        <span className="text-sm text-gray-800 min-w-0">{v.libelle}</span>
                        {v.rappel_le && <span className="text-[11px] text-gray-400 shrink-0">rappel le {formatDateShort(v.rappel_le)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Carte>
            )}

            {rubrique === 'documents' && (
              <Carte titre="Établir un document">
                <p className="text-[11px] text-gray-400 mb-3">
                  Chaque document s’ouvre dans un nouvel onglet : la consultation en cours reste
                  ouverte et rien de ce que vous avez écrit n’est perdu.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { label: 'Ordonnance', aide: 'Médicaments à délivrer', icone: <Pill className="h-4 w-4" />, href: `/ordonnance/patient/${patient.id}` },
                    { label: 'Certificat ou arrêt', aide: 'Repos, aptitude, scolaire', icone: <FileText className="h-4 w-4" />, href: `/certificat/nouveau/${patient.id}?famille=certificat` },
                    { label: 'Demande d’examen', aide: 'Analyses, imagerie', icone: <FlaskConical className="h-4 w-4" />, href: `/certificat/nouveau/${patient.id}?famille=examen` },
                    { label: 'Courrier au confrère', aide: 'Demande d’avis, adressage', icone: <Mail className="h-4 w-4" />, href: `/certificat/nouveau/${patient.id}?famille=courrier` },
                    { label: 'Résumé du parcours', aide: 'Antécédents, traitements, consultations passées', icone: <Printer className="h-4 w-4" />, href: `/dossier/${patient.id}` },
                    { label: 'Vaccin', aide: 'Enregistrer et remettre le certificat', icone: <Syringe className="h-4 w-4" />, href: `/vaccin/${patient.id}` },
                  ].map((d) => (
                    <a key={d.label} href={d.href} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-2.5 border border-gray-200 rounded-xl px-3 py-2.5 hover:border-primary-300 hover:bg-gray-50 transition">
                      <span className="text-primary-500 mt-0.5 shrink-0">{d.icone}</span>
                      <span className="min-w-0">
                        <span className="block text-sm text-gray-900">{d.label}</span>
                        <span className="block text-[11px] text-gray-400">{d.aide}</span>
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 text-gray-300 ml-auto shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </Carte>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Une rubrique du dossier. Le lien d'en-tête mène là où la chose se MODIFIE,
 *  et toujours dans un nouvel onglet : quitter cette page, c'est perdre la
 *  consultation en cours. */
function Carte({
  titre, href, lien, children,
}: {
  titre: string
  href?: string
  lien?: string
  children: ReactNode
}) {
  return (
    <section className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{titre}</h3>
        {href && lien && (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-primary-600 hover:underline shrink-0 flex items-center gap-1">
            {lien} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {children}
    </section>
  )
}

/** Dit, en une ligne, qu'on est du côté administratif. La séparation des deux
 *  dossiers ne se voit que dans le rail ; un praticien qui arrive ici par le
 *  bandeau d'un téléphone, où les titres de groupe sont masqués, ne la verrait
 *  pas du tout. */
function Administratif() {
  return (
    <p className="text-[11px] text-gray-400">
      Dossier administratif — rien de clinique ne figure ici.
    </p>
  )
}

function Liste({ champs, vide }: { champs: Champ[]; vide: string }) {
  if (champs.length === 0) return <Vide quoi={vide} />
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {champs.map((c) => (
        <div key={c.label} className="flex items-baseline gap-2 min-w-0">
          <dt className="text-[11px] text-gray-400 w-28 shrink-0">{c.label}</dt>
          <dd className="text-sm text-gray-900 min-w-0 break-words">{c.valeur}</dd>
        </div>
      ))}
    </dl>
  )
}

function Bloc({ titre, texte }: { titre: string; texte: string }) {
  if (!texte.trim()) return null
  return (
    <div className="mb-2 last:mb-0">
      <p className="text-[11px] text-gray-400">{titre}</p>
      <p className="text-sm text-gray-900 whitespace-pre-wrap">{texte}</p>
    </div>
  )
}

function Vide({ quoi }: { quoi: string }) {
  return <p className="text-[13px] text-gray-400 italic">{quoi}</p>
}
