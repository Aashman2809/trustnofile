const RISKS = ['low', 'moderate', 'high', 'very_high', 'insufficient_evidence'];

// Pure function: all dashboard numbers are derived from real analysis records.
export function computeStats(analyses, recentLimit = 5) {
  const byStatus = {}, byRisk = Object.fromEntries(RISKS.map((r) => [r, 0]));
  const analyzedFiles = new Set();
  for (const a of analyses) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    if (['COMPLETED', 'PARTIAL'].includes(a.status)) {
      analyzedFiles.add(a.fileId);
      const level = a.assessment?.riskLevel;
      if (level in byRisk) byRisk[level] += 1;
    }
  }
  const recent = [...analyses].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, recentLimit);
  return { totalAnalyses: analyses.length, filesAnalyzed: analyzedFiles.size, byRisk, byStatus, recent };
}
