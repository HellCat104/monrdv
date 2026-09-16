'use client'

// Écran du médecin dont le compte n'est pas encore approuvé.
//
// Le layout du tableau de bord se contentait de `redirect('/login')`. Or un
// compte médecin est créé avec `email_confirm: true` mais `status: 'pending'` :
// le praticien PEUT donc se connecter pour de bon, et arrive ici. Cette
// redirection, partant d'un layout vers une route située hors du segment
// (dashboard) — lequel possède le seul `loading.tsx` du site —, laissait le
// squelette de chargement à l'écran sans que rien ne vienne le remplacer.
// C'est le « ça charge à l'infini » décrit par les médecins à qui l'on vient
// de créer un compte.
//
// On n'envoie donc plus nulle part : on AFFICHE, à la place du tableau de bord,
// ce qui se passe réellement. Le compte est bon, il attend une validation.
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Clock, XCircle, LogOut } from 'lucide-react'

export default function CompteEnAttente({
  statut,
  motif,
}: {
  statut: string
  motif?: string | null
}) {
  const router = useRouter()
  const refuse = statut === 'rejected'

  async function deconnexion() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-sm border">
        {refuse ? (
          <XCircle className="h-14 w-14 text-red-400 mx-auto mb-4" />
        ) : (
          <Clock className="h-14 w-14 text-amber-400 mx-auto mb-4" />
        )}

        <h1 className="text-xl font-bold text-gray-900">
          {refuse ? 'Votre inscription a été refusée' : 'Votre compte est en cours de vérification'}
        </h1>

        {refuse ? (
          <p className="text-gray-500 text-sm mt-2 mb-5">
            {motif ? `Motif : ${motif}` : 'Contactez-nous pour en connaître la raison.'}
          </p>
        ) : (
          <>
            <p className="text-gray-600 text-sm mt-2">
              Votre connexion a bien fonctionné. Nous vérifions actuellement vos
              informations professionnelles — une formalité qui prend en général
              moins de 24 h.
            </p>
            <p className="text-gray-500 text-sm mt-2 mb-5">
              Vous recevrez un e-mail dès que votre espace sera ouvert. Inutile de
              réessayer d&apos;ici là : rien n&apos;est bloqué de votre côté.
            </p>
          </>
        )}

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={deconnexion}
            className="inline-flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Se déconnecter
          </button>
          <a
            href="mailto:contact@monrdv.co.ma"
            className="inline-flex items-center justify-center bg-primary-500 hover:bg-primary-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            Nous contacter
          </a>
        </div>
      </div>
    </div>
  )
}
