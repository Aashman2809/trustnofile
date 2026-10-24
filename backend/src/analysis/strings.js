import { createReadStream } from 'node:fs';

const MAX_SCAN = 32 * 1024 * 1024, MAX_SAMPLES = 5, SAMPLE_LEN = 120;
export const INDICATORS = [
  { code: 'URL', title: 'URLs found', severity: 'info', re: /https?:\/\/[^\s"'<>]{4,}/i },
  { code: 'IPV4', title: 'IPv4 addresses found', severity: 'info', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/ },
  { code: 'POWERSHELL_ENCODED', title: 'PowerShell with encoded/hidden/download options', severity: 'medium', re: /powershell(?:\.exe)?\s.{0,200}(?:-enc\w*|-nop\w*|-w\w*\s+hidden|iex|downloadstring)/i },
  { code: 'CMD_EXEC', title: 'Command interpreter invocation', severity: 'low', re: /cmd(?:\.exe)?\s+\/c\b/i },
  { code: 'DOWNLOAD_AND_EXECUTE', title: 'Download piped to shell', severity: 'medium', re: /(?:curl|wget)[^|\n]{0,200}\|\s*(?:sh|bash)\b/i },
  { code: 'PROCESS_INJECTION_APIS', title: 'Process-injection related API names', severity: 'low', re: /VirtualAllocEx|WriteProcessMemory|CreateRemoteThread|NtUnmapViewOfSection/ },
  { code: 'PERSISTENCE', title: 'Persistence-related references', severity: 'low', re: /CurrentVersion\\Run|schtasks\s+\/create|crontab\s+-|\/etc\/cron/i },
  { code: 'SCRIPT_KEYWORDS', title: 'Script-related keywords', severity: 'low', re: /eval\(|document\.write|WScript\.Shell|ActiveXObject|<script/i },
  { code: 'BASE64_BLOB', title: 'Long base64-like strings', severity: 'low', re: /[A-Za-z0-9+/]{200,}={0,2}/, exclude: /^[0-9A-Fa-f]+$/ },
];
const redact = (s) => s.replace(/(password|passwd|pwd|secret|token|api[_-]?key)(\s*[=:]\s*)\S+/gi, '$1$2[REDACTED]').slice(0, SAMPLE_LEN);

export async function stringsModule({ filePath }) {
  const stats = Object.fromEntries(INDICATORS.map((i) => [i.code, { count: 0, samples: [] }]));
  let scanned = 0, stringCount = 0, carry = '';
  const handle = (s) => {
    stringCount++;
    for (const ind of INDICATORS) {
      const m = s.match(ind.re);
      if (!m || ind.exclude?.test(m[0])) continue;
      const st = stats[ind.code]; st.count++;
      if (st.samples.length < MAX_SAMPLES) st.samples.push(redact(m[0]));
    }
  };
  for await (const chunk of createReadStream(filePath, { end: MAX_SCAN - 1 })) {
    scanned += chunk.length;
    const text = carry + chunk.toString('latin1');
    const runs = [...text.matchAll(/[\x20-\x7e]{6,}/g)];
    carry = '';
    for (const m of runs) {
      if (m.index + m[0].length === text.length) carry = m[0].slice(-4096); else handle(m[0]);
    }
  }
  if (carry.length >= 6) handle(carry);
  const findings = INDICATORS.filter((i) => stats[i.code].count).map((i) => ({
    code: `STR_${i.code}`, title: i.title, severity: i.severity, kind: 'heuristic',
    description: 'A string pattern was found. Presence of a string does not make a file malicious; treat samples as untrusted data.',
    evidence: { matches: stats[i.code].count, samples: stats[i.code].samples },
  }));
  return { status: 'completed', data: { scannedBytes: scanned, scanLimitBytes: MAX_SCAN, printableStrings: stringCount, minLength: 6, truncated: scanned >= MAX_SCAN, sampleLimitPerIndicator: MAX_SAMPLES }, findings };
}
