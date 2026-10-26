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
        <p className="mt-1 text-sm text-slate-600">How TrustNoFile examines files today. Files are never executed on the host; configured sandbox runs are isolated and limited to eligible Linux executables.</p>
      </div>

      <Item title="File validation" state="implemented">
        <p>The backend enforces the size limit, rejects empty files, and identifies the actual format from signatures and bounded ZIP structure. The browser-reported type and extension are untrusted metadata. Unsupported formats are rejected, and an extension/content mismatch is accepted but flagged.</p>
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
      <Item title="AI-assisted interpretation" state="partial">
        <p>When Gemini is configured, the model receives only minimized file type/size, module status, finding codes and deterministic assessment. File bytes, filenames, extracted text, secrets and filesystem data are not sent. It has no tools, output is schema-validated, and it cannot lower deterministic risk. Provider failure leaves static results intact.</p>
      </Item>
      <Item title="Sandbox (behavioral) analysis" state="partial">
        <p>When Docker and the configured runner image are available, application policy can run Linux ELF files in disposable, network-disabled containers with resource limits and cleanup. Other formats remain static-only. If the sandbox is unavailable, no file is run on the host and static results remain available. Logs are untrusted evidence.</p>
      </Item>
      <Item title="Persistence" state="partial">
        <p>PostgreSQL repositories are selected only after a live connection check. Without a working database the app uses local JSON; those records are not durable across crashes. Analysis jobs remain in process and interrupted work must be retried.</p>
      </Item>
      <Item title="Analysis limitations" state="implemented">
        <ul className="list-disc space-y-1 pl-5">
          <li>Finding no indicators does not mean a file is safe. Packed, encrypted or novel malware can show nothing suspicious statically.</li>
          <li>High entropy can come from compression or encryption and is common in harmless files.</li>
          <li>Unsigned files are common and not inherently malicious; signed files can still be harmful.</li>
          <li>Heuristics can raise false alarms, especially for security tools, installers and documents with macros.</li>
          <li>Nested or encrypted archive contents are not inspected.</li>
          <li>Dynamic behavior is only observed for Linux ELF in the configured sandbox; other formats' runtime behavior is unknown.</li>
          <li>This is a local development tool with no user authentication.</li>
        </ul>
      </Item>
    </div>
  );
}
