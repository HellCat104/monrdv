// Sans borne de suspense, une navigation vers le tableau de bord n'affiche
// RIEN tant que le rendu serveur complet n'est pas revenu — l'utilisateur
// croit que rien ne se passe. Ce squelette borne aussi les préchargements de
// la barre latérale, qui rendaient sinon la page entière côté serveur.
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 bg-gray-200 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  )
}
