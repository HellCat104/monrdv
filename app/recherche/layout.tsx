import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Rechercher un médecin au Maroc — MonRDV',
  description:
    'Recherchez un médecin par spécialité ou ville au Maroc. Trouvez un généraliste, cardiologue, dermatologue et prenez rendez-vous en ligne.',
  robots: {
    // Les pages de résultats de recherche sont dupliquées → noindex pour éviter le contenu dupliqué
    index: false,
    follow: true,
  },
}

export default function RechercheLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
