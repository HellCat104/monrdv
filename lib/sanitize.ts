/**
 * Sanitise une chaîne de caractères :
 * - Supprime les balises HTML
 * - Supprime les caractères de contrôle
 * - Trim les espaces
 */
export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, '')           // supprime les balises HTML
    .replace(/[<>"'`]/g, '')           // supprime les caractères dangereux
    .replace(/[\x00-\x1F\x7F]/g, '')  // supprime les caractères de contrôle
    .trim()
    .slice(0, 1000)                    // limite la taille
}

export function sanitizeEmail(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.toLowerCase().trim().slice(0, 254)
}

export function sanitizeSlug(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 100)
}

export function sanitizePhone(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.replace(/[^0-9+\s()-]/g, '').trim().slice(0, 20)
}

/**
 * Valide un email
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Valide un slug (lettres, chiffres, tirets uniquement)
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]{2,100}$/.test(slug)
}
