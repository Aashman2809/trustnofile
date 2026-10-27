const RISKS = ['low', 'moderate', 'high', 'very_high', 'insufficient_evidence'];

// Calculates file and analysis statistics.
export function computeStats(analyses, recentLimit = 5) {
  const byStatus = {}, byRisk = Object.fromEntries(RISKS.map(/* Transforms each item in the collection. */ (r) => [r, 0]));
  const analyzedFiles = new Set();
  for (const a of analyses) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    if (['COMPLETED', 'PARTIAL'].includes(a.status)) {
      analyzedFiles.add(a.fileId);
      const level = a.assessment?.riskLevel;
      if (level in byRisk) byRisk[level] += 1;
    }
  }
  const recent = [...analyses].sort(/* Compares two items for sorting. */ (a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, recentLimit);
  return { totalAnalyses: analyses.length, filesAnalyzed: analyzedFiles.size, byRisk, byStatus, recent };
}
