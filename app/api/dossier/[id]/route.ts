// Téléchargement du dossier patient COMPLET en .zip :
// un récapitulatif HTML (lisible hors ligne) + tous les fichiers réels
// (radios, analyses, ordonnances scannées). Réservé au médecin propriétaire.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { formatDateFr, formatDateShort, formatTime } from '@/lib/utils'
import { allVitalDefs, type VitalDef } from '@/types'
import JSZip from 'jszip'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const PAY: Record<string, string> = { especes: 'Espèces', carte: 'Carte', cheque: 'Chèque', virement: 'Virement' }
const ATT: Record<string, string> = { present: 'Présent', absent: 'Absent', late: 'En retard' }
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: doctor } = await supabase
    .from('doctors').select('id, name, specialty, address, city, phone, ice, inpe, custom_vitals')
    .eq('email', user.email).single()
  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  const { data: patient } = await supabase
    .from('patients').select('*').eq('id', params.id).eq('doctor_id', doctor.id).single()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const [aptRes, notesRes, presRes, vitalsRes, docsRes] = await Promise.all([
    supabase.from('appointments').select('*, consultation_type:consultation_types(name)').eq('patient_id', patient.id).order('date', { ascending: false }).order('time', { ascending: false }),
    supabase.from('consultation_notes').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    supabase.from('prescriptions').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    supabase.from('vital_signs').select('*').eq('patient_id', patient.id).order('measured_at', { ascending: false }),
    supabase.from('patient_documents').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
  ])
  const appointments = aptRes.data ?? []
  const notes = notesRes.data ?? []
  const prescriptions = presRes.data ?? []
  const vitals = vitalsRes.data ?? []
  const documents = docsRes.data ?? []

  const zip = new JSZip()
  const docsFolder = zip.folder('documents')

  // Télécharge les fichiers réels + prépare les aperçus images pour le HTML
  const imgEmbeds: { name: string; dataUri: string }[] = []
  let i = 0
  for (const d of documents) {
    i++
    const { data: blob } = await supabase.storage.from('patient-documents').download(d.file_path)
    if (!blob) continue
    const buf = Buffer.from(await blob.arrayBuffer())
    const safe = `${String(i).padStart(2, '0')}-${d.file_name.replace(/[^\w.\-]/g, '_')}`
    docsFolder?.file(safe, buf)
    const isImg = (d.file_type?.startsWith('image/')) || /\.(jpe?g|png|gif|webp)$/i.test(d.file_name || '')
    if (isImg) imgEmbeds.push({ name: d.file_name, dataUri: `data:${d.file_type || 'image/jpeg'};base64,${buf.toString('base64')}` })
  }

  const aptLabel = new Map<string, string>()
  for (const a of appointments) aptLabel.set(a.id, `${formatDateShort(a.date)} ${formatTime(a.time)}`)
  const totalPaid = appointments.reduce((s, a) => s + (a.amount_paid ?? 0), 0)
  const vitalDefs = allVitalDefs((doctor.custom_vitals as VitalDef[] | null) ?? [])
  const vLabel = (k: string) => vitalDefs.find((v) => v.key === k)?.label || k
  const vUnit = (k: string) => vitalDefs.find((v) => v.key === k)?.unit || ''

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Dossier — ${esc(patient.first_name)} ${esc(patient.last_name)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:800px;margin:24px auto;padding:0 20px;line-height:1.5}
h1{font-size:20px;margin:0}h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#0369a1;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin:28px 0 10px}
.head{display:flex;justify-content:space-between;border-bottom:2px solid #0EA5E9;padding-bottom:12px}
.muted{color:#6b7280;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee}th{color:#9ca3af;font-weight:600}
.block{font-size:13px;margin:8px 0}.tag{font-size:11px;color:#6b7280}
img{max-width:100%;border:1px solid #e5e7eb;border-radius:6px;margin:6px 0}
.total{display:flex;justify-content:space-between;border-top:2px solid #111;padding-top:8px;margin-top:24px;font-weight:bold}</style></head><body>
<div class="head"><div><h1>Dr. ${esc(doctor.name)}</h1><div class="muted">${esc(doctor.specialty)}${doctor.city ? ' · ' + esc(doctor.city) : ''}${doctor.phone ? ' · ' + esc(doctor.phone) : ''}</div>${(doctor.ice || doctor.inpe) ? `<div class="tag">${doctor.inpe ? 'INPE : ' + esc(doctor.inpe) : ''}${doctor.ice && doctor.inpe ? ' · ' : ''}${doctor.ice ? 'ICE : ' + esc(doctor.ice) : ''}</div>` : ''}</div>
<div style="text-align:right"><strong>DOSSIER PATIENT</strong><div class="muted">Édité le ${esc(formatDateFr(new Date()))}</div></div></div>

<h2>Patient</h2>
<div class="block"><strong>${esc(patient.first_name)} ${esc(patient.last_name)}</strong>${patient.age != null ? ' · ' + esc(patient.age) + ' ans' : ''}<br>Téléphone : ${esc(patient.phone)}${patient.email ? ' · ' + esc(patient.email) : ''}
${patient.allergies ? `<br><span style="color:#dc2626"><strong>Allergies :</strong> ${esc(patient.allergies)}</span>` : ''}
${patient.chronic_conditions ? `<br><strong>Antécédents :</strong> ${esc(patient.chronic_conditions)}` : ''}
${patient.current_treatments ? `<br><strong>Traitements :</strong> ${esc(patient.current_treatments)}` : ''}
${patient.notes ? `<br><strong>Notes :</strong> ${esc(patient.notes)}` : ''}</div>

<h2>Rendez-vous (${appointments.length})</h2>
${appointments.length === 0 ? '<p class="muted">Aucun.</p>' : `<table><tr><th>Date</th><th>Motif</th><th>Présence</th><th>Payé</th></tr>
${appointments.map((a) => `<tr><td>${esc(formatDateShort(a.date))} ${esc(formatTime(a.time))}</td><td>${esc(a.consultation_type?.name || a.notes || '—')}</td><td>${a.attendance ? ATT[a.attendance] : (a.status === 'cancelled' ? 'Annulé' : '—')}</td><td>${a.amount_paid != null ? esc(a.amount_paid) + (a.amount_due && a.amount_due > a.amount_paid ? '/' + esc(a.amount_due) : '') + ' DH' + (a.payment_method ? ' (' + (PAY[a.payment_method] || a.payment_method) + ')' : '') : '—'}</td></tr>`).join('')}</table>`}

<h2>Notes de consultation (${notes.length})</h2>
${notes.length === 0 ? '<p class="muted">Aucune.</p>' : notes.map((n) => `<div class="block"><span class="tag">${esc(formatDateFr(n.created_at))}${n.appointment_id && aptLabel.get(n.appointment_id) ? ' · RDV du ' + esc(aptLabel.get(n.appointment_id)) : ''}${n.signed_at ? ' · signée' : ''}</span><br>${esc(n.note).replace(/\n/g, '<br>')}</div>`).join('')}

<h2>Ordonnances (${prescriptions.length})</h2>
${prescriptions.length === 0 ? '<p class="muted">Aucune.</p>' : prescriptions.map((p) => `<div class="block" style="border:1px solid #e5e7eb;border-radius:6px;padding:8px"><span class="tag">${esc(formatDateFr(p.created_at))}${p.appointment_id && aptLabel.get(p.appointment_id) ? ' · RDV du ' + esc(aptLabel.get(p.appointment_id)) : ''}</span><br>${esc(p.content).replace(/\n/g, '<br>')}</div>`).join('')}

${vitals.length > 0 ? `<h2>Constantes (${vitals.length})</h2>${vitals.map((v) => `<div class="block"><span class="tag">${esc(formatDateFr(v.measured_at))}</span> — ${Object.entries(v.values as Record<string, number>).map(([k, val]) => `${esc(vLabel(k))} : ${esc(val)} ${esc(vUnit(k))}`).join(' · ')}</div>`).join('')}` : ''}

${documents.length > 0 ? `<h2>Documents (${documents.length})</h2><p class="muted">Les fichiers d'origine sont dans le dossier « documents » du .zip.</p>${imgEmbeds.map((im) => `<div><span class="tag">${esc(im.name)}</span><br><img src="${im.dataUri}" alt="${esc(im.name)}"></div>`).join('')}` : ''}

<div class="total"><span>Total encaissé</span><span>${esc(totalPaid)} DH</span></div>
<p class="muted" style="text-align:center;margin-top:24px">Dossier généré le ${esc(formatDateFr(new Date()))} via MonRDV</p>
</body></html>`

  zip.file('dossier.html', html)

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const filename = `dossier-${slug(patient.first_name + '-' + patient.last_name)}.zip`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
