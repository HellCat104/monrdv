'use client'

// Le bloc gastro-entérologie dans la fiche patient : par où l'on crée, et ce
// qui a déjà été fait.
//
// ── POURQUOI UN SEUL BOUTON « NOUVEAU » ─────────────────────────────────────
//
// Six liens côte à côte se lisent à chaque fois. Un bouton qui ouvre six
// entrées nommées se lit une fois, et la ligne d'aide dit à quoi chacune sert
// — un gastro-entérologue ne doit pas avoir à deviner la différence entre
// « compte rendu » et « courrier ».
//
// ── POURQUOI LA LISTE DES ACTES ─────────────────────────────────────────────
//
// Une consultation validée doit pouvoir être relue, et un brouillon repris.
// Sans cette liste, un brouillon commencé entre deux patients était perdu : il
// existait en base et aucun écran n'y menait.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Stethoscope, FileText, Mail, FlaskConical, ClipboardList, Pill,
  ChevronDown, Plus, BellRing, Microscope,
} from 'lucide-react'
import { formatDateFr } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ligne = Record<string, any>

export default function BlocGastro({ patientId, doctorId }: { patientId: string; doctorId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [ouvert, setOuvert] = useState(false)
  const [consultations, setConsultations] = useState<Ligne[]>([])
  const [endoscopies, setEndoscopies] = useState<Ligne[]>([])
  const [indisponible, setIndisponible] = useState(false)

  const retour = encodeURIComponent(`/patients/${patientId}`)

  const charger = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from('consultations').select('id, date_consultation, motif, statut, prochain_controle')
        .eq('patient_id', patientId).order('date_consultation', { ascending: false }).limit(20),
      supabase.from('endoscopies').select('id, date_examen, type_examen, statut, conclusion, surveillance_le')
        .eq('patient_id', patientId).order('date_examen', { ascending: false }).limit(20),
    ])
    // Pas de migration, pas de fonctionnalité — mais jamais d'écran cassé.
    if (c.error || e.error) { setIndisponible(true); return }
    setConsultations(c.data ?? []); setEndoscopies(e.data ?? [])
  }, [supabase, patientId])
  useEffect(() => { charger() }, [charger])

  /** Transformer une date de surveillance en rappel. Le délai n'est jamais
   *  calculé : on reprend la date que le médecin a écrite dans son acte. */
  async function programmerSuivi(source: 'consultation' | 'endoscopie', id: string, date: string, motif: string) {
    const { error } = await supabase.from('recalls').insert({
      doctor_id: doctorId, patient_id: patientId, due_date: date,
      reason: motif, status: 'pending', source_type: source, source_id: id,
    })
    alert(error ? 'Le suivi n’a pas pu être programmé.' : 'Suivi programmé. Il apparaît dans « Suivis et résultats ».')
  }

  /** Déclarer qu'on ATTEND un résultat. La ligne naît au moment du
   *  prélèvement, sans fichier : c'est justement l'attente qu'on perd de vue,
   *  la biopsie dont l'anapath n'est jamais revenue. Le document s'y rattache
   *  plus tard, depuis l'onglet Documents. */
  async function attendreResultat(endoscopieId: string, libelleDefaut: string) {
    const libelle = prompt('Quel résultat attendez-vous ?', libelleDefaut)
    if (!libelle?.trim()) return
    const { error } = await supabase.from('resultats').insert({
      doctor_id: doctorId, patient_id: patientId, endoscopie_id: endoscopieId,
      type_resultat: 'anatomopathologie', libelle: libelle.trim(), statut: 'attendu',
    })
    alert(error ? 'Le résultat n’a pas pu être enregistré.' : 'Résultat en attente. Il apparaît dans « Suivis et résultats ».')
  }

  const entrees = [
    { label: 'Consultation', aide: 'Motif, examen, diagnostic, conduite', icone: Stethoscope, href: `/gastro/consultation/${patientId}?back=${retour}` },
    { label: 'Gastroscopie', aide: 'Compte rendu structuré', icone: Microscope, href: `/gastro/endoscopie/${patientId}?type=gastroscopie` },
    { label: 'Coloscopie', aide: 'Compte rendu structuré', icone: Microscope, href: `/gastro/endoscopie/${patientId}?type=coloscopie` },
    { label: 'Fiche de préparation', aide: 'À remettre avant la coloscopie', icone: ClipboardList, href: `/gastro/preparation/${patientId}` },
    { label: 'Ordonnance', aide: 'Depuis un modèle ou vierge', icone: Pill, href: `/ordonnance/patient/${patientId}?back=${retour}` },
    { label: 'Courrier', aide: 'Demande d’avis, résumé médical', icone: Mail, href: `/certificat/nouveau/${patientId}?famille=courrier&back=${retour}` },
    { label: 'Demande d’examen', aide: 'Analyses, imagerie', icone: FlaskConical, href: `/certificat/nouveau/${patientId}?famille=examen&back=${retour}` },
    { label: 'Certificat', aide: 'Repos, aptitude, scolaire', icone: FileText, href: `/certificat/nouveau/${patientId}?famille=certificat&back=${retour}` },
  ]

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary-600">Gastro-entérologie</h3>
        <div className="relative">
          <button onClick={() => setOuvert(!ouvert)}
            className="flex items-center gap-1.5 text-xs font-medium bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 transition">
            <Plus className="h-3.5 w-3.5" /> Nouveau <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {ouvert && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
              <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-lg z-20 py-1">
                {entrees.map((e) => (
                  <a key={e.label} href={e.href} className="flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50 transition">
                    <e.icone className="h-4 w-4 text-primary-500 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-900">{e.label}</span>
                      <span className="block text-[11px] text-gray-400">{e.aide}</span>
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {indisponible ? (
        <p className="text-[11px] text-gray-400 italic">
          Les consultations et comptes rendus attendent une migration de la base (v81).
        </p>
      ) : (
        <div className="space-y-3">
          <ListeActes
            titre="Consultations"
            vide="Aucune consultation enregistrée."
            lignes={consultations.map((c) => ({
              id: c.id, date: c.date_consultation, statut: c.statut,
              texte: c.motif || 'Consultation',
              href: c.statut === 'validee' ? `/gastro/consultation/cr/${c.id}` : `/gastro/consultation/${patientId}?id=${c.id}`,
              suivi: c.prochain_controle,
              onSuivi: () => programmerSuivi('consultation', c.id, c.prochain_controle, c.motif || 'Contrôle'),
            }))}
          />
          <ListeActes
            titre="Endoscopies"
            vide="Aucun compte rendu."
            lignes={endoscopies.map((e) => ({
              id: e.id, date: e.date_examen, statut: e.statut,
              texte: `${e.type_examen === 'coloscopie' ? 'Coloscopie' : 'Gastroscopie'}${e.conclusion ? ` — ${String(e.conclusion).split('\n')[0].slice(0, 60)}` : ''}`,
              href: e.statut === 'valide' ? `/gastro/cr/${e.id}` : `/gastro/endoscopie/${patientId}?id=${e.id}`,
              suivi: e.surveillance_le,
              onSuivi: () => programmerSuivi('endoscopie', e.id, e.surveillance_le, `Surveillance après ${e.type_examen}`),
              onResultat: () => attendreResultat(e.id, `Anatomopathologie — ${e.type_examen} du ${formatDateFr(e.date_examen)}`),
            }))}
          />
        </div>
      )}
    </div>
  )
}

interface LigneActe {
  id: string; date: string; statut: string; texte: string; href: string
  suivi?: string | null; onSuivi: () => void
  /** Présent sur les endoscopies seulement : une biopsie attend une anapath. */
  onResultat?: () => void
}

function ListeActes({ titre, vide, lignes }: { titre: string; vide: string; lignes: LigneActe[] }) {
  const router = useRouter()
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-400 mb-1">{titre}</p>
      {lignes.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">{vide}</p>
      ) : (
        <ul className="space-y-1">
          {lignes.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <button onClick={() => router.push(l.href)} className="flex-1 min-w-0 text-left text-sm text-primary-600 hover:underline truncate">
                <span className="text-gray-400 text-[11px] mr-1.5">{formatDateFr(l.date)}</span>{l.texte}
              </button>
              {(l.statut === 'brouillon') && (
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">brouillon</span>
              )}
              {l.suivi && (
                <button onClick={l.onSuivi} title={`Programmer le suivi du ${formatDateFr(l.suivi)}`}
                  className="text-gray-400 hover:text-primary-600 shrink-0"><BellRing className="h-3.5 w-3.5" /></button>
              )}
              {l.onResultat && (
                <button onClick={l.onResultat} title="Attendre un résultat d’anatomopathologie"
                  className="text-gray-400 hover:text-amber-600 shrink-0"><Microscope className="h-3.5 w-3.5" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
