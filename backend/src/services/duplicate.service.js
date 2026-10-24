// Finds an earlier finished analysis of byte-identical content (same SHA-256). Informational only.
export function createDuplicateService({ fileRepo, analysisRepo }) {
  return {
    async findPrior(file) {
      for (const other of (await fileRepo.findBySha256(file.sha256)).filter((f) => f.id !== file.id)) {
        const a = await analysisRepo.findLatestByFileId(other.id);
        if (a && ['COMPLETED', 'PARTIAL'].includes(a.status) && a.assessment) {
          return { analysisId: a.id, analyzedAt: a.finishedAt, riskLevel: a.assessment.riskLevel, riskScore: a.assessment.riskScore, fileName: a.file.originalName };
        }
      }
      return null;
    },
  };
}
