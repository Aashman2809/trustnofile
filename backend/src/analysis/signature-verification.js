import { parsePE } from './pe.js';

// Checks file signatures against known patterns.
export async function signatureModule({ filePath, file }) {
  if (file.detected?.format !== 'exe') return { status: 'unavailable', reason: 'Signature checks are only implemented for Windows PE files.', data: { verification: 'unavailable' }, findings: [] };
  const pe = await parsePE(filePath);
  if (!pe.valid) return { status: 'unavailable', reason: 'PE structure invalid; signature table unreadable.', data: { verification: 'unavailable' }, findings: [] };
  const present = pe.certificateTableSize > 0;
  return { status: 'completed', data: { signaturePresent: present, verification: 'unavailable', note: 'Cryptographic validation and certificate-chain checks are not performed. An unsigned file is not automatically malicious; a valid signature does not prove safety.' },
    findings: [{ code: present ? 'PE_SIGNATURE_PRESENT_UNVERIFIED' : 'PE_NO_EMBEDDED_SIGNATURE', title: present ? 'Embedded signature present (not validated)' : 'No embedded signature', severity: 'info', kind: 'observed',
      description: present ? 'A certificate table exists but was not validated.' : 'No Authenticode certificate table was found. Many legitimate files are unsigned.', evidence: { certificateTableSize: pe.certificateTableSize } }] };
}
