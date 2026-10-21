// Aides ordonnance : lignes récemment prescrites par le médecin (auto-apprentissage).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRecentPrescriptionLines(supabase: any, doctorId: string, exclude: string[]): Promise<string[]> {
  const { data } = await supabase
    .from('prescriptions')
    .select('content')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })
    .limit(30)

  const freq = new Map<string, number>()
  for (const p of data ?? []) {
    for (const raw of String(p.content ?? '').split('\n')) {
      const line = raw.trim().replace(/^[-•*]\s*/, '')
      if (line.length < 8 || line.length > 120) continue
      freq.set(line, (freq.get(line) ?? 0) + 1)
    }
  }
  const excl = new Set(exclude.map((e) => e.toLowerCase()))
  return Array.from(freq.entries())
    .filter(([line]) => !excl.has(line.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([line]) => line)
}

// Ordonnance dont on repart pour en écrire une nouvelle (« Renouveler »).
//
// Le geste le plus répété chez un généraliste : un patient chronique revient et
// repart avec les mêmes lignes. Jusqu'ici il fallait tout retaper, parce que les
// ordonnances récentes n'étaient qu'une liste à consulter.
//
// On RECOPIE le texte dans une ordonnance NEUVE — on ne modifie jamais
// l'ancienne : une ordonnance remise au patient est un document délivré, et le
// dossier doit garder la trace des deux délivrances.
//
// Le patient est vérifié en plus du médecin : l'identifiant vient de l'URL, et
// rien n'empêcherait sans cela de reprendre l'ordonnance d'un autre patient du
// même cabinet dans le dossier de celui-ci.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrdonnanceAReprendre(
  supabase: any,
  doctorId: string,
  patientId: string,
  prescriptionId?: string | null,
): Promise<{ content: string; created_at: string } | null> {
  if (!prescriptionId) return null
  const { data } = await supabase
    .from('prescriptions')
    .select('content, created_at')
    .eq('id', prescriptionId)
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()
  if (!data?.content) return null
  return { content: String(data.content), created_at: String(data.created_at) }
}
