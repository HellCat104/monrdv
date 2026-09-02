import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Espace patient',
  description: 'Connectez-vous à votre espace patient MonRDV pour consulter et gérer vos rendez-vous médicaux.',
  robots: { index: false, follow: false },
}

export default function PatientLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
