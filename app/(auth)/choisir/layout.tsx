import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Se connecter — MonRDV',
  description: 'Accédez à votre espace patient ou médecin sur MonRDV.',
  robots: { index: false, follow: false },
}

export default function ChoisirLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
