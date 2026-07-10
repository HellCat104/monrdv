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
