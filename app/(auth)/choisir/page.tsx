'use client'

import Link from 'next/link'
import { Stethoscope, User } from 'lucide-react'

export default function ChoisirPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-12 h-12 bg-primary-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Stethoscope className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">MonRDV</span>
          </Link>
          <p className="text-gray-500 text-sm mt-3">Qui êtes-vous ?</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Carte Patient */}
          <Link
            href="/patient/login"
            className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl border-2 border-transparent hover:border-primary-300 transition-all text-center flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center group-hover:bg-primary-200 transition-colors">
              <User className="h-8 w-8 text-primary-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg">Patient</p>
              <p className="text-sm text-gray-500 mt-1 leading-snug">Voir mes rendez-vous et en prendre de nouveaux</p>
            </div>
            <span className="w-full bg-primary-500 group-hover:bg-primary-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
              Connexion patient
            </span>
          </Link>

          {/* Carte Médecin */}
          <Link
            href="/login"
            className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl border-2 border-transparent hover:border-teal-300 transition-all text-center flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center group-hover:bg-teal-200 transition-colors">
              <Stethoscope className="h-8 w-8 text-teal-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg">Médecin</p>
              <p className="text-sm text-gray-500 mt-1 leading-snug">Accéder à mon tableau de bord et agenda</p>
            </div>
            <span className="w-full bg-teal-500 group-hover:bg-teal-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
              Connexion médecin
            </span>
          </Link>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Pas encore de compte ?{' '}
          <Link href="/inscription" className="text-primary-600 hover:underline font-medium">
            Inscrivez-vous (médecins uniquement)
          </Link>
        </p>
      </div>
    </div>
  )
}
