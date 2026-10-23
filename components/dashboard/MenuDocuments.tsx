'use client'

// « Documents » — un seul bouton pour tout ce que le médecin remet au patient.
//
// BRANCHE GÉNÉRALISTE uniquement. Le dentiste et le pédiatre gardent leurs
// deux boutons actuels : leurs documents ne sont pas les mêmes, et cette
// liste n'a pas été pensée pour eux.
//
// La fiche portait « Nouvelle ordonnance » et « Nouveau certificat » côte à
// côte. Deux boutons pour deux documents, et rien pour les trois autres —
// alors qu'un généraliste écrit tout autant de courriers à ses confrères et
// de demandes d'analyses, qu'il allait chercher dans la liste des certificats
// sans savoir qu'ils s'y trouvaient.
//
// Un geste (« je dois donner quelque chose »), puis le choix de la chose.
import { useState } from 'react'
import { FilePlus, Pill, FileText, Mail, Syringe, FlaskConical, ChevronDown } from 'lucide-react'

export default function MenuDocuments({ patientId, backHref }: {
  patientId: string
  backHref: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const retour = encodeURIComponent(backHref)

  const entrees = [
    { label: 'Ordonnance',        aide: 'Médicaments à délivrer',        icone: Pill,          href: `/ordonnance/patient/${patientId}?back=${retour}` },
    { label: 'Certificat',        aide: 'Repos, sport, scolaire, permis', icone: FileText,     href: `/certificat/nouveau/${patientId}?famille=certificat&back=${retour}` },
    { label: 'Courrier',          aide: 'Demande d’avis, résumé médical', icone: Mail,         href: `/certificat/nouveau/${patientId}?famille=courrier&back=${retour}` },
    { label: 'Vaccin',            aide: 'Enregistrer et remettre le certificat', icone: Syringe, href: `/vaccin/${patientId}?back=${retour}` },
    { label: 'Demande d’examen',  aide: 'Analyses, imagerie',            icone: FlaskConical, href: `/certificat/nouveau/${patientId}?famille=examen&back=${retour}` },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOuvert((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg px-3 py-2"
      >
        <FilePlus className="h-4 w-4" /> Documents
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>

      {ouvert && (
        <>
          {/* Clic à l'extérieur = fermer */}
          <div className="fixed inset-0 z-40" onClick={() => setOuvert(false)} />
          {/* Ancré à GAUCHE du bouton, qui est lui-même au bord gauche de la
              carte : un menu ancré à droite partirait hors de l'écran. */}
          <div className="absolute left-0 top-11 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
            {entrees.map(({ label, aide, icone: Icone, href }) => (
              <a
                key={label}
                href={href}
                onClick={() => setOuvert(false)}
                className="flex items-start gap-3 px-3 py-2.5 hover:bg-primary-50/60 transition-colors"
              >
                <Icone className="h-4 w-4 text-primary-500 mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-800">{label}</span>
                  {/* Une ligne d'aide par entrée : « Courrier » ne dit pas à
                      quoi il sert, « Demande d'avis, résumé médical » si. */}
                  <span className="block text-xs text-gray-500">{aide}</span>
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
