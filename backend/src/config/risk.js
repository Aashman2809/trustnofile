

// Parses num operation.
const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);
let thresholds = { moderate: num(process.env.RISK_MODERATE, 25), high: num(process.env.RISK_HIGH, 50), veryHigh: num(process.env.RISK_VERY_HIGH, 75) };
if (!(thresholds.moderate < thresholds.high && thresholds.high < thresholds.veryHigh)) thresholds = { moderate: 25, high: 50, veryHigh: 75 };
export const riskConfig = {
  thresholds,
  severityWeights: { info: 0, low: 4, medium: 12, high: 30 },
  codeWeights: { HASH_MISMATCH: 40, YARA_MATCH: 35, ARCHIVE_PATH_TRAVERSAL: 30, STR_POWERSHELL_ENCODED: 15, STR_DOWNLOAD_AND_EXECUTE: 15 },
  correlation: { minFindings: 3, minModules: 2, bonus: 10 },
  minCoreModules: 4,
};
