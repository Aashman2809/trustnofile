/**
 * Sandbox adapter contract:
 *   getStatus() -> { status: 'unavailable' | 'available' }
 *   run({ fileRef, timeoutMs }) -> { status: 'completed'|'timeout'|'failed'|'unavailable', behavioralEvidence, logs[], artifacts[] }
 * Requirements for a real implementation are in docs/INTEGRATION.md (isolation, no privileged containers, no Docker
 * socket, restricted network, resource limits, controlled I/O directories, cleanup).
 */
export const SANDBOX_METHODS = ['getStatus', 'run'];
