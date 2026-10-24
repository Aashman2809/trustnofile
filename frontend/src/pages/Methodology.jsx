const TAGS = {
  implemented: 'border-green-200 bg-green-50 text-green-800',
  partial: 'border-amber-200 bg-amber-50 text-amber-900',
  planned: 'border-slate-300 bg-slate-100 text-slate-700',
};
const Tag = ({ state }) => <span className={`ml-2 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${TAGS[state]}`}>{state}</span>;
const Item = ({ title, state, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-base font-semibold">{title}<Tag state={state} /></h2>
    <div className="mt-2 space-y-2 text-sm text-slate-700">{children}</div>
  </section>
);

export default function Methodology() {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Security Methodology</h1>
        <p className="mt-1 text-sm text-slate-600">How TrustNoFile examines a file today, and what is still planned. Uploaded files are never executed in this version.</p>
      </div>

      <Item title="File validation" state="implemented">
        <p>The backend enforces the size limit, rejects empty files, and identifies the real format from the file signature. The browser-reported type and the extension are not trusted. Unsupported formats are rejected, and a file whose extension disagrees with its content is accepted but flagged.</p>
        <p>Files are stored under server-generated names in a private folder, never served back over the web.</p>
      </Item>
      <Item title="Hashing and file identification" state="implemented">
        <p>SHA-256 is the primary identifier, with MD5 kept only for lookups in external systems. The hash is recomputed at analysis time to detect changes since upload.</p>
      </Item>
      <Item title="Static analysis" state="implemented">
        <p>Independent modules read the file without running it: metadata (Windows PE, Linux ELF and PDF structure), printable strings, entropy, and ZIP archive structure. Archives are inspected by reading their directory only; nothing is extracted. A module that fails, times out or is unavailable is reported as such and never counts as a clean result.</p>
      </Item>
      <Item title="Suspicious indicators" state="implemented">
        <p>Patterns such as encoded PowerShell, download-and-execute commands, injection-related API names, persistence references, archive path traversal, and executable files disguised by double extensions are reported as findings. Each is labeled <em>observed</em> (a fact read from the file) or <em>heuristic</em> (an interpretation that may be benign). A single string or indicator does not make a file malicious.</p>
      </Item>
      <Item title="Risk score" state="implemented">
        <p>A deterministic rule set adds points per distinct indicator, with a small bonus when indicators from different modules agree. Every point is listed in the report. The score bands are application-defined and configurable. They are not calibrated malware probabilities. When too few core modules complete, the report says “Insufficient evidence” instead of showing a number.</p>
      </Item>
      <Item title="Digital signatures" state="partial">
        <p>For Windows executables the report states whether an embedded signature exists. The signature is not cryptographically validated and no certificate chain is checked. For other formats, signature checks are not available.</p>
      </Item>
      <Item title="YARA rules" state="partial">
        <p>Supported when the YARA program is installed and rule files are placed in the configured rules folder. Otherwise the module is reported as unavailable or skipped, which is not the same as a clean scan.</p>
      </Item>
      <Item title="AI-assisted interpretation" state="planned">
        <p>A future phase may pass structured evidence to a language model for an additional opinion. File contents and extracted strings will be treated as untrusted data, outputs will be schema-validated, and policy will be enforced in application code. No AI analysis is performed now.</p>
      </Item>
      <Item title="Sandbox (behavioral) analysis" state="planned">
        <p>A future phase may run files in a disposable, isolated environment and record behavior. This is not available now, so runtime behavior is unknown. Executables are always flagged as candidates for behavioral analysis.</p>
      </Item>
      <Item title="Limitations of static analysis" state="implemented">
        <ul className="list-disc space-y-1 pl-5">
          <li>Finding no indicators does not mean a file is safe. Packed, encrypted or novel malware can show nothing suspicious statically.</li>
          <li>High entropy can come from compression or encryption and is common in harmless files.</li>
          <li>Unsigned files are common and not inherently malicious; signed files can still be harmful.</li>
          <li>Heuristics can raise false alarms, especially for security tools, installers and documents with macros.</li>
          <li>Nested or encrypted archive contents are not inspected.</li>
          <li>This is a local development tool: results are stored in plain JSON files and there is no user authentication.</li>
        </ul>
      </Item>
    </div>
  );
}
