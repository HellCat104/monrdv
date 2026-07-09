// Génération du dossier patient (récapitulatif PDF ou HTML + fichiers réels).
// Partagé entre l'export d'un seul patient et l'export groupé (sélection).
import PDFDocument from 'pdfkit'
import { formatDateFr, formatDateShort, formatTime } from '@/lib/utils'
import { allVitalDefs, type VitalDef } from '@/types'
import { summarizeTeeth, DENTAL_STATES, DENTAL_COLOR, DENTAL_LABEL, FDI_UPPER, FDI_LOWER, type DentalTeeth } from '@/lib/dental'

const PAY: Record<string, string> = { especes: 'Espèces', carte: 'Carte', cheque: 'Chèque', virement: 'Virement' }
const ATT: Record<string, string> = { present: 'Présent', absent: 'Absent', late: 'En retard' }
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
export const dossierSlug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()

export interface DossierDoctor {
  name: string; specialty: string; address?: string | null; city?: string | null
  phone?: string | null; ice?: string | null; inpe?: string | null; custom_vitals?: VitalDef[] | null
}
export interface DossierResult {
  ok: boolean
  patientName?: string
  slug?: string
  html?: string
  pdf?: Buffer
  docFiles?: { name: string; buf: Buffer }[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
interface DossierData {
  patient: Row
  appointments: Row[]
  notes: Row[]
  prescriptions: Row[]
  vitals: Row[]
  documents: Row[]
  docFiles: { name: string; buf: Buffer }[]
  imgEmbeds: { name: string; dataUri: string }[]
  aptLabel: Map<string, string>
  totalPaid: number
  vitalDefs: VitalDef[]
  dentalSummary: { label: string; teeth: string[] }[]
  dentalTeeth: DentalTeeth
}

// Récupère toutes les données d'un dossier (partagé PDF + HTML). null si le patient
// n'appartient pas au médecin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchDossierData(supabase: any, doctor: DossierDoctor & { id: string }, patientId: string): Promise<DossierData | null> {
  const { data: patient } = await supabase
    .from('patients').select('*').eq('id', patientId).eq('doctor_id', doctor.id).single()
  if (!patient) return null

  const [aptRes, notesRes, presRes, vitalsRes, docsRes, dentalRes] = await Promise.all([
    supabase.from('appointments').select('*, consultation_type:consultation_types(name)').eq('patient_id', patient.id).order('date', { ascending: false }).order('time', { ascending: false }),
    supabase.from('consultation_notes').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    supabase.from('prescriptions').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    supabase.from('vital_signs').select('*').eq('patient_id', patient.id).order('measured_at', { ascending: false }),
    supabase.from('patient_documents').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    supabase.from('dental_charts').select('teeth').eq('patient_id', patient.id).maybeSingle(),
  ])
  const appointments = aptRes.data ?? []
  const notes = notesRes.data ?? []
  const prescriptions = presRes.data ?? []
  const vitals = vitalsRes.data ?? []
  const documents = docsRes.data ?? []
  const dentalTeeth = (dentalRes.data?.teeth ?? {}) as DentalTeeth
  const dentalSummary = summarizeTeeth(dentalTeeth)

  const docFiles: { name: string; buf: Buffer }[] = []
  const imgEmbeds: { name: string; dataUri: string }[] = []
  let i = 0
  for (const d of documents) {
    i++
    const { data: blob } = await supabase.storage.from('patient-documents').download(d.file_path)
    if (!blob) continue
    const buf = Buffer.from(await blob.arrayBuffer())
    const safe = `${String(i).padStart(2, '0')}-${(d.file_name || 'fichier').replace(/[^\w.\-]/g, '_')}`
    docFiles.push({ name: safe, buf })
    const isImg = (d.file_type?.startsWith('image/')) || /\.(jpe?g|png|gif|webp)$/i.test(d.file_name || '')
    if (isImg) imgEmbeds.push({ name: d.file_name, dataUri: `data:${d.file_type || 'image/jpeg'};base64,${buf.toString('base64')}` })
  }

  const aptLabel = new Map<string, string>()
  for (const a of appointments) aptLabel.set(a.id, `${formatDateShort(a.date)} ${formatTime(a.time)}`)
  const totalPaid = appointments.reduce((s: number, a: { amount_paid?: number | null }) => s + (a.amount_paid ?? 0), 0)
  const vitalDefs = allVitalDefs(doctor.custom_vitals ?? [])

  return { patient, appointments, notes, prescriptions, vitals, documents, docFiles, imgEmbeds, aptLabel, totalPaid, vitalDefs, dentalSummary, dentalTeeth }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu PDF (pdfkit, 100 % Node — aucun navigateur, aucun timeout serverless)
// ─────────────────────────────────────────────────────────────────────────────
const C = { ink: '#1f2937', muted: '#6b7280', faint: '#9ca3af', accent: '#0369a1', line: '#e5e7eb', red: '#dc2626', bar: '#0EA5E9' }
const M = 40 // marge
const PAGE_RIGHT = 555 // 595 (A4) - 40
const CONTENT_W = PAGE_RIGHT - M // 515
const BOTTOM = 792 // hauteur A4 en points

function renderDossierPDF(doctor: DossierDoctor, d: DossierData): Promise<Buffer> {
  const { patient, appointments, notes, prescriptions, vitals, documents, aptLabel, totalPaid, vitalDefs, dentalSummary, dentalTeeth } = d
  const vLabel = (k: string) => vitalDefs.find((v) => v.key === k)?.label || k
  const vUnit = (k: string) => vitalDefs.find((v) => v.key === k)?.unit || ''

  // bufferPages: true → indispensable pour repasser dessiner le pied sur chaque page
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true })
  const chunks: Buffer[] = []

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Assure assez de place, sinon nouvelle page
    const ensure = (h: number) => { if (doc.y + h > BOTTOM - 50) doc.addPage() }

    const section = (title: string) => {
      ensure(40)
      doc.moveDown(0.6)
      doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), M, doc.y)
      const ly = doc.y + 2
      doc.moveTo(M, ly).lineTo(PAGE_RIGHT, ly).lineWidth(0.5).strokeColor(C.line).stroke()
      doc.moveDown(0.6)
      doc.fillColor(C.ink).font('Helvetica').fontSize(10)
      doc.x = M
    }

    // Ligne « label : valeur » (label gras)
    const kv = (label: string, value: string, color = C.ink) => {
      const h = doc.heightOfString(`${label} ${value}`, { width: CONTENT_W })
      ensure(h)
      doc.fillColor(color).font('Helvetica-Bold').fontSize(10).text(`${label} `, M, doc.y, { continued: true })
      doc.font('Helvetica').fillColor(color).text(value)
      doc.x = M
    }

    // Bloc de texte libre (notes, ordonnances) avec sauts de ligne conservés
    const block = (meta: string, body: string, boxed = false) => {
      doc.font('Helvetica').fontSize(9).fillColor(C.faint)
      const metaH = doc.heightOfString(meta, { width: CONTENT_W })
      doc.font('Helvetica').fontSize(10).fillColor(C.ink)
      const bodyH = doc.heightOfString(body || '—', { width: CONTENT_W - (boxed ? 16 : 0) })
      ensure(metaH + bodyH + 18)
      const startY = doc.y
      if (boxed) {
        // encadré léger : on dessine d'abord le texte pour connaître la hauteur réelle
        doc.font('Helvetica').fontSize(9).fillColor(C.faint).text(meta, M + 8, startY + 6, { width: CONTENT_W - 16 })
        doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(body || '—', M + 8, doc.y + 1, { width: CONTENT_W - 16 })
        const endY = doc.y + 6
        doc.roundedRect(M, startY, CONTENT_W, endY - startY, 4).lineWidth(0.5).strokeColor(C.line).stroke()
        doc.y = endY
      } else {
        doc.font('Helvetica').fontSize(9).fillColor(C.faint).text(meta, M, startY, { width: CONTENT_W })
        doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(body || '—', M, doc.y, { width: CONTENT_W })
      }
      doc.x = M
      doc.moveDown(0.5)
    }

    // ── En-tête ──────────────────────────────────────────────────────────
    const top = doc.y
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(17).text(`Dr. ${doctor.name}`, M, top, { width: 340 })
    doc.fillColor(C.muted).font('Helvetica').fontSize(10).text(
      [doctor.specialty, doctor.city, doctor.phone].filter(Boolean).join(' · '), M, doc.y + 1, { width: 340 })
    if (doctor.inpe || doctor.ice) {
      doc.fillColor(C.faint).fontSize(8.5).text(
        [doctor.inpe ? `INPE : ${doctor.inpe}` : '', doctor.ice ? `ICE : ${doctor.ice}` : ''].filter(Boolean).join(' · '),
        M, doc.y + 1, { width: 340 })
    }
    // titre à droite
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(12).text('DOSSIER PATIENT', 360, top, { width: PAGE_RIGHT - 360, align: 'right' })
    doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(`Édité le ${formatDateFr(new Date())}`, 360, doc.y + 1, { width: PAGE_RIGHT - 360, align: 'right' })
    const barY = Math.max(doc.y, top + 46) + 6
    doc.moveTo(M, barY).lineTo(PAGE_RIGHT, barY).lineWidth(2).strokeColor(C.bar).stroke()
    doc.y = barY + 6
    doc.x = M

    // ── Patient ──────────────────────────────────────────────────────────
    section('Patient')
    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.ink)
      .text(`${patient.first_name} ${patient.last_name}${patient.age != null ? ` · ${patient.age} ans` : ''}`, M, doc.y, { width: CONTENT_W })
    doc.x = M; doc.moveDown(0.3)
    kv('Téléphone :', `${patient.phone ?? '—'}${patient.email ? ` · ${patient.email}` : ''}`)
    if (patient.allergies) kv('Allergies :', String(patient.allergies), C.red)
    if (patient.chronic_conditions) kv('Antécédents :', String(patient.chronic_conditions))
    if (patient.current_treatments) kv('Traitements :', String(patient.current_treatments))
    if (patient.notes) kv('Notes :', String(patient.notes))

    // ── Rendez-vous (tableau) ────────────────────────────────────────────
    section(`Rendez-vous (${appointments.length})`)
    if (appointments.length === 0) {
      doc.fillColor(C.muted).font('Helvetica').fontSize(10).text('Aucun.', M, doc.y); doc.x = M
    } else {
      const cols = [
        { x: M, w: 100, label: 'Date' },
        { x: M + 105, w: 215, label: 'Motif' },
        { x: M + 325, w: 75, label: 'Présence' },
        { x: M + 405, w: PAGE_RIGHT - (M + 405), label: 'Payé' },
      ]
      const drawRow = (cells: string[], bold: boolean) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 8.5 : 9.5)
        const heights = cells.map((t, i) => doc.heightOfString(t, { width: cols[i].w }))
        const rowH = Math.max(...heights) + 6
        ensure(rowH)
        const y = doc.y
        doc.fillColor(bold ? C.faint : C.ink)
        cells.forEach((t, i) => doc.text(t, cols[i].x, y + 3, { width: cols[i].w }))
        const ly = y + rowH
        doc.moveTo(M, ly).lineTo(PAGE_RIGHT, ly).lineWidth(0.5).strokeColor(C.line).stroke()
        doc.y = ly
        doc.x = M
      }
      drawRow(cols.map((c) => c.label), true)
      for (const a of appointments) {
        const paid = a.amount_paid != null
          ? `${a.amount_paid}${a.amount_due && a.amount_due > a.amount_paid ? `/${a.amount_due}` : ''} DH${a.payment_method ? ` (${PAY[a.payment_method] || a.payment_method})` : ''}`
          : '—'
        drawRow([
          `${formatDateShort(a.date)} ${formatTime(a.time)}`,
          a.consultation_type?.name || a.notes || '—',
          a.attendance ? (ATT[a.attendance] || a.attendance) : (a.status === 'cancelled' ? 'Annulé' : '—'),
          paid,
        ], false)
      }
    }

    // ── Notes de consultation ────────────────────────────────────────────
    section(`Notes de consultation (${notes.length})`)
    if (notes.length === 0) { doc.fillColor(C.muted).fontSize(10).text('Aucune.', M, doc.y); doc.x = M }
    else for (const n of notes) {
      const meta = `${formatDateFr(n.created_at)}${n.appointment_id && aptLabel.get(n.appointment_id) ? ` · RDV du ${aptLabel.get(n.appointment_id)}` : ''}${n.signed_at ? ' · signée' : ''}`
      block(meta, String(n.note ?? ''))
    }

    // ── Ordonnances ──────────────────────────────────────────────────────
    section(`Ordonnances (${prescriptions.length})`)
    if (prescriptions.length === 0) { doc.fillColor(C.muted).fontSize(10).text('Aucune.', M, doc.y); doc.x = M }
    else for (const p of prescriptions) {
      const meta = `${formatDateFr(p.created_at)}${p.appointment_id && aptLabel.get(p.appointment_id) ? ` · RDV du ${aptLabel.get(p.appointment_id)}` : ''}`
      block(meta, String(p.content ?? ''), true)
    }

    // ── Constantes ───────────────────────────────────────────────────────
    if (vitals.length > 0) {
      section(`Constantes (${vitals.length})`)
      for (const v of vitals) {
        const vals = Object.entries((v.values ?? {}) as Record<string, number>)
          .map(([k, val]) => `${vLabel(k)} : ${val} ${vUnit(k)}`.trim()).join('  ·  ')
        block(formatDateFr(v.measured_at), vals)
      }
    }

    // ── Schéma dentaire (dentistes) — odontogramme dessiné ───────────────
    if (dentalSummary.length > 0) {
      section('Schéma dentaire')
      const bw = 26, bh = 20, gap = 3, midGap = 10
      // Dessine une arcade (16 dents) : côté droit / ligne médiane / côté gauche
      const drawArch = (ids: number[]) => {
        ensure(bh + 6)
        const y = doc.y
        let x = M
        ids.forEach((n, i) => {
          if (i === 8) x += midGap
          const info = dentalTeeth[String(n)]
          const color = info ? DENTAL_COLOR[info.s] : null
          doc.roundedRect(x, y, bw, bh, 3)
          if (color) doc.fillAndStroke(color, color)
          else doc.lineWidth(0.5).strokeColor('#d1d5db').stroke()
          doc.fillColor(color ? '#ffffff' : '#6b7280').font('Helvetica').fontSize(8)
            .text(String(n), x, y + 6, { width: bw, align: 'center', lineBreak: false })
          x += bw + gap
        })
        doc.y = y + bh + 4
        doc.x = M
      }
      drawArch(FDI_UPPER)
      drawArch(FDI_LOWER)

      // Légende
      doc.moveDown(0.2)
      let lx = M, ly = doc.y
      doc.font('Helvetica').fontSize(8)
      for (const st of DENTAL_STATES) {
        const w = 10 + 3 + doc.widthOfString(st.label) + 12
        if (lx + w > PAGE_RIGHT) { lx = M; ly += 13 }
        doc.roundedRect(lx, ly + 1, 8, 8, 1).fill(st.color)
        doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(st.label, lx + 12, ly, { lineBreak: false })
        lx += w
      }
      doc.y = ly + 12
      doc.x = M

      // Notes éventuelles par dent
      const noted = Object.entries(dentalTeeth).filter(([, v]) => v?.n).sort((a, b) => Number(a[0]) - Number(b[0]))
      if (noted.length > 0) {
        doc.moveDown(0.2)
        for (const [n, v] of noted) kv(`Dent ${n} :`, `${DENTAL_LABEL[v.s] || v.s} — ${v.n}`)
      }
    }

    // ── Documents (référence) ────────────────────────────────────────────
    if (documents.length > 0) {
      section(`Documents (${documents.length})`)
      doc.fillColor(C.muted).font('Helvetica').fontSize(9.5)
        .text('Les fichiers d\'origine (scans, radios, analyses…) sont joints dans le dossier « documents » du .zip.', M, doc.y, { width: CONTENT_W })
      doc.x = M; doc.moveDown(0.3)
      for (const doc0 of documents) {
        doc.fillColor(C.ink).fontSize(10).text(`• ${doc0.file_name || 'fichier'}`, M + 6, doc.y, { width: CONTENT_W - 6 })
      }
      doc.x = M
    }

    // ── Total ────────────────────────────────────────────────────────────
    ensure(40)
    doc.moveDown(0.8)
    const ty = doc.y
    doc.moveTo(M, ty).lineTo(PAGE_RIGHT, ty).lineWidth(1.5).strokeColor(C.ink).stroke()
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text('Total encaissé', M, ty + 6, { width: 300 })
    doc.text(`${totalPaid} DH`, 300, ty + 6, { width: PAGE_RIGHT - 300, align: 'right' })
    doc.x = M

    // ── Pied de page sur toutes les pages ────────────────────────────────
    const range = doc.bufferedPageRange?.() ?? { start: 0, count: 0 }
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc.font('Helvetica').fontSize(8).fillColor(C.faint)
        .text(`Dossier généré le ${formatDateFr(new Date())} via MonRDV`, M, BOTTOM - 30, { width: CONTENT_W, align: 'center', lineBreak: false })
    }

    doc.end()
  })
}

// Dossier complet en PDF (+ fichiers d'origine renvoyés à part par l'appelant).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildPatientDossierPDF(supabase: any, doctor: DossierDoctor & { id: string }, patientId: string): Promise<DossierResult> {
  const d = await fetchDossierData(supabase, doctor, patientId)
  if (!d) return { ok: false }
  const pdf = await renderDossierPDF(doctor, d)
  return {
    ok: true,
    patientName: `${d.patient.first_name} ${d.patient.last_name}`,
    slug: dossierSlug(`${d.patient.first_name}-${d.patient.last_name}`),
    pdf,
    docFiles: d.docFiles,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu HTML (conservé — permet de revenir à l'ancienne version si besoin)
// ─────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildPatientDossier(supabase: any, doctor: DossierDoctor & { id: string }, patientId: string): Promise<DossierResult> {
  const d = await fetchDossierData(supabase, doctor, patientId)
  if (!d) return { ok: false }
  const { patient, appointments, notes, prescriptions, vitals, documents, imgEmbeds, aptLabel, totalPaid, vitalDefs, dentalSummary } = d
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
${appointments.map((a: Row) => `<tr><td>${esc(formatDateShort(a.date))} ${esc(formatTime(a.time))}</td><td>${esc(a.consultation_type?.name || a.notes || '—')}</td><td>${a.attendance ? ATT[a.attendance] : (a.status === 'cancelled' ? 'Annulé' : '—')}</td><td>${a.amount_paid != null ? esc(a.amount_paid) + (a.amount_due && a.amount_due > a.amount_paid ? '/' + esc(a.amount_due) : '') + ' DH' + (a.payment_method ? ' (' + (PAY[a.payment_method] || a.payment_method) + ')' : '') : '—'}</td></tr>`).join('')}</table>`}

<h2>Notes de consultation (${notes.length})</h2>
${notes.length === 0 ? '<p class="muted">Aucune.</p>' : notes.map((n: Row) => `<div class="block"><span class="tag">${esc(formatDateFr(n.created_at))}${n.appointment_id && aptLabel.get(n.appointment_id) ? ' · RDV du ' + esc(aptLabel.get(n.appointment_id)) : ''}${n.signed_at ? ' · signée' : ''}</span><br>${esc(n.note).replace(/\n/g, '<br>')}</div>`).join('')}

<h2>Ordonnances (${prescriptions.length})</h2>
${prescriptions.length === 0 ? '<p class="muted">Aucune.</p>' : prescriptions.map((p: Row) => `<div class="block" style="border:1px solid #e5e7eb;border-radius:6px;padding:8px"><span class="tag">${esc(formatDateFr(p.created_at))}${p.appointment_id && aptLabel.get(p.appointment_id) ? ' · RDV du ' + esc(aptLabel.get(p.appointment_id)) : ''}</span><br>${esc(p.content).replace(/\n/g, '<br>')}</div>`).join('')}

${vitals.length > 0 ? `<h2>Constantes (${vitals.length})</h2>${vitals.map((v: Row) => `<div class="block"><span class="tag">${esc(formatDateFr(v.measured_at))}</span> — ${Object.entries(v.values as Record<string, number>).map(([k, val]) => `${esc(vLabel(k))} : ${esc(val)} ${esc(vUnit(k))}`).join(' · ')}</div>`).join('')}` : ''}

${dentalSummary.length > 0 ? `<h2>Schéma dentaire</h2><div class="block">${dentalSummary.map((g) => `<strong>${esc(g.label)} :</strong> dents ${esc(g.teeth.join(', '))}`).join('<br>')}</div>` : ''}

${documents.length > 0 ? `<h2>Documents (${documents.length})</h2><p class="muted">Les fichiers d'origine sont dans le dossier « documents ».</p>${imgEmbeds.map((im) => `<div><span class="tag">${esc(im.name)}</span><br><img src="${im.dataUri}" alt="${esc(im.name)}"></div>`).join('')}` : ''}

<div class="total"><span>Total encaissé</span><span>${esc(totalPaid)} DH</span></div>
<p class="muted" style="text-align:center;margin-top:24px">Dossier généré le ${esc(formatDateFr(new Date()))} via MonRDV</p>
</body></html>`

  return { ok: true, patientName: `${patient.first_name} ${patient.last_name}`, slug: dossierSlug(`${patient.first_name}-${patient.last_name}`), html, docFiles: d.docFiles }
}
