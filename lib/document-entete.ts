// En-tête des documents imprimables — le CONTENU, écrit une seule fois.
//
// ── POURQUOI CE FICHIER ─────────────────────────────────────────────────────
//
// Jusqu'ici, chaque document (ordonnance, certificat, facture de consultation,
// facture de versement, avoir, dossier imprimable, dossier PDF) recopiait son
// propre en-tête. Les copies avaient déjà divergé :
//   - l'ordonnance écrivait « Dr. » en dur, et le PDF du dossier aussi : un
//     psychologue ou un kinésithérapeute y devenait « Dr. », alors que ses
//     factures et ses certificats (displayName) l'écrivaient correctement ;
//   - le numéro d'Ordre (CNOM) ne figurait que sur l'ordonnance et le
//     certificat, pas sur les factures ni le dossier ;
//   - le PDF du dossier n'imprimait pas l'adresse ;
//   - INPE et ICE changeaient d'ordre d'un document à l'autre ;
//   - le logo du cabinet (v57) n'existait que sur l'ordonnance et le dossier.
// Chaque correction faite sur un écran restait à faire sur les six autres, et
// ne l'était pas. Ici, le texte de l'en-tête est calculé UNE fois ; le
// composant React (components/shared/EnTeteDocument.tsx) et le PDF
// (lib/dossier.ts) ne font plus que le mettre en page.
//
// ── CE QUI RESTE PROPRE À CHAQUE DOCUMENT ───────────────────────────────────
//
// La DISPOSITION, pas le contenu : l'ordonnance et le certificat centrent
// l'en-tête et posent leur titre en dessous ; les factures, l'avoir et le
// dossier le placent à gauche, avec à droite un cartouche (titre, numéro,
// date) qui leur appartient. Le devis reprend la disposition centrée — voir
// app/devis/[id]/page.tsx pour la raison.
//
// Aucune dépendance serveur : ce fichier est lu par des composants clients
// (l'éditeur d'ordonnance) comme par le générateur PDF.

import { displayName } from '@/lib/profession'

/**
 * Colonnes de `doctors` dont l'en-tête a besoin. Chaque page de document les
 * ajoute à sa propre requête (`select(\`id, plan, ${COLONNES_EN_TETE}\`)`)
 * plutôt que de les énumérer : ajouter un jour une mention à l'en-tête (un
 * fax, un second téléphone) se fera ici, et toutes les pages la liront.
 *
 * Le logo n'en fait PAS partie : il est lu à part par getCabinetLogoUrl
 * (lib/cabinet-logo-server.ts), pour qu'une migration v57 absente retire le
 * logo au lieu de faire tomber la page en 404.
 */
export const COLONNES_EN_TETE = 'name, specialty, address, city, phone, cnom_number, inpe, ice'

/** Les champs de la fiche praticien lus par l'en-tête. */
export interface PraticienEnTete {
  name: string
  specialty?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  cnom_number?: string | null
  inpe?: string | null
  ice?: string | null
}

/** Le texte de l'en-tête, prêt à afficher. Une valeur absente vaut null :
 *  la mise en page n'a jamais à décider si « Tél :  » vide doit s'imprimer. */
export interface LignesEnTete {
  /** « Dr. Nom » pour un médecin, « Nom » pour un psychologue ou un
   *  kinésithérapeute (lib/profession.ts). */
  nom: string
  specialite: string | null
  /** « adresse, ville ». */
  adresse: string | null
  /** « Tél : 05… ». */
  telephone: string | null
  /** « Ordre : … · INPE : … · ICE : … », dans cet ordre partout : les
   *  identifiants de la profession d'abord, l'identifiant fiscal ensuite. */
  mentions: string | null
}

/** Valeur saisie → texte affichable. Un champ rempli d'espaces dans les
 *  Paramètres ne doit pas imprimer « Tél :  » sur une ordonnance. */
function net(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export function lignesEnTete(p: PraticienEnTete): LignesEnTete {
  const specialite = net(p.specialty)
  const telephone = net(p.phone)
  const cnom = net(p.cnom_number)
  const inpe = net(p.inpe)
  const ice = net(p.ice)
  const adresse = [net(p.address), net(p.city)].filter(Boolean).join(', ')
  const mentions = [cnom && `Ordre : ${cnom}`, inpe && `INPE : ${inpe}`, ice && `ICE : ${ice}`]
    .filter(Boolean).join(' · ')
  return {
    // La spécialité principale décide du titre, comme partout ailleurs dans
    // l'application (fiche publique, e-mails, factures).
    nom: displayName(net(p.name) ?? '', specialite),
    specialite,
    adresse: adresse || null,
    telephone: telephone ? `Tél : ${telephone}` : null,
    mentions: mentions || null,
  }
}

/** Adresse et téléphone sur une seule ligne (« adresse, ville · Tél : … ») —
 *  la forme des en-têtes compacts : disposition centrée, PDF du dossier,
 *  exports comptables. */
export function ligneCoordonnees(l: LignesEnTete): string | null {
  return [l.adresse, l.telephone].filter(Boolean).join(' · ') || null
}

const echapper = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * Le même en-tête, en HTML brut, pour les documents qui ne sont pas des pages
 * React : les exports comptables des Statistiques (recettes, dépenses,
 * avoirs, impayés, journal), écrits dans une fenêtre d'impression. Ils
 * portaient « Cabinet MonRDV » à la place du praticien — un fiduciaire
 * recevait un état de recettes qui ne nommait ni le cabinet ni son ICE.
 *
 * Styles en ligne : ce fragment est inséré dans une page qui a sa propre
 * feuille de style. Tout le texte est échappé — nom, adresse et mentions sont
 * saisis par le médecin. Un logo qui ne se charge pas se retire lui-même
 * (onerror) plutôt que d'imprimer l'icône d'image cassée.
 */
export function enTeteHtml(l: LignesEnTete, logoUrl: string | null): string {
  const coordonnees = ligneCoordonnees(l)
  const identite =
    `<div><div style="font-size:16px;font-weight:700">${echapper(l.nom)}</div>` +
    (l.specialite ? `<div style="font-size:11px;color:#64748b">${echapper(l.specialite)}</div>` : '') +
    (coordonnees ? `<div style="font-size:10px;color:#64748b;margin-top:3px">${echapper(coordonnees)}</div>` : '') +
    (l.mentions ? `<div style="font-size:9px;color:#94a3b8;margin-top:1px">${echapper(l.mentions)}</div>` : '') +
    `</div>`
  const logo = logoUrl
    ? `<img src="${echapper(logoUrl)}" alt="" onerror="this.remove()" style="max-height:48px;max-width:110px;object-fit:contain;flex-shrink:0">`
    : ''
  return `<div style="display:flex;align-items:flex-start;gap:14px;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:14px">${logo}${identite}</div>`
}
