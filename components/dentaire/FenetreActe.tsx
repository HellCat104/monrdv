'use client'

// LA FENÊTRE « AJOUTER UN ACTE » — et « Modifier l'acte ».
//
// Le praticien arrive ici avec les dents qu'il a touchées sur le schéma. Il
// choisit l'acte dans SA liste (le catalogue officiel, ses prix, ses actes à
// lui) : le prix arrive tout seul — le sien, sinon le dernier qu'il a
// pratiqué, sinon le tarif de référence — et reste modifiable. Il dit où en
// est l'acte. Les dents se corrigent sur l'arcade de droite sans refermer.
//
// Un acte qui se compte par dent (une obturation, une extraction) devient
// autant d'actes que de dents : c'est ainsi qu'ils partiront sur la feuille de
// soins. La fenêtre le dit avant d'enregistrer, avec le total.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import ArcadeSelecteur from '@/components/dentaire/ArcadeSelecteur'
import { acteParCode } from '@/lib/actes-dentaires'
import {
  STATUTS_ACTE, LIBELLE_SOURCE_PRIX, GROUPE_PERSO,
  filtrerCatalogue, prixPropose, repartirDents, trierDents, changementsSchema, etatsDeLActe,
  type ActeCatalogue, type ActePatient, type ChangementSchema, type SourcePrix, type StatutActe,
} from '@/lib/actes-patient'
import { DENTAL_FACES } from '@/lib/dental'
import { Search, X } from 'lucide-react'

function aujourdhui(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const DH = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`

export default function FenetreActe({
  ouvert, onFermer, patientId, appointmentId = null, dentsInitiales = [], facesInitiales = [], acte = null,
  statutParDefaut = 'fini', catalogue, derniers, catalogueCharge, onEnregistre,
}: {
  ouvert: boolean
  onFermer: () => void
  patientId: string
  appointmentId?: string | null
  /** Les dents touchées sur le schéma. */
  dentsInitiales?: string[]
  /** Les faces touchées sur la vue de dessus du schéma. */
  facesInitiales?: string[]
  /** L'acte à modifier — absent pour en créer un. */
  acte?: ActePatient | null
  statutParDefaut?: StatutActe
  catalogue: ActeCatalogue[]
  derniers: Record<string, number>
  catalogueCharge: boolean
  /** Les actes enregistrés, et ce que le schéma doit montrer (null si le
   *  praticien a choisi de ne pas le reporter). */
  onEnregistre: (actes: ActePatient[], changements: ChangementSchema[] | null) => void
}) {
  const edition = !!acte
  const [date, setDate] = useState(aujourdhui())
  const [libelle, setLibelle] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [choisi, setChoisi] = useState<ActeCatalogue | null>(null)
  const [recherche, setRecherche] = useState('')
  const [listeOuverte, setListeOuverte] = useState(false)
  const [dents, setDents] = useState<string[]>([])
  const [faces, setFaces] = useState<string[]>([])
  const [prix, setPrix] = useState('')
  const [sourcePrix, setSourcePrix] = useState<SourcePrix | null>(null)
  const [remarque, setRemarque] = useState('')
  const [statut, setStatut] = useState<StatutActe>(statutParDefaut)
  const [parDent, setParDent] = useState(true)
  const [reporter, setReporter] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState('')
  const champRecherche = useRef<HTMLInputElement>(null)

  // À chaque ouverture, la fenêtre repart de ce qu'on lui donne.
  useEffect(() => {
    if (!ouvert) return
    setErreur(''); setEnCours(false); setRecherche(''); setReporter(true); setParDent(true)
    if (acte) {
      setDate(acte.date_acte); setLibelle(acte.libelle); setCode(acte.code); setChoisi(null)
      setDents(acte.dents); setFaces(acte.faces); setPrix(String(acte.prix)); setSourcePrix(null)
      setRemarque(acte.remarque ?? ''); setStatut(acte.statut); setListeOuverte(false)
    } else {
      setDate(aujourdhui()); setLibelle(''); setCode(null); setChoisi(null)
      setDents(trierDents(dentsInitiales)); setFaces(facesInitiales); setPrix(''); setSourcePrix(null)
      setRemarque(''); setStatut(statutParDefaut); setListeOuverte(true)
      setTimeout(() => champRecherche.current?.focus(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert])

  const resultats = useMemo(() => filtrerCatalogue(catalogue, recherche).slice(0, recherche ? 60 : 400), [catalogue, recherche])
  const groupes = useMemo(() => {
    const m = new Map<string, ActeCatalogue[]>()
    for (const a of resultats) m.set(a.groupe, [...(m.get(a.groupe) ?? []), a])
    return Array.from(m.entries())
  }, [resultats])

  function choisir(a: ActeCatalogue) {
    setChoisi(a); setLibelle(a.libelle); setCode(a.code)
    const { prix: p, source } = prixPropose(a, derniers)
    setPrix(p != null ? String(p) : ''); setSourcePrix(source)
    setRecherche(''); setListeOuverte(false)
    // Les faces touchées sur le schéma sont gardées : elles ne partent avec
    // l'acte que s'il en a (obturation, inlay…).
  }

  /** Un acte tapé qui n'est pas dans la liste : acte libre, sans code. */
  function acteLibre() {
    const l = recherche.replace(/\s+/g, ' ').trim()
    if (!l) return
    setChoisi(null); setLibelle(l); setCode(null); setSourcePrix(null)
    setRecherche(''); setListeOuverte(false)
  }

  const officiel = acteParCode(code)
  const exigence = officiel ? officiel.dent : (choisi?.perso || !code ? (parDent ? 'une' : 'bloc') : null)
  const prixNombre = Number(String(prix).replace(',', '.'))
  const nbActes = edition ? 1 : repartirDents(exigence, dents).length
  const etats = etatsDeLActe(code, libelle)
  const avecFaces = !!officiel?.face || etats?.fini === 'obturation' || etats?.fini === 'inlay'
  const changements = changementsSchema({ code, libelle, statut, dents, faces })
  const basculerDent = (d: string) => setDents((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : trierDents([...prev, d])))

  async function enregistrer() {
    setErreur('')
    if (!libelle.trim()) { setErreur('Choisissez un acte.'); return }
    if (!Number.isFinite(prixNombre) || prixNombre < 0 || String(prix).trim() === '') { setErreur('Indiquez le prix.'); return }
    if (officiel?.dent === 'une' && dents.length === 0) {
      setErreur('Cet acte se fait sur une dent : touchez-la sur l’arcade.')
      return
    }
    setEnCours(true)
    try {
      const corps = {
        date_acte: date, libelle: libelle.trim(), code, dents, faces: avecFaces ? faces : [],
        prix: prixNombre, remarque: remarque.trim() || null, statut,
      }
      const res = await fetch(edition ? `/api/dentaire/actes/${acte!.id}` : '/api/dentaire/actes', {
        method: edition ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edition ? corps : { ...corps, patient_id: patientId, appointment_id: appointmentId, par_dent: parDent }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErreur(data.error || 'L’acte n’a pas pu être enregistré.'); return }
      const actes = (edition ? [data.acte] : data.actes) as ActePatient[]
      onEnregistre(actes, reporter ? changements : null)
      onFermer()
    } catch {
      setErreur('La connexion a été interrompue. Réessayez.')
    } finally {
      setEnCours(false)
    }
  }

  const champ = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-300'
  const etiquette = 'block text-[12px] font-semibold text-gray-600 mb-1'

  return (
    <Dialog open={ouvert} onOpenChange={(o) => { if (!o && !enCours) onFermer() }}>
      <DialogContent className="max-w-[980px] w-[96vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edition ? 'Modifier l’acte' : 'Ajouter un acte'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_340px]">
          <div className="space-y-4 min-w-0">
            {/* 1. L'ACTE */}
            <div>
              <label className={etiquette}>Acte <span className="text-red-500">*</span></label>
              {libelle && !listeOuverte ? (
                <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{libelle}</p>
                    <p className="text-[11px] text-gray-500">
                      {code ? `Code ${code}` : 'Hors nomenclature — pas de code'}
                      {officiel?.note ? ` · ${officiel.note}` : ''}
                    </p>
                  </div>
                  {!(edition && acte?.care_sheet_id) && (
                    <button type="button" onClick={() => { setListeOuverte(true); setTimeout(() => champRecherche.current?.focus(), 30) }}
                      className="text-[12px] text-primary-700 hover:underline shrink-0">Changer</button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 px-3 border-b border-gray-100">
                    <Search className="h-4 w-4 text-gray-400 shrink-0" />
                    <input ref={champRecherche} value={recherche} onChange={(e) => setRecherche(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (resultats[0]) choisir(resultats[0]); else acteLibre() } }}
                      placeholder="Chercher un acte : obturation, couronne, D706, extraction…"
                      className="flex-1 text-sm py-2 focus:outline-none bg-transparent" />
                    {libelle && (
                      <button type="button" onClick={() => setListeOuverte(false)} className="text-gray-400 hover:text-gray-700" aria-label="Fermer la liste">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-[300px] overflow-y-auto py-1">
                    {!catalogueCharge && <p className="text-xs text-gray-400 px-3 py-2">Chargement de vos actes…</p>}
                    {catalogueCharge && groupes.map(([titre, liste]) => (
                      <div key={titre}>
                        <p className={`text-[10px] font-semibold uppercase tracking-wide px-3 pt-2 pb-1 ${titre === GROUPE_PERSO ? 'text-primary-600' : 'text-gray-400'}`}>{titre}</p>
                        {liste.map((a) => {
                          const { prix: p } = prixPropose(a, derniers)
                          return (
                            <button key={a.cle} type="button" onClick={() => choisir(a)}
                              className="w-full flex items-baseline gap-2 text-left px-3 py-1.5 hover:bg-primary-50">
                              {a.code && <span className="text-[11px] font-mono text-gray-400 w-10 shrink-0">{a.code}</span>}
                              <span className="text-[13px] text-gray-800 flex-1 min-w-0">{a.libelle}</span>
                              {p != null && <span className="text-[12px] text-gray-500 tabular-nums shrink-0">{DH(p)}</span>}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                    {catalogueCharge && recherche.trim() && (
                      <button type="button" onClick={acteLibre}
                        className="w-full text-left px-3 py-2 text-[13px] text-primary-700 hover:bg-primary-50 border-t border-gray-100">
                        Utiliser « {recherche.trim()} » comme acte libre (sans code)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiquette} htmlFor="acte-date">Date</label>
                <input id="acte-date" type="date" value={date} max="2100-12-31" onChange={(e) => setDate(e.target.value)} className={champ}
                  disabled={!!acte?.care_sheet_id} />
              </div>
              <div>
                <label className={etiquette} htmlFor="acte-prix">Prix (DH) <span className="text-red-500">*</span></label>
                <input id="acte-prix" inputMode="decimal" value={prix}
                  onChange={(e) => { setPrix(e.target.value); setSourcePrix(null) }}
                  className={champ} disabled={!!acte?.care_sheet_id} />
                {sourcePrix && <p className="text-[11px] text-gray-400 mt-0.5">Proposé : {LIBELLE_SOURCE_PRIX[sourcePrix]}. Modifiable.</p>}
              </div>
            </div>

            {/* 2. LES DENTS */}
            <div>
              <label className={etiquette}>Dents</label>
              <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] rounded-lg border border-gray-200 px-2 py-1.5">
                {dents.length === 0 && <span className="text-[12px] text-gray-400">Aucune — touchez les dents sur l’arcade{officiel?.dent === null ? ' (cet acte n’en demande pas)' : ''}</span>}
                {dents.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 rounded-md bg-sky-500 text-white text-[12px] font-semibold pl-2 pr-1 py-0.5">
                    {d}
                    {!acte?.care_sheet_id && (
                      <button type="button" onClick={() => basculerDent(d)} aria-label={`Retirer la dent ${d}`} className="hover:bg-sky-600 rounded">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {!edition && dents.length > 1 && exigence === 'une' && (
                <p className="text-[12px] text-gray-600 mt-1">
                  {nbActes} actes seront créés, un par dent
                  {Number.isFinite(prixNombre) && prixNombre > 0 ? ` — ${nbActes} × ${DH(prixNombre)} = ${DH(Math.round(nbActes * prixNombre * 100) / 100)}` : ''}.
                </p>
              )}
              {!edition && dents.length > 1 && exigence === 'bloc' && officiel && (
                <p className="text-[12px] text-gray-500 mt-1">Un seul acte pour l’ensemble de ces dents (acte « par bloc » à la nomenclature).</p>
              )}
              {!edition && !officiel && libelle && dents.length > 1 && (
                <label className="flex items-center gap-2 text-[12px] text-gray-600 mt-1.5">
                  <input type="checkbox" checked={parDent} onChange={(e) => setParDent(e.target.checked)} />
                  Un acte par dent (sinon, un seul acte pour toutes ces dents)
                </label>
              )}
            </div>

            {avecFaces && (
              <div>
                <label className={etiquette}>Faces traitées</label>
                <div className="flex flex-wrap gap-1.5">
                  {DENTAL_FACES.map((f) => {
                    const on = faces.includes(f.key)
                    return (
                      <button key={f.key} type="button" title={f.aide} aria-pressed={on}
                        onClick={() => setFaces((prev) => (on ? prev.filter((x) => x !== f.key) : [...prev, f.key]))}
                        className={`w-9 h-8 rounded-lg text-[12px] font-bold border transition ${on ? 'bg-primary-500 text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                        {f.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 3. OÙ EN EST L'ACTE */}
            <div>
              <label className={etiquette}>Statut</label>
              <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5">
                {STATUTS_ACTE.map((s) => (
                  <button key={s.cle} type="button" onClick={() => setStatut(s.cle)} title={s.aide}
                    className={`text-[12.5px] px-3 py-1.5 rounded-md transition ${statut === s.cle ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={etiquette} htmlFor="acte-remarque">Remarque</label>
              <textarea id="acte-remarque" value={remarque} onChange={(e) => setRemarque(e.target.value)} rows={2}
                placeholder="Facultatif — matériau, teinte, observation…" className={`${champ} resize-none`} />
            </div>

            {changements.length > 0 && (
              <label className="flex items-start gap-2 text-[12.5px] text-gray-700 rounded-lg bg-gray-50 px-3 py-2">
                <input type="checkbox" className="mt-0.5" checked={reporter} onChange={(e) => setReporter(e.target.checked)} />
                <span>
                  Reporter sur le schéma dentaire : {changements[0].nature === 'realise' ? 'réalisé' : 'à faire'} sur {changements.map((c) => c.dent).join(', ')}
                </span>
              </label>
            )}

            {erreur && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erreur}</p>}
          </div>

          {/* L'ARCADE : corriger la sélection sans refermer. */}
          <div className="md:border-l md:border-gray-100 md:pl-6">
            <p className="text-[12px] font-semibold text-gray-600 mb-1">Touchez une dent pour l’ajouter ou la retirer</p>
            <div className={acte?.care_sheet_id ? 'pointer-events-none opacity-60' : ''}>
              <ArcadeSelecteur choisies={dents} onBasculer={basculerDent} />
            </div>
            {acte?.care_sheet_id && (
              <p className="text-[11px] text-gray-500 mt-1">Cet acte figure sur une feuille de soins : seuls le statut et la remarque se modifient.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="outline" onClick={onFermer} disabled={enCours}>Annuler</Button>
          <Button onClick={enregistrer} disabled={enCours || !libelle.trim()}>
            {enCours ? 'Enregistrement…' : edition ? 'Enregistrer' : nbActes > 1 ? `Ajouter ${nbActes} actes` : 'Ajouter'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
