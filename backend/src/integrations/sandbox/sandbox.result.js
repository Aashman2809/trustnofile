const EVENT_TYPES = new Set(['process_created', 'network_attempt', 'file_written', 'persistence_attempt', 'execution_error']);
const STATUSES = new Set(['completed', 'timeout', 'failed', 'unavailable']);

export function boundedSandboxResult(value) {
  if (!value || typeof value !== 'object' || !STATUSES.has(value.status)) throw new Error('Invalid sandbox worker result');
  const source = value.behavioralEvidence;
  const behavioralEvidence = source && typeof source === 'object' ? {
    events: (Array.isArray(source.events) ? source.events : []).slice(0, 100).flatMap((event) => EVENT_TYPES.has(event?.type)
      ? [{ type: event.type, detail: String(event.detail || '').slice(0, 300) }] : []),
    exitCode: Number.isInteger(source.exitCode) ? source.exitCode : null,
    ...(source.outputMalformed === true ? { outputMalformed: true } : {}),
    ...(typeof source.stdout === 'string' ? { stdout: source.stdout.slice(0, 2000) } : {}),
    ...(typeof source.stderr === 'string' ? { stderr: source.stderr.slice(0, 2000) } : {}),
  } : null;
  return { status: value.status, message: typeof value.message === 'string' ? value.message.slice(0, 300) : null,
    behavioralEvidence, logs: [], artifacts: [] };
}
