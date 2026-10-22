'use client'

// L'encaissement du poste d'accueil — un seul exemplaire, deux écrans.
//
// Il vivait dans l'agenda. Or la secrétaire travaille surtout depuis la salle
// d'attente : c'est là qu'elle voit le patient sortir, et donc là qu'elle
// encaisse. Le recopier aurait été la pire option — le jour où le calcul du
// reste dû ou le verrou sur les devis change, il ne changerait que d'un côté,
// et les deux écrans annonceraient au patient des montants différents.
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAYMENT_METHOD_LABELS } from '@/types'

export interface RdvAEncaisser {
  id: string
  amount_due?: number | null
  amount_paid?: number | null
  payment_method?: string | null
  consultation_type_id?: string | null
  patient?: { first_name?: string; last_name?: string } | null
}

export default function EncaisserDialog({
  rdv, tarifMotif, peutModifierPrix, onSave, onClose,
}: {
  /** null = fermé. */
  rdv: RdvAEncaisser | null
  /** Tarif du motif, utilisé si le rendez-vous n'a pas encore de total dû. */
  tarifMotif?: number | null
  peutModifierPrix: boolean
  onSave: (patch: { amount_paid: number; amount_due: number | null; payment_method: string }) => Promise<boolean>
  onClose: () => void
}) {
  const [due, setDue] = useState('')
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState('especes')
  const [erreur, setErreur] = useState('')

  // Pré-remplissage à chaque ouverture : le total dû du rendez-vous, à défaut
  // le tarif du motif ; et l'encaissé par défaut égal au dû, parce que neuf
  // fois sur dix le patient règle tout.
  useEffect(() => {
    if (!rdv) return
    const d = rdv.amount_due ?? tarifMotif ?? null
    setErreur('')
    setDue(d != null ? String(d) : '')
    setPaid(rdv.amount_paid != null ? String(rdv.amount_paid) : (d != null ? String(d) : ''))
    setMethod(rdv.payment_method ?? 'especes')
  }, [rdv, tarifMotif])

  async function enregistrer() {
    const p = parseFloat(paid.replace(',', '.'))
    if (isNaN(p) || p < 0) { setErreur('Montant encaissé invalide.'); return }
    const brut = due.trim()
    const d = brut === '' ? null : parseFloat(brut.replace(',', '.'))
    if (d !== null && (isNaN(d) || d < 0)) { setErreur('Total dû invalide.'); return }
    setErreur('')
    if (await onSave({ amount_paid: p, amount_due: d, payment_method: method })) onClose()
  }

  const nom = rdv?.patient ? `${rdv.patient.first_name ?? ''} ${rdv.patient.last_name ?? ''}`.trim() : ''

  return (
    <Dialog open={!!rdv} onOpenChange={(o) => { if (!o) { onClose(); setErreur('') } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Encaisser — {nom}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay_due">Total dû (DH)</Label>
              <Input id="pay_due" type="number" inputMode="decimal" min="0" step="any" value={due}
                onChange={(e) => { setDue(e.target.value); setErreur('') }} placeholder="0"
                disabled={!peutModifierPrix}
                className={!peutModifierPrix ? 'bg-gray-50 text-gray-500' : ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay_amount">Encaissé (DH)</Label>
              <Input id="pay_amount" type="number" inputMode="decimal" min="0" step="any" autoFocus value={paid}
                onChange={(e) => { setPaid(e.target.value); setErreur('') }} placeholder="0" />
            </div>
          </div>

          {/* Reste à payer + « Solder le reste » */}
          {(() => {
            const d = parseFloat(due.replace(',', '.'))
            const p = parseFloat(paid.replace(',', '.'))
            const reste = Math.round((d - p) * 100) / 100
            if (!isNaN(d) && !isNaN(p) && reste > 0) {
              return (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-orange-600 font-medium">Reste à payer : {reste} DH</p>
                  <button type="button" onClick={() => { setPaid(due); setErreur('') }}
                    className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 hover:bg-green-100 transition-colors">
                    Solder le reste
                  </button>
                </div>
              )
            }
            if (!isNaN(d) && !isNaN(p) && d > 0 && p >= d) return <p className="text-xs text-green-600 font-medium">Soldé ✓</p>
            return null
          })()}

          <div className="space-y-1.5">
            <Label>Mode de règlement</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {erreur && <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{erreur}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => { onClose(); setErreur('') }}>Annuler</Button>
          <Button type="button" onClick={enregistrer}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
