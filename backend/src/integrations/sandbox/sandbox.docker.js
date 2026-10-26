import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { identifyFile } from '../../analysis/file-identification.js';

const exec = promisify(execFile);
const image = process.env.SANDBOX_IMAGE || '';
const docker = process.env.SANDBOX_DOCKER_PATH || 'docker';
const bounded = (n, min, max, fallback) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;

export function createDockerSandbox({ fetchExec = exec, image: configuredImage = image, dockerPath = docker } = {}) {
  const safeImage = /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$/.test(configuredImage);
  const cleanupNamed = async (name, timeout = 3000) => {
    try { await fetchExec(dockerPath, ['rm', '-f', name], { timeout, windowsHide: true, maxBuffer: 64 * 1024 }); } catch { /* already gone */ }
  };
  return {
    async getStatus() {
      if (!safeImage) return { status: 'unavailable', reason: 'sandbox image is not configured' };
      try {
        await fetchExec(dockerPath, ['image', 'inspect', '--format', '{{.Id}}', configuredImage], { timeout: 3000, windowsHide: true, maxBuffer: 4096 });
        await fetchExec(dockerPath, ['info', '--format', '{{.ServerVersion}}'], { timeout: 3000, windowsHide: true, maxBuffer: 4096 });
        return { status: 'available', engine: 'docker', executionScope: 'isolated_linux_elf' };
      } catch { return { status: 'unavailable', reason: 'sandbox engine or configured image is unavailable' }; }
    },
    async run({ fileRef, timeoutMs = 30000 }) {
      if (!safeImage || typeof fileRef !== 'string') return { status: 'unavailable', message: 'Sandbox engine or image is unavailable; no file was executed.', behavioralEvidence: null, logs: [], artifacts: [] };
      const detected = await identifyFile(fileRef);
      if (detected.format !== 'elf') return { status: 'unavailable', message: 'Configured runner executes Linux ELF files only; no execution was attempted.', behavioralEvidence: null, logs: [], artifacts: [] };
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trustnofile-sandbox-'));
      const inputDir = path.join(root, 'input');
      const name = `trustnofile-${randomUUID()}`;
      let timedOut = false;
      try {
        await fs.chmod(root, 0o755);
        await fs.mkdir(inputDir, { mode: 0o700 });
        await fs.chmod(inputDir, 0o755);
        await fs.copyFile(fileRef, path.join(inputDir, 'payload.bin'));
        await fs.chmod(path.join(inputDir, 'payload.bin'), 0o555);
        const duration = bounded(timeoutMs, 1000, 60000, 30000);
        const args = ['run', '--rm', '--name', name, '--network=none', '--read-only', '--memory=256m', '--memory-swap=256m', '--cpus=0.5', '--pids-limit=32', '--ulimit=nofile=64:64', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=65534:65534', '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=64m',
          '--mount', `type=bind,src=${inputDir},dst=/input,readonly`, configuredImage];
        let stdout = '', stderr = '';
        try {
          const r = await fetchExec(docker, args, { timeout: duration + 5000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
          stdout = String(r.stdout || ''); stderr = String(r.stderr || '');
        } catch (err) {
          timedOut = err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
          stdout = String(err.stdout || ''); stderr = String(err.stderr || '');
          if (!timedOut) return { status: 'failed', message: 'The isolated sandbox runner failed.', behavioralEvidence: null, logs: [stderr.slice(0, 2000)], artifacts: [] };
        } finally { await cleanupNamed(name); }
        const result = parseRunnerResult(stdout);
        const logs = [result.stdout, result.stderr, stderr].filter(Boolean).map((x) => String(x).slice(0, 2000));
        if (timedOut) return { status: 'timeout', message: 'Sandbox execution reached its time limit and the container was stopped.', behavioralEvidence: result, logs, artifacts: [] };
        return { status: 'completed', message: 'Linux ELF was run in a disposable, network-disabled container.', behavioralEvidence: result, logs, artifacts: [] };
      } finally {
        await cleanupNamed(name);
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  };
}

function parseRunnerResult(stdout) {
  try {
    const obj = JSON.parse(String(stdout).slice(0, 128 * 1024));
    const allowed = new Set(['process_created', 'network_attempt', 'file_written', 'persistence_attempt', 'execution_error']);
    return { events: (Array.isArray(obj.events) ? obj.events : []).slice(0, 100).flatMap((e) => allowed.has(e?.type) ? [{ type: e.type, detail: String(e.detail || '').slice(0, 300) }] : []), exitCode: Number.isInteger(obj.exitCode) ? obj.exitCode : null,
      stdout: typeof obj.stdout === 'string' ? obj.stdout.slice(0, 2000) : '', stderr: typeof obj.stderr === 'string' ? obj.stderr.slice(0, 2000) : '' };
  } catch { return { events: [], exitCode: null, outputMalformed: true }; }
}
