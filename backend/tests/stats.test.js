import test from 'node:test';
import assert from 'node:assert';
const { computeStats } = await import('../src/services/stats.service.js');

// Handles rec operation.
const rec = (id, fileId, status, level, t) => ({ id, fileId, status, startedAt: t, assessment: level ? { riskLevel: level } : null });
test('stats: empty input gives zeros, not fabricated data',/* Runs the test case: stats: empty input gives zeros, not fabricated data. */ () => {
  const s = computeStats([]);
  assert.equal(s.totalAnalyses, 0); assert.equal(s.filesAnalyzed, 0); assert.equal(s.recent.length, 0);
  assert.ok(Object.values(s.byRisk).every(/* Checks whether the item meets the condition. */ (v) => v === 0));
});
test('stats: counts risk only for finished analyses, distinct files, newest-first recent',/* Runs the test case: stats: counts risk only for finished analyses, distinct files, newest-first recent. */ () => {
  const s = computeStats([
    rec('1', 'f1', 'COMPLETED', 'low', '2026-01-01T00:00:00Z'), rec('2', 'f1', 'COMPLETED', 'high', '2026-01-02T00:00:00Z'),
    rec('3', 'f2', 'PARTIAL', 'moderate', '2026-01-03T00:00:00Z'), rec('4', 'f3', 'FAILED', null, '2026-01-04T00:00:00Z'),
    rec('5', 'f4', 'STATIC_ANALYSIS', null, '2026-01-05T00:00:00Z'),
  ], 3);
  assert.equal(s.totalAnalyses, 5); assert.equal(s.filesAnalyzed, 2);
  assert.deepEqual(s.byRisk, { low: 1, moderate: 1, high: 1, very_high: 0, insufficient_evidence: 0 });
  assert.equal(s.byStatus.FAILED, 1); assert.deepEqual(s.recent.map(/* Transforms each item in the collection. */ (r) => r.id), ['5', '4', '3']);
});
