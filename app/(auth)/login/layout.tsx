import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Connexion médecin — MonRDV',
  description: 'Connectez-vous à votre tableau de bord MonRDV pour gérer vos rendez-vous médicaux au Maroc.',
  robots: { index: false, follow: false },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
