'use client'

// Logo du cabinet (v57) — carte autonome de l'écran Paramètres.
//
// Autonome : elle charge et enregistre elle-même ses données par
// /api/doctors/logo, et ne dépend d'aucun état de la page qui l'accueille. Elle
// se monte donc d'une ligne, sans toucher au formulaire de Paramètres ni à son
// bouton « Enregistrer » : le logo s'enregistre à l'instant où il est choisi,
// comme la photo de profil.
//
// Ce qu'elle fait autrement que la photo de profil (`handlePhotoUpload`) :
//  - elle n'affiche un logo qu'une fois que le SERVEUR a confirmé l'avoir
//    enregistré — jamais un aperçu local qui disparaîtrait au rechargement ;
//  - chaque échec est dit au médecin, en clair, dans la carte ;
//  - le format est examiné par le serveur (le contrôle d'ici n'est qu'un
//    confort qui évite d'envoyer 5 Mo pour se les voir refuser).
//
// Forfait : le logo n'a d'usage que sur les ordonnances (Cabinet complet). Au
// forfait Agenda, la carte l'explique au lieu d'offrir un bouton qui serait
// refusé ; un médecin redescendu d'offre garde le moyen de retirer son logo.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageIcon, Upload, Trash2, Lock, Loader2, AlertTriangle, Check } from 'lucide-react'
import { LOGO_ACCEPT, LOGO_CONSIGNE, LOGO_MAX_BYTES } from '@/lib/cabinet-logo'

interface Etat {
  /** false tant que la migration v57 n'est pas passée. */
  disponible: boolean
  /** Forfait donnant accès aux ordonnances (lib/plan.ts). */
  peutTeleverser: boolean
  logoUrl: string | null
}

export function LogoCabinet({ className }: { className?: string }) {
  // Tous les hooks d'abord : aucun retour anticipé ne doit les précéder.
  const [etat, setEtat] = useState<Etat | null>(null)
  const [erreurChargement, setErreurChargement] = useState('')
  const [envoi, setEnvoi] = useState<'televersement' | 'suppression' | null>(null)
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')
  // Suppression à moitié réussie : le logo a quitté les ordonnances, le
  // fichier est resté en ligne. Le médecin l'a demandé effacé : on le lui
  // dit, et on lui laisse de quoi réessayer.
  const [avertissement, setAvertissement] = useState('')

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const res = await fetch('/api/doctors/logo', { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (annule) return
        if (!res.ok) {
          setErreurChargement(json.error || 'Impossible de charger votre logo.')
          return
        }
        setEtat({
          disponible: json.disponible === true,
          peutTeleverser: json.peutTeleverser === true,
          logoUrl: typeof json.logoUrl === 'string' ? json.logoUrl : null,
        })
      } catch {
        if (!annule) setErreurChargement('Impossible de charger votre logo : connexion interrompue.')
      }
    })()
    return () => { annule = true }
  }, [])

  async function televerser(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const fichier = input.files?.[0]
    // Vidé tout de suite : sans cela, choisir de nouveau le même fichier
    // (après l'avoir corrigé) ne déclencherait aucun événement.
    input.value = ''
    if (!fichier) return
    setErreur(''); setInfo(''); setAvertissement('')

    // Pré-contrôles de confort, sur ce que le navigateur annonce. Le serveur
    // refait tout sur le contenu réel du fichier.
    if (fichier.type === 'image/svg+xml' || /\.svg$/i.test(fichier.name)) {
      setErreur('Le format SVG n\'est pas accepté : un fichier SVG peut contenir du code. Exportez votre logo en PNG (fond transparent possible) ou en JPEG.')
      return
    }
    if (fichier.size > LOGO_MAX_BYTES) {
      setErreur(`Le logo pèse ${(fichier.size / 1024 / 1024).toFixed(1)} Mo : 1 Mo au maximum. Réduisez sa taille en pixels avant de l'envoyer.`)
      return
    }

    setEnvoi('televersement')
    try {
      const corps = new FormData()
      corps.append('logo', fichier)
      const res = await fetch('/api/doctors/logo', { method: 'POST', body: corps })
      const json = await res.json().catch(() => ({}))
      // Un 200 sans adresse n'est pas un succès : on ne montre que ce que le
      // serveur a confirmé avoir enregistré.
      if (!res.ok || typeof json.logoUrl !== 'string') {
        setErreur(json.error || 'Le logo n\'a pas pu être enregistré. Réessayez.')
        return
      }
      setEtat((prev) => (prev ? { ...prev, logoUrl: json.logoUrl } : prev))
      setInfo('Logo enregistré : il figure désormais en tête de vos ordonnances.')
    } catch {
      setErreur('Connexion interrompue : le logo n\'a pas été enregistré. Réessayez.')
    } finally {
      setEnvoi(null)
    }
  }

  async function retirer(demanderConfirmation: boolean) {
    if (demanderConfirmation && !confirm('Retirer le logo ? Vos ordonnances s\'imprimeront de nouveau sans logo.')) return
    setErreur(''); setInfo(''); setAvertissement('')
    setEnvoi('suppression')
    try {
      const res = await fetch('/api/doctors/logo', { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErreur(json.error || 'Le logo n\'a pas pu être retiré. Réessayez.')
        return
      }
      setEtat((prev) => (prev ? { ...prev, logoUrl: null } : prev))
      if (typeof json.avertissement === 'string' && json.avertissement) {
        setAvertissement(json.avertissement)
      } else {
        setInfo('Logo retiré : vos ordonnances s\'impriment sans logo.')
      }
    } catch {
      setErreur('Connexion interrompue : le logo n\'a peut-être pas été retiré. Rechargez la page pour vérifier.')
    } finally {
      setEnvoi(null)
    }
  }

  const occupe = envoi !== null
  const logoUrl = etat?.logoUrl ?? null

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary-500" />
          Logo du cabinet
          <span className="text-xs font-normal text-gray-400">facultatif</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {etat === null && !erreurChargement && (
          <p className="text-sm text-gray-400 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </p>
        )}

        {erreurChargement && (
          <p className="text-sm text-red-600 flex items-start gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {erreurChargement}
          </p>
        )}

        {etat && !etat.disponible && (
          <p className="text-sm text-gray-500">
            Le logo du cabinet n&apos;est pas encore activé sur votre compte. Il le sera très prochainement.
          </p>
        )}

        {etat && etat.disponible && (
          <>
            <p className="text-sm text-gray-500">
              Il figure en tête de vos ordonnances et de vos dossiers patients imprimés. Sans logo, vos
              documents restent tels qu&apos;aujourd&apos;hui.
            </p>

            {/* Forfait Agenda sans logo : on explique, on n'offre pas un bouton voué au refus. */}
            {!etat.peutTeleverser && !logoUrl && (
              <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 flex items-start gap-2">
                <Lock className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <span>
                  Les ordonnances font partie du forfait Cabinet complet : le logo y est réservé.{' '}
                  <Link href="/abonnement" className="text-primary-600 underline">Voir les forfaits</Link>
                </span>
              </p>
            )}

            {(etat.peutTeleverser || logoUrl) && (
              <div className="flex flex-wrap items-center gap-5">
                {/* Aperçu à la taille de l'ordonnance : 3,5 rem de haut au plus
                    (≈ 15 mm imprimés), 7 rem de large — la colonne que
                    l'en-tête lui réserve. */}
                <div className="w-36 h-20 shrink-0 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt="Logo du cabinet"
                      className="max-h-14 max-w-[7rem] w-auto h-auto object-contain"
                    />
                  ) : (
                    <span className="text-xs text-gray-400 text-center px-2">Aucun logo</span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {etat.peutTeleverser && (
                      <label>
                        <input
                          type="file"
                          accept={LOGO_ACCEPT}
                          className="hidden"
                          onChange={televerser}
                          disabled={occupe}
                        />
                        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium transition-colors
                          ${occupe ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-50 bg-white cursor-pointer'}`}>
                          {envoi === 'televersement'
                            ? <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
                            : <Upload className="h-4 w-4 text-gray-500" />}
                          {envoi === 'televersement' ? 'Envoi en cours…' : logoUrl ? 'Remplacer le logo' : 'Ajouter un logo'}
                        </span>
                      </label>
                    )}
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => retirer(true)}
                        disabled={occupe}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {envoi === 'suppression'
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                        Retirer
                      </button>
                    )}
                  </div>
                  {etat.peutTeleverser ? (
                    <p className="text-xs text-gray-400">{LOGO_CONSIGNE} · SVG non accepté</p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Votre forfait actuel n&apos;inclut plus les ordonnances : ce logo n&apos;est plus utilisé.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {erreur && (
          <p className="text-sm text-red-600 flex items-start gap-1.5" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {erreur}
          </p>
        )}
        {avertissement && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1.5" role="alert">
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {avertissement}
            </p>
            <button
              type="button"
              onClick={() => retirer(false)}
              disabled={occupe}
              className="text-amber-900 underline font-medium disabled:opacity-50"
            >
              Réessayer l&apos;effacement
            </button>
          </div>
        )}
        {info && (
          <p className="text-sm text-green-700 flex items-start gap-1.5" role="status">
            <Check className="h-4 w-4 shrink-0 mt-0.5" /> {info}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
