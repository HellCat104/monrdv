'use client'

// La feuille imprimable des documents de la branche gastro : compte rendu
// d'endoscopie, compte rendu de consultation, fiche de préparation.
//
// Elle reprend la mise en page des documents existants — même en-tête
// (components/shared/EnTeteDocument), même feuille A4, mêmes classes
// d'impression. Trois documents du même cabinet qui ne se ressemblent pas,
// c'est un cabinet qui a l'air d'en être trois.
//
// Elle n'affiche QUE les blocs qu'on lui donne. L'appelant ne lui transmet
// que les rubriques réellement remplies : un bloc vide n'arrive jamais ici, et
// cette feuille n'invente donc jamais une constatation.
import { Button } from '@/components/ui/button'
import { Printer, ArrowLeft } from 'lucide-react'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'
import { formatDateFr } from '@/lib/utils'
import type { LignesEnTete } from '@/lib/document-entete'

export interface BlocDocument {
  titre: string
  texte: string
}

export default function DocumentGastro({
  lignes, logoUrl, titre, ville, date, patient, blocs, backHref, brouillon,
}: {
  lignes: LignesEnTete
  logoUrl: string | null
  titre: string
  ville?: string | null
  date: string
  /** Identité du patient, telle qu'elle doit apparaître sur le document. */
  patient: string
  blocs: BlocDocument[]
  backHref: string
  /** Un brouillon s'imprime quand même — le praticien relit sur papier — mais
   *  il le dit en toutes lettres : un compte rendu non validé circulant sans
   *  mention serait pris pour un document définitif. */
  brouillon?: boolean
}) {
  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between gap-2 print:hidden">
        <a href={backHref} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Retour
        </a>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Imprimer / PDF
        </Button>
      </div>

      <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg px-12 py-10 print:shadow-none print:rounded-none print:px-0 print:py-0">
        <EnTeteDocument lignes={lignes} logoUrl={logoUrl} disposition="centree" />

        <div className="text-center mb-6">
          <h2 className="inline-block text-sm font-bold uppercase tracking-[0.18em] text-gray-900 border-b-2 border-gray-800 pb-1">
            {titre}
          </h2>
          {brouillon && (
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-amber-700">
              Brouillon — document non validé
            </p>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-4 mb-8 text-[13px] text-gray-700">
          <p><span className="text-gray-500">Patient :</span> <b>{patient}</b></p>
          <p className="text-gray-600">{ville ? `${ville}, le ` : 'Le '}{formatDateFr(date)}</p>
        </div>

        <div className="space-y-5 text-[13px] text-gray-900 leading-relaxed min-h-[12rem]">
          {blocs.length === 0 ? (
            <p className="text-gray-400 italic">Ce document ne contient encore aucune rubrique remplie.</p>
          ) : blocs.map((b) => (
            <section key={b.titre}>
              <h3 className="font-semibold text-gray-900 mb-0.5">{b.titre}</h3>
              <p className="whitespace-pre-wrap">{b.texte}</p>
            </section>
          ))}
        </div>

        <div className="mt-16 flex justify-end">
          <div className="text-center">
            <p className="text-[12px] text-gray-700 mb-1">Signature et cachet</p>
            <div className="h-20 w-56 border-b border-gray-300" />
          </div>
        </div>
      </div>
    </div>
  )
}
