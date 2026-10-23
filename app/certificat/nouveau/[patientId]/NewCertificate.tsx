'use client'

// Rédaction d'un certificat médical : modèle + motif + texte éditable,
// enregistrement (archive) et impression. Revient à backHref.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { CERT_TEMPLATES, type FamilleDocument } from '@/lib/certificats'
import { ArrowLeft, FileText, Printer } from 'lucide-react'

interface Patient { id: string; first_name: string; last_name: string; age?: number | null; cin?: string | null; parent1_name?: string | null; parent2_name?: string | null }


/** Le libellé d'un consentement dans la liste : on retire « Consentement
 *  éclairé — », déjà porté par le titre du groupe, et on remet la majuscule.
 *  Sans elle, la liste mélangeait « Certificat d'aptitude au sport » et
 *  « extraction dentaire » — on lisait un reste de phrase, pas un choix. */
function sansPrefixe(titre: string): string {
  const reste = titre.replace('Consentement éclairé — ', '')
  return reste.charAt(0).toUpperCase() + reste.slice(1)
}

export default function NewCertificate({ doctorId, doctorName, patient, appointmentId, backHref, famille, resume }: {
  doctorId: string; doctorName: string; patient: Patient; appointmentId: string | null; backHref: string
  /** Le dossier du patient déjà mis en forme, que les courriers insèrent sous
   *  le motif. Vide quand on ne sait rien de lui, ou hors courrier : les
   *  modèles retombent alors sur leur trame à remplir. */
  resume?: string
  /** Ne montrer que les modèles de cette famille. Sans elle, tous — c'est le
   *  comportement des écrans qui n'ont pas encore de regroupement. */
  famille?: FamilleDocument
}) {
  const supabase = createClient()
  const router = useRouter()

  const build = (typeKey: string, extra: string, extras: string[] = []) => {
    const tpl = CERT_TEMPLATES.find((t) => t.key === typeKey)
    if (!tpl) return ''
    return tpl.build(
      { first_name: patient.first_name, last_name: patient.last_name, age: patient.age, cin: patient.cin, parent1_name: patient.parent1_name, parent2_name: patient.parent2_name },
      { name: doctorName },
      extra,
      extras,
      resume,
    )
  }

  // Les modèles de la famille demandée, et le premier d'entre eux comme choix
  // de départ. Sans ça, le médecin qui clique « Courrier » arrivait sur un
  // certificat de repos qu'il devait d'abord remplacer.
  const modeles = famille ? CERT_TEMPLATES.filter((t) => t.famille === famille) : CERT_TEMPLATES
  const premier = modeles[0]?.key ?? 'repos'

  const [type, setType] = useState(premier)
  const [motif, setMotif] = useState('')
  const [extra, setExtra] = useState('')
  // Valeurs des champs multiples, dans l'ordre de tpl.extraFields
  const [extras, setExtras] = useState<string[]>([])
  const [content, setContent] = useState(() => build(premier, ''))
  const [saving, setSaving] = useState(false)

  const tpl = CERT_TEMPLATES.find((t) => t.key === type)

  function changeType(v: string) {
    const t = CERT_TEMPLATES.find((x) => x.key === v)
    // Une liste déroulante part sur sa première valeur : le document est ainsi
    // déjà cohérent avant la moindre saisie.
    const init = (t?.extraFields ?? []).map((f) =>
      f.type === 'select' ? (f.options?.[0] ?? '') : '')
    setType(v); setExtra(''); setExtras(init); setContent(build(v, '', init))
  }
  function changeExtra(v: string) {
    setExtra(v); setContent(build(type, v, extras))
  }
  function changeExtraAt(i: number, v: string) {
    const suivant = [...extras]
    suivant[i] = v
    setExtras(suivant); setContent(build(type, extra, suivant))
  }

  async function save(print: boolean) {
    if (!content.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('certificates')
      .insert({
        doctor_id: doctorId,
        patient_id: patient.id,
        appointment_id: appointmentId,
        type,
        title: tpl?.title ?? 'Certificat',
        motif: motif.trim() || null,
        content,
      })
      .select('id').single()
    setSaving(false)
    if (error || !data) { alert('Échec de l\'enregistrement du certificat'); return }
    if (print) window.open(`/certificat/${data.id}`, '_blank')
    router.push(backHref)
    router.refresh()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(backHref)} className="text-gray-400 hover:text-gray-600" title="Retour"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary-500" /> {tpl?.consentement ? 'Nouveau consentement' : 'Nouveau certificat'} — {patient.first_name} {patient.last_name}
        </h1>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
        <div className="space-y-1.5">
          <Label>Type de document</Label>
          <Select value={type} onValueChange={changeType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* Une famille demandée (le médecin a choisi « Courrier »,
                  « Demande d'examen »…) : on ne montre QUE ses modèles. Sans
                  elle, les deux groupes d'avant — c'est le comportement des
                  écrans qui n'ont pas encore de regroupement. */}
              {famille ? (
                modeles.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{sansPrefixe(t.title)}</SelectItem>
                ))
              ) : (
                <>
                  {/* Un certificat atteste quelque chose à un tiers, un
                      consentement est signé PAR le patient. Les confondre au
                      moment de choisir, c'est imprimer le mauvais document. */}
                  <SelectGroup>
                    <SelectLabel>Certificats</SelectLabel>
                    {CERT_TEMPLATES.filter((t) => !t.consentement).map((t) => (
                      <SelectItem key={t.key} value={t.key}>{t.title}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Consentements éclairés</SelectLabel>
                    {CERT_TEMPLATES.filter((t) => t.consentement).map((t) => (
                      <SelectItem key={t.key} value={t.key}>{sansPrefixe(t.title)}</SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>
          {tpl?.consentement && (
            <p className="text-xs text-gray-500">
              Relisez le texte avec le patient avant de l&apos;imprimer, et complétez-le pour son cas :
              un consentement signé sans avoir été lu ne protège personne.
            </p>
          )}
        </div>

        {tpl?.extraField && (
          <div className="space-y-1.5">
            <Label htmlFor="cert_extra">{tpl.extraField.label}</Label>
            <Input
              id="cert_extra"
              type={tpl.extraField.type === 'number' ? 'number' : 'text'}
              value={extra}
              onChange={(e) => changeExtra(e.target.value)}
              placeholder={tpl.extraField.placeholder}
            />
          </div>
        )}

        {tpl?.extraFields?.map((f, i) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`cert_${f.key}`}>{f.label}</Label>
            {f.type === 'select' ? (
              <Select value={extras[i] ?? ''} onValueChange={(v) => changeExtraAt(i, v)}>
                <SelectTrigger id={`cert_${f.key}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {f.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`cert_${f.key}`}
                type={f.type === 'number' ? 'number' : 'text'}
                value={extras[i] ?? ''}
                onChange={(e) => changeExtraAt(i, e.target.value)}
                placeholder={f.placeholder}
              />
            )}
          </div>
        ))}

        <div className="space-y-1.5">
          <Label htmlFor="cert_motif">Motif (visible dans le dossier)</Label>
          <Input id="cert_motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex : grippe, visite annuelle…" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cert_content">Texte du certificat (modifiable)</Label>
          <textarea
            id="cert_content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <p className="text-[11px] text-gray-400">Le texte est figé à l&apos;enregistrement (valeur d&apos;archive) et le certificat apparaîtra dans le dossier du patient.</p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => router.push(backHref)}>Annuler</Button>
          <Button type="button" variant="outline" onClick={() => save(false)} disabled={saving || !content.trim()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button type="button" onClick={() => save(true)} disabled={saving || !content.trim()}>
            <Printer className="h-4 w-4 mr-1.5" /> Enregistrer et imprimer
          </Button>
        </div>
      </div>
    </div>
  )
}
