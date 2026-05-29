import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Inscription médecin — MonRDV',
  description:
    'Inscrivez-vous gratuitement sur MonRDV et commencez à recevoir des rendez-vous en ligne. Plateforme de gestion de rendez-vous médicaux au Maroc.',
  keywords: ['inscription médecin Maroc', 'logiciel rendez-vous médecin', 'agenda médical en ligne Maroc'],
  robots: { index: true, follow: true },
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_APP_URL || 'https://monrdv.ma'}/inscription`,
  },
}

export default function InscriptionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
