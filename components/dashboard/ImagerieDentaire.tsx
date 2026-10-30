'use client'

// L'IMAGERIE DENTAIRE — rattachée à la dent, datée, comparable.
//
// ── LE GESTE QU'ON VIENT CHERCHER ICI ───────────────────────────────────────
//
// Pas « ouvrir une radio » : on la voit déjà dans le logiciel du capteur. Ce
// qu'on vient chercher, c'est LA COMPARAISON — « la lésion de la 46 a-t-elle
// bougé depuis mars ? ». Deux clichés de la même dent, côte à côte, à deux
// dates. C'est l'acte clinique, et aucun dossier de fichiers ne le permet.
//
// ── CE QUE CE N'EST PAS ─────────────────────────────────────────────────────
//
// Aucune capture : un navigateur ne parle pas à un capteur intra-oral. On
// reçoit l'image déjà produite, pour qu'elle cesse de vivre dans un dossier
// Windows que personne ne retrouve trois ans plus tard.
//
// Et aucune compression. Les photos du cabinet sont réduites à 1600 px avant
// l'envoi ; une image de diagnostic, jamais — perdre de la définition sur une
// rétro-alvéolaire, c'est perdre la lésion qu'on cherchait.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateShort } from '@/lib/utils'
import { messageQuota } from '@/lib/stockage'
import { FDI_UPPER, FDI_LOWER, FDI_UPPER_LAIT, FDI_LOWER_LAIT } from '@/lib/dental'
import {
  TYPES_IMAGE, typeImage, libelleType, imagesDeLaDent, comparableSurLaDent,
  jourImage, poidsLisible, estImagerie, type ImageDentaire,
} from '@/lib/imagerie'
import { Images, Upload, X, Columns2 } from 'lucide-react'

const BUCKET = 'patient-documents'
const TOUTES = '__toutes__'

export default function ImagerieDentaire({
  patientId, doctorId, onImages,
}: {
  patientId: string
  doctorId: string
  /** Remonte les images au parent, qui s'en sert pour marquer l'odontogramme.
   *  Un seul chargement sert les deux écrans : deux requêtes finiraient par
   *  afficher deux vérités. */
  onImages?: (images: ImageDentaire[]) => void
}) {
  const supabase = createClient()
  const [images, setImages] = useState<ImageDentaire[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [indisponible, setIndisponible] = useState(false)
  const [dentFiltre, setDentFiltre] = useState<string>(TOUTES)
  const [compare, setCompare] = useState<string[]>([])
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  // Saisie du dépôt
  const [type, setType] = useState('retro')
  const [dents, setDents] = useState<string[]>([])
  const [dateExamen, setDateExamen] = useState('')

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('patient_documents')
      .select('id, file_path, file_name, file_type, file_size, created_at, dents, type_image, date_examen')
      .eq('patient_id', patientId)
      .not('type_image', 'is', null)
      .order('created_at', { ascending: false })
    // Pas de migration, pas de fonctionnalité — mais jamais d'écran cassé.
    if (error) { setIndisponible(true); return }
    const liste = (data ?? []) as ImageDentaire[]
    setImages(liste)
    onImages?.(liste)

    // Les vignettes : une seule demande pour toutes, plutôt qu'une par image.
    const chemins = liste.map((i) => i.file_path)
    if (chemins.length > 0) {
      const { data: signees } = await supabase.storage.from(BUCKET).createSignedUrls(chemins, 3600)
      const m: Record<string, string> = {}
      for (const s of signees ?? []) if (s.path && s.signedUrl) m[s.path] = s.signedUrl
      setUrls(m)
    }
  }, [supabase, patientId, onImages])
  useEffect(() => { charger() }, [charger])

  const visibles = useMemo(
    () => (dentFiltre === TOUTES ? images.filter(estImagerie) : imagesDeLaDent(images, dentFiltre)),
    [images, dentFiltre],
  )

  // Les dents qui ont au moins un cliché : on ne propose pas de filtrer sur
  // une dent vierge, ce serait promettre une liste qui s'affichera vide.
  const dentsPourvues = useMemo(() => {
    const s = new Set<string>()
    for (const i of images) for (const n of i.dents ?? []) s.add(n)
    return Array.from(s).sort()
  }, [images])

  async function deposer(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErreur('')
    const t = typeImage(type)
    if (t?.cible && dents.length === 0) {
      setErreur(`Une ${t.label.toLowerCase()} vise des dents précises : indiquez au moins laquelle.`)
      e.target.value = ''; return
    }
    if (file.size > 10 * 1024 * 1024) { setErreur('L’image ne doit pas dépasser 10 Mo.'); e.target.value = ''; return }
    if (!/^image\//.test(file.type) && file.type !== 'application/pdf') {
      setErreur('Déposez une image ou un PDF.'); e.target.value = ''; return
    }

    setEnvoi(true)
    try {
      const nom = file.name.replace(/[^\w.\-]/g, '_').substring(0, 120)
      const chemin = `${doctorId}/${patientId}/${Date.now()}-${nom}`
      // L'ORIGINAL, tel quel. Voir l'en-tête : on ne redimensionne pas une
      // image de diagnostic.
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(chemin, file, { contentType: file.type || undefined })
      if (upErr) throw upErr

      const { data, error: insErr } = await supabase.from('patient_documents').insert({
        doctor_id: doctorId, patient_id: patientId,
        file_path: chemin, file_name: file.name.substring(0, 200),
        file_type: file.type || null, file_size: file.size,
        type_image: type, dents: t?.cible ? dents : [],
        date_examen: dateExamen || null,
      }).select('id, file_path, file_name, file_type, file_size, created_at, dents, type_image, date_examen').single()

      // L'enregistrement peut échouer APRÈS l'envoi : quota du cabinet atteint,
      // coupure réseau. Sans ce nettoyage, le fichier resterait dans le dépôt
      // sans ligne pour le désigner — invisible, mais décompté du quota.
      if (insErr) { await supabase.storage.from(BUCKET).remove([chemin]); throw insErr }

      setDents([]); setDateExamen('')
      await charger()
    } catch (err) {
      setErreur(messageQuota(err) ?? 'L’image n’a pas pu être envoyée.')
    } finally { setEnvoi(false); e.target.value = '' }
  }

  function basculerCompare(id: string) {
    setCompare((c) => c.includes(id) ? c.filter((x) => x !== id)
      // Jamais plus de deux : une comparaison, c'est un avant et un après.
      : c.length >= 2 ? [c[1], id] : [...c, id])
  }

  if (indisponible) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-sm text-gray-500">L’imagerie attend une migration de la base (v94).</p>
      </div>
    )
  }

  const t = typeImage(type)
  const paires = compare.map((id) => images.find((i) => i.id === id)).filter(Boolean) as ImageDentaire[]

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <Images className="h-4 w-4" /> Imagerie
          {images.length > 0 && <span className="text-[11px] font-normal text-gray-400">{images.length} cliché{images.length > 1 ? 's' : ''}</span>}
        </h3>
        {dentsPourvues.length > 0 && (
          <select value={dentFiltre} onChange={(e) => { setDentFiltre(e.target.value); setCompare([]) }}
            className="text-xs rounded-lg border border-gray-200 px-2 py-1.5">
            <option value={TOUTES}>Toutes les dents</option>
            {dentsPourvues.map((n) => <option key={n} value={n}>Dent {n}</option>)}
          </select>
        )}
      </div>

      {/* ── Le dépôt ─────────────────────────────────────────────────────── */}
      <div className="border border-dashed border-gray-200 rounded-lg p-2.5 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {TYPES_IMAGE.map((x) => (
            <button key={x.cle} type="button" onClick={() => { setType(x.cle); if (!x.cible) setDents([]) }}
              title={x.aide}
              className={`text-[11px] font-medium rounded-lg px-2 py-1 border transition ${
                type === x.cle ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {x.label}
            </button>
          ))}
        </div>

        {t?.cible ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value="" onChange={(e) => { if (e.target.value && !dents.includes(e.target.value)) setDents((p) => [...p, e.target.value]) }}
              className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 w-24 bg-white">
              <option value="">+ Dent</option>
              <optgroup label="Haut">{[...FDI_UPPER, ...FDI_UPPER_LAIT].map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
              <optgroup label="Bas">{[...FDI_LOWER, ...FDI_LOWER_LAIT].map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
            </select>
            {dents.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 text-[11px] bg-gray-100 rounded-full px-2 py-0.5">
                {n}
                <button type="button" onClick={() => setDents((p) => p.filter((x) => x !== n))} className="text-gray-400 hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">
            Une {t?.label.toLowerCase()} couvre les deux arcades : elle remontera pour n’importe quelle dent.
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] text-gray-500">
            Date de l’examen
            <input type="date" value={dateExamen} onChange={(e) => setDateExamen(e.target.value)}
              className="ml-1.5 text-xs rounded-lg border border-gray-200 px-2 py-1" />
          </label>
          <label className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 cursor-pointer ${
            envoi ? 'bg-gray-200 text-gray-500' : 'bg-primary-500 text-white hover:bg-primary-600'}`}>
            <Upload className="h-3.5 w-3.5" />
            {envoi ? 'Envoi…' : 'Déposer l’image'}
            <input type="file" accept="image/*,application/pdf" onChange={deposer} disabled={envoi} className="hidden" />
          </label>
        </div>
        <p className="text-[10px] text-gray-400">
          L’image est conservée telle quelle, sans compression : une radio redimensionnée perd
          ce qu’on y cherche. La date de l’examen n’est pas celle de l’import.
        </p>
      </div>

      {erreur && <p className="text-xs text-red-600">{erreur}</p>}

      {/* ── La comparaison ───────────────────────────────────────────────── */}
      {paires.length === 2 && (
        <div className="border border-primary-200 rounded-lg p-2.5 bg-primary-50/40">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-primary-700 flex items-center gap-1.5">
              <Columns2 className="h-3.5 w-3.5" /> Comparaison
            </p>
            <button type="button" onClick={() => setCompare([])} className="text-[11px] text-gray-400 hover:text-gray-600">Fermer</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {paires
              // Du plus ancien au plus récent : on lit une évolution dans le
              // sens du temps, pas dans celui des clics.
              .slice().sort((a, b) => jourImage(a).jour.localeCompare(jourImage(b).jour))
              .map((i) => (
                <figure key={i.id} className="space-y-1">
                  {urls[i.file_path] ? (
                    <img src={urls[i.file_path]} alt={i.file_name}
                      className="w-full rounded border border-gray-200 bg-black object-contain max-h-72" />
                  ) : <div className="h-40 bg-gray-100 rounded animate-pulse" />}
                  <figcaption className="text-[11px] text-gray-600">
                    {jourImage(i).estime && <span className="text-gray-400">importé le </span>}
                    {formatDateShort(jourImage(i).jour)} · {libelleType(i.type_image)}
                  </figcaption>
                </figure>
              ))}
          </div>
        </div>
      )}

      {/* ── Les clichés ──────────────────────────────────────────────────── */}
      {visibles.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">
          {images.length === 0
            ? 'Aucune image. Déposez une radio : elle rejoindra la dent dont elle parle, avec sa date.'
            : 'Aucune image pour cette dent.'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {visibles.map((i) => {
              const j = jourImage(i)
              const choisi = compare.includes(i.id)
              return (
                <button key={i.id} type="button" onClick={() => basculerCompare(i.id)}
                  title={`${i.file_name} · ${poidsLisible(i.file_size)}`}
                  className={`text-left rounded-lg border overflow-hidden transition ${
                    choisi ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200 hover:border-gray-300'}`}>
                  {urls[i.file_path] ? (
                    <img src={urls[i.file_path]} alt={i.file_name} className="w-full h-24 object-cover bg-black" />
                  ) : <div className="w-full h-24 bg-gray-100 animate-pulse" />}
                  <div className="px-1.5 py-1">
                    <p className="text-[10px] font-medium text-gray-700 truncate">
                      {libelleType(i.type_image)}
                      {(i.dents ?? []).length > 0 && <span className="text-gray-400"> · {(i.dents ?? []).join(', ')}</span>}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {j.estime && 'importé le '}{formatDateShort(j.jour)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          <p className="text-[11px] text-gray-400">
            {dentFiltre !== TOUTES && comparableSurLaDent(images, dentFiltre)
              ? 'Choisissez deux clichés pour les comparer côte à côte.'
              : dentFiltre !== TOUTES
                ? 'Un seul jour de prise de vue sur cette dent : il n’y a rien à comparer pour l’instant.'
                : 'Filtrez sur une dent pour comparer son évolution dans le temps.'}
          </p>
        </>
      )}
    </div>
  )
}
