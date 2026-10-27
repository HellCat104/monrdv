// Le stock — côté secrétariat.
//
// CE QUE CETTE ROUTE FAIT, ET SURTOUT CE QU'ELLE NE FAIT PAS
//
// C'est souvent la secrétaire qui tient l'étagère : elle range la livraison,
// elle voit la boîte se vider. Un stock que seul le praticien peut décompter
// est un stock faux au bout d'une semaine.
//
// Elle COMPTE, et c'est tout. Créer un article, fixer un seuil, saisir un prix
// d'achat ou archiver une référence sont des décisions de cabinet : elles
// restent au médecin. Ce n'est pas l'écran qui masque le reste — il n'existe
// pas ici, et `prix_achat` ne figure pas dans les colonnes renvoyées.
import { NextResponse } from 'next/server'
import { getStaffContext } from '@/lib/cabinet'
import { createAdminClient } from '@/lib/supabase/server'
import { tableStockAbsente } from '@/lib/stock-server'

export const dynamic = 'force-dynamic'

// Ni `prix_achat`, ni `fournisseur` : ce que le cabinet paie et à qui regarde
// le praticien. Le seuil, lui, est renvoyé — sans lui la secrétaire ne sait
// pas quand prévenir, ce qui est précisément ce qu'on attend d'elle.
const COLONNES =
  'id, nom, categorie, reference, unite, quantite, seuil_alerte, peremption, notes, actif, updated_at'

export async function GET() {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.stock) {
    return NextResponse.json({ error: 'Permission manquante (stock)' }, { status: 403 })
  }

  const { data, error } = await createAdminClient()
    .from('stock_articles').select(COLONNES)
    .eq('doctor_id', ctx.doctor.id).eq('actif', true)
    .order('categorie', { ascending: true, nullsFirst: false })
    .order('nom', { ascending: true })

  if (error) {
    if (tableStockAbsente(error)) return NextResponse.json({ articles: [], activee: false })
    console.error('[cabinet/stock] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ articles: data ?? [], activee: true })
}
