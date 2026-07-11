// Calendrier national de vaccination (Maroc) — schéma simplifié pour le suivi
// pédiatrique. `months` = âge recommandé en mois. `key` = identifiant stable.
export interface VaccineDose {
  key: string
  label: string
  months: number
}

export const VACCINE_SCHEDULE: VaccineDose[] = [
  { key: 'bcg',        label: 'BCG',                              months: 0 },
  { key: 'hb0',        label: 'Hépatite B (naissance)',           months: 0 },
  { key: 'vpo0',       label: 'VPO 0 (polio oral)',               months: 0 },
  { key: 'penta1',     label: 'Pentavalent 1 (DTC-Hib-HépB)',     months: 2 },
  { key: 'vpo1',       label: 'VPO 1',                            months: 2 },
  { key: 'vpc1',       label: 'Pneumo (VPC) 1',                   months: 2 },
  { key: 'rota1',      label: 'Rotavirus 1',                      months: 2 },
  { key: 'penta2',     label: 'Pentavalent 2',                    months: 3 },
  { key: 'vpo2',       label: 'VPO 2',                            months: 3 },
  { key: 'rota2',      label: 'Rotavirus 2',                      months: 3 },
  { key: 'penta3',     label: 'Pentavalent 3',                    months: 4 },
  { key: 'vpo3',       label: 'VPO 3',                            months: 4 },
  { key: 'vpc2',       label: 'Pneumo (VPC) 2',                   months: 4 },
  { key: 'rr1',        label: 'Rougeole-Rubéole (RR) 1',          months: 9 },
  { key: 'vpc3',       label: 'Pneumo (VPC) 3',                   months: 9 },
  { key: 'rr2',        label: 'Rougeole-Rubéole (RR) 2',          months: 12 },
  { key: 'dtc_r1',     label: 'DTC rappel 1',                     months: 18 },
  { key: 'vpo_r1',     label: 'VPO rappel 1',                     months: 18 },
  { key: 'dtc_r2',     label: 'DTC rappel 2',                     months: 60 },
  { key: 'vpo_r2',     label: 'VPO rappel 2',                     months: 60 },
]

// Date recommandée = naissance + âge du vaccin
export function recommendedDate(birthDate: string, months: number): Date {
  const d = new Date(birthDate + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d
}

export function ageLabel(months: number): string {
  if (months === 0) return 'Naissance'
  if (months < 24) return `${months} mois`
  return `${months / 12} ans`
}
