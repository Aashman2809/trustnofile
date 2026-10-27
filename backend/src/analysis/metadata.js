import fs from 'node:fs/promises';
import { parsePE } from './pe.js';

// Handles head operation.
async function head(filePath, n) {
  const fh = await fs.open(filePath, 'r');
  try { const buf = Buffer.alloc(n); const r = await fh.read(buf, 0, n, 0); return buf.subarray(0, r.bytesRead); } finally { await fh.close(); }
}

// Reads metadata from an ELF executable.
async function elfInfo(filePath) {
  const b = await head(filePath, 64);
  if (b.length < 20) return { valid: false };
  const le = b[5] === 1;
  const type = le ? b.readUInt16LE(16) : b.readUInt16BE(16), machine = le ? b.readUInt16LE(18) : b.readUInt16BE(18);
  return { valid: true, class: b[4] === 2 ? '64-bit' : '32-bit', endianness: le ? 'little' : 'big', type: { 1: 'relocatable', 2: 'executable', 3: 'shared/PIE', 4: 'core' }[type] || String(type), machine: '0x' + machine.toString(16) };
}

// Reads metadata from a PDF document.
async function pdfInfo(filePath) {
  const fh = await fs.open(filePath, 'r');
  let text, size, scannedBytes;
  try { size = (await fh.stat()).size; const buf = Buffer.alloc(Math.min(size, 10 * 1024 * 1024)); const r = await fh.read(buf, 0, buf.length, 0); scannedBytes = r.bytesRead; text = buf.toString('latin1', 0, r.bytesRead); } finally { await fh.close(); }

  // Counts matching records.
  const count = (re) => (text.match(re) || []).length;
  const counts = { javascript: count(/\/(JavaScript|JS)\b/g), openAction: count(/\/OpenAction\b/g), launch: count(/\/Launch\b/g),
    embeddedFiles: count(/\/EmbeddedFile\b/g), additionalActions: count(/\/AA\b/g), richMedia: count(/\/RichMedia\b/g) };
  const headerMatch = text.slice(0, 1024).match(/%PDF-(\d\.\d)/);
  const hasHeader = !!headerMatch;
  const hasEof = /%%EOF[\x00\t\n\f\r ]*$/.test(text);
  const truncated = size > scannedBytes;
  return { valid: hasHeader && (hasEof || truncated), issue: !hasHeader ? 'PDF header is missing or malformed' : !hasEof && !truncated ? 'PDF end marker is missing' : null,
    complete: !truncated, truncated, version: headerMatch?.[1] || null, pages: count(/\/Type\s*\/Page\b/g),
    encrypted: /\/Encrypt\b/.test(text), scannedBytes, scanLimitBytes: 10 * 1024 * 1024, counts };
}

// Reads metadata from an image.
async function imageInfo(filePath, format, size) {
  const fh = await fs.open(filePath, 'r');
  try {

    const b = Buffer.alloc(Math.min(size, 1024 * 1024));
    const { bytesRead } = await fh.read(b, 0, b.length, 0);
    const data = b.subarray(0, bytesRead);
    let width = null, height = null, bitDepth = null, colorType = null;
    if (format === 'png' && data.length >= 29 && data.toString('ascii', 12, 16) === 'IHDR') {
      width = data.readUInt32BE(16); height = data.readUInt32BE(20); bitDepth = data[24]; colorType = data[25];
    } else if (format === 'gif' && data.length >= 10) { width = data.readUInt16LE(6); height = data.readUInt16LE(8); }
    else if (format === 'bmp' && data.length >= 26) {
      const dib = data.readUInt32LE(14);
      if (dib === 12) { width = data.readUInt16LE(18); height = data.readUInt16LE(20); bitDepth = data.readUInt16LE(24); }
      else if (dib >= 40 && data.length >= 30) { width = Math.abs(data.readInt32LE(18)); height = Math.abs(data.readInt32LE(22)); bitDepth = data.readUInt16LE(28); }
    } else if (format === 'webp' && data.length >= 30 && data.toString('ascii', 12, 16) === 'VP8X') {
      width = 1 + data.readUIntLE(24, 3); height = 1 + data.readUIntLE(27, 3);
    } else if (format === 'webp' && data.length >= 30 && data.toString('ascii', 12, 16) === 'VP8 ' && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
      width = data.readUInt16LE(26) & 0x3fff; height = data.readUInt16LE(28) & 0x3fff;
    } else if (format === 'webp' && data.length >= 25 && data.toString('ascii', 12, 16) === 'VP8L' && data[20] === 0x2f) {
      width = 1 + data[21] + ((data[22] & 0x3f) << 8);
      height = 1 + (data[22] >> 6) + (data[23] << 2) + ((data[24] & 0x0f) << 10);
    } else if (format === 'jpg') {
      let p = 2, steps = 0;
      while (p + 4 <= data.length && steps++ < 4096) {
        if (data[p] !== 0xff) { p++; continue; }
        while (p < data.length && data[p] === 0xff) p++;
        const marker = data[p++];
        if ([0xd8, 0xd9, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7].includes(marker)) continue;
        if (p + 2 > data.length) break;
        const segment = data.readUInt16BE(p);
        if (segment < 2 || p + segment > data.length) break;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && segment >= 7) {
          bitDepth = data[p + 2]; height = data.readUInt16BE(p + 3); width = data.readUInt16BE(p + 5); break;
        }
        p += segment;
      }
    }
    return { width, height, ...(bitDepth !== null ? { bitDepth } : {}), ...(colorType !== null ? { colorType } : {}), inspectedHeaderBytes: bytesRead };
  } finally { await fh.close(); }
}

// Reads metadata from a text file.
async function textInfo(filePath, size, format) {
  const fh = await fs.open(filePath, 'r');
  try {
    const b = Buffer.alloc(Math.min(size, 1024 * 1024));
    const { bytesRead } = await fh.read(b, 0, b.length, 0);
    const sample = b.subarray(0, bytesRead);
    let validUtf8 = false;
    try { new TextDecoder('utf-8', { fatal: true }).decode(sample); validUtf8 = true; } catch {}
    let validJson;
    if (format === 'json' && size <= 10 * 1024 * 1024) {
      try { JSON.parse(await fs.readFile(filePath, 'utf8')); validJson = true; } catch { validJson = false; }
    }
    return { encoding: validUtf8 ? 'UTF-8' : 'non-UTF-8 or sample ends mid-character', sampledBytes: bytesRead,
      sampleLimitBytes: 1024 * 1024, lineBreaksInSample: (sample.toString('latin1').match(/\n/g) || []).length,
      completeSample: size <= bytesRead, ...(validJson !== undefined ? { validJson } : {}) };
  } finally { await fh.close(); }
}

// Reads metadata from an HTML file.
async function htmlInfo(filePath, size) {
  const limit = 2 * 1024 * 1024;
  const fh = await fs.open(filePath, 'r');
  try {
    const b = Buffer.alloc(Math.min(size, limit));
    const { bytesRead } = await fh.read(b, 0, b.length, 0);
    const html = b.toString('utf8', 0, bytesRead);

    // Counts matching records.
    const count = (re) => (html.match(re) || []).length;
    const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map(/* Transforms each item in the collection. */ (m) => m[0]);
    const counts = {
      scriptElements: scriptTags.length,
      inlineScriptElements: scriptTags.filter(/* Keeps items that match the condition. */ (tag) => !/\bsrc\s*=/i.test(tag)).length,
      eventHandlerAttributes: count(/\son[a-z][\w:-]*\s*=/gi),
      iframes: count(/<iframe\b/gi),
      javascriptUrls: count(/\b(?:href|src)\s*=\s*(?:"\s*javascript:|'\s*javascript:|javascript:)/gi),
      metaRefresh: count(/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(['"]?)refresh\1)[^>]*>/gi),
      externalHttpResources: count(/\b(?:src|href)\s*=\s*(?:"https?:\/\/|'https?:\/\/|https?:\/\/)/gi),
    };
    const findings = [];

    // Adds an item to the collection.
    const add = (code, title, severity, description, evidence) => findings.push({ code, title, severity, kind: 'heuristic', description, evidence });
    if (counts.inlineScriptElements) add('HTML_INLINE_SCRIPT', 'HTML contains inline script elements', 'medium', 'Inline JavaScript runs when a browser opens the document. Its presence can be legitimate; the script was not executed or analyzed.', { count: counts.inlineScriptElements });
    if (counts.eventHandlerAttributes) add('HTML_EVENT_HANDLER', 'HTML contains inline event-handler attributes', 'medium', 'Event handlers can run JavaScript in a browser in response to user or page events.', { count: counts.eventHandlerAttributes });
    if (counts.javascriptUrls) add('HTML_JAVASCRIPT_URL', 'HTML contains JavaScript URLs', 'medium', 'JavaScript URLs can execute script when activated by a browser.', { count: counts.javascriptUrls });
    if (counts.iframes) add('HTML_IFRAME', 'HTML contains iframe elements', 'low', 'Iframes embed other content. Their presence is common on legitimate sites but can hide or load untrusted content.', { count: counts.iframes });
    if (counts.metaRefresh) add('HTML_META_REFRESH', 'HTML contains automatic refresh or redirect directives', 'low', 'Meta refresh directives can redirect a browser automatically.', { count: counts.metaRefresh });
    return { data: { scannedBytes: bytesRead, scanLimitBytes: limit, truncated: size > bytesRead, counts }, findings };
  } finally { await fh.close(); }
}

// Inspects text for format-specific findings.
async function inspectTextFormat(filePath, size, format) {
  const limit = 2 * 1024 * 1024;
  const fh = await fs.open(filePath, 'r');
  try {
    const b = Buffer.alloc(Math.min(size, limit));
    const { bytesRead } = await fh.read(b, 0, b.length, 0);
    const text = b.toString('utf8', 0, bytesRead);

    // Counts matching records.
    const count = (re) => (text.match(re) || []).length;
    const counts = {};
    const findings = [];

    // Adds an item to the collection.
    const add = (code, title, severity, description, matches) => findings.push({ code, title, severity, kind: 'heuristic', description, evidence: { count: matches } });

    if (format === 'yaml') {
      counts.documents = count(/^---\s*$/gm);
      counts.anchors = count(/(?:^|\s)&[\w-]+/gm);
      counts.aliases = count(/(?:^|\s)\*[\w-]+/gm);
      counts.explicitTags = count(/(?:^|\s)!![\w!:/.-]+/gm);
      const dangerousTags = count(/!!(?:python|ruby|java|javax|php|perl)[\w!:/.-]*/gi);
      if (dangerousTags) add('YAML_OBJECT_TAG', 'YAML contains language-specific object tags', 'medium', 'Some YAML loaders can instantiate objects from explicit tags. Risk depends on the loader and its configuration.', dangerousTags);
    } else if (format === 'xml' || format === 'svg') {
      counts.doctypes = count(/<!doctype\b/gi);
      counts.entityDeclarations = count(/<!entity\b/gi);
      counts.externalIdentifiers = count(/\b(?:system|public)\s+(?:"|')/gi);
      counts.xincludeElements = count(/<xi:include\b/gi);
      const stack = [];
      let malformed = null, tags = 0, cursor = 0;
      while (cursor < text.length && !malformed) {
        const start = text.indexOf('<', cursor);
        if (start < 0) break;
        if (text.startsWith('<!--', start)) {
          const end = text.indexOf('-->', start + 4);
          if (end < 0) malformed = 'Unterminated XML comment'; else cursor = end + 3;
          continue;
        }
        if (text.startsWith('<![CDATA[', start)) {
          const end = text.indexOf(']]>', start + 9);
          if (end < 0) malformed = 'Unterminated CDATA section'; else cursor = end + 3;
          continue;
        }
        if (text.startsWith('<?', start)) {
          const end = text.indexOf('?>', start + 2);
          if (end < 0) malformed = 'Unterminated processing instruction'; else cursor = end + 2;
          continue;
        }
        const isDoctype = /^<!DOCTYPE\b/i.test(text.slice(start, start + 16));
        let quote = '', end = start + 1, bracketDepth = 0;
        for (; end < text.length; end++) {
          const ch = text[end];
          if (quote) { if (ch === quote) quote = ''; continue; }
          if (ch === '"' || ch === "'") { quote = ch; continue; }
          if (isDoctype && ch === '[') bracketDepth++;
          else if (isDoctype && ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
          else if (ch === '>' && bracketDepth === 0) break;
        }
        if (end >= text.length || quote) { malformed = 'Unterminated XML tag'; break; }
        const token = text.slice(start + 1, end).trim();
        cursor = end + 1;
        if (!token || token[0] === '!') continue;
        const closing = token[0] === '/', selfClosing = /\/$/.test(token);
        const match = token.match(/^\/?\s*([A-Za-z_][\w:.-]*)/);
        if (!match) { malformed = 'Malformed XML tag'; break; }
        tags++;
        if (tags > 50000) { malformed = 'XML tag inspection limit reached'; break; }
        const tag = match[1];
        if (closing) {
          if (stack.pop() !== tag) { malformed = 'Mismatched XML closing tag'; break; }
        } else if (!selfClosing) {
          if (stack.length >= 256) { malformed = 'XML nesting limit reached'; break; }
          stack.push(tag);
        }
      }
      const completeSample = size <= bytesRead;
      if (!malformed && completeSample && stack.length) malformed = 'XML has unclosed elements';
      counts.tagStructure = malformed ? 'invalid' : completeSample ? 'consistent' : 'incomplete';
      counts.tagInspectionLimit = { bytes: limit, tags: 50000, depth: 256 };
      if (malformed && !malformed.includes('inspection limit') && !malformed.includes('nesting limit'))
        add('XML_STRUCTURE_INVALID', 'XML tag structure is malformed', 'medium', 'A bounded tag-structure check found mismatched, unclosed, or unterminated markup. No entities were resolved and this is not full XML validation.', 1);
      if (malformed && (malformed.includes('inspection limit') || malformed.includes('nesting limit')))
        add('XML_ANALYSIS_INCOMPLETE', 'XML structure inspection reached a safety limit', 'info', 'The bounded XML tag inspection stopped at its tag or nesting limit. Remaining structure is unknown.', 1);
      if (!malformed && !completeSample)
        add('XML_ANALYSIS_INCOMPLETE', 'XML structure inspection reached its byte limit', 'info', 'Only the first 2 MB were checked for tag consistency; remaining structure is unknown.', 1);
      if (counts.entityDeclarations || counts.externalIdentifiers) add('XML_EXTERNAL_ENTITY', 'XML contains entity declarations or external identifiers', 'medium', 'External entity handling can expose local or remote resources in unsafe XML parsers; this application does not resolve entities.', counts.entityDeclarations + counts.externalIdentifiers);
      if (format === 'svg') {
        counts.scriptElements = count(/<script\b/gi);
        counts.eventHandlerAttributes = count(/\son[a-z][\w:-]*\s*=/gi);
        counts.foreignObjectElements = count(/<foreignObject\b/gi);
        counts.externalReferences = count(/\b(?:href|xlink:href)\s*=\s*(['"]?)(?:https?:|\/\/|javascript:)/gi);
        if (counts.scriptElements) add('SVG_SCRIPT', 'SVG contains script elements', 'medium', 'SVG scripts may run when opened in a capable viewer or embedded in a page.', counts.scriptElements);
        if (counts.eventHandlerAttributes) add('SVG_EVENT_HANDLER', 'SVG contains inline event handlers', 'medium', 'Event-handler attributes can run script in a capable SVG viewer.', counts.eventHandlerAttributes);
        if (counts.foreignObjectElements) add('SVG_FOREIGN_OBJECT', 'SVG embeds foreign document content', 'low', 'foreignObject can embed HTML or other content inside SVG.', counts.foreignObjectElements);
      }
    } else if (format === 'javascript' || format === 'typescript') {
      counts.evalCalls = count(/\beval\s*\(/g);
      counts.functionConstructors = count(/\bnew\s+Function\s*\(/g);
      counts.documentWriteCalls = count(/\bdocument\s*\.\s*write(?:ln)?\s*\(/gi);
      if (counts.evalCalls || counts.functionConstructors) add('SCRIPT_DYNAMIC_CODE', 'Source constructs code dynamically', 'low', 'eval or Function can execute generated code; these constructs also occur in legitimate software.', counts.evalCalls + counts.functionConstructors);
    } else if (format === 'css') {
      counts.importRules = count(/@import\b/gi);
      counts.expressionFunctions = count(/\bexpression\s*\(/gi);
      counts.externalUrls = count(/url\s*\(\s*(['"]?)https?:\/\//gi);
      if (counts.expressionFunctions) add('CSS_EXPRESSION', 'Stylesheet contains legacy expression() code', 'low', 'Legacy CSS expression syntax may execute script in outdated browser engines.', counts.expressionFunctions);
    } else if (format === 'shell') {
      counts.downloadPipes = count(/\b(?:curl|wget)\b[^\n|]{0,300}\|\s*(?:sh|bash)\b/gi);
      counts.evalCalls = count(/\beval\s+(?:"|')?\$?\(/g);
      counts.privilegeChanges = count(/\bchmod\s+[ugo]*s\b/gi);
      if (counts.downloadPipes) add('SHELL_DOWNLOAD_EXECUTE', 'Shell source pipes a download into a shell', 'medium', 'Downloading and immediately running content is risky; it may also be part of a legitimate installer.', counts.downloadPipes);
    } else if (format === 'python') {
      counts.dynamicExecutionCalls = count(/\b(?:eval|exec)\s*\(/g);
      counts.subprocessCalls = count(/\bsubprocess\s*\./g);
      counts.pickleLoads = count(/\bpickle\s*\.\s*loads?\s*\(/g);
      if (counts.dynamicExecutionCalls) add('PYTHON_DYNAMIC_EXECUTION', 'Python source uses eval or exec', 'low', 'Dynamic execution can run generated code; it is also used in legitimate tooling.', counts.dynamicExecutionCalls);
      if (counts.pickleLoads) add('PYTHON_PICKLE_LOAD', 'Python source loads pickle data', 'low', 'Untrusted pickle data can execute code during deserialization.', counts.pickleLoads);
    } else if (format === 'sql') {
      counts.destructiveStatements = count(/\b(?:drop\s+(?:table|database|schema)|truncate\s+table)\b/gi);
      counts.dynamicExecution = count(/\b(?:xp_cmdshell|sp_executesql)\b/gi);
      if (counts.destructiveStatements) add('SQL_DESTRUCTIVE_STATEMENT', 'SQL source contains destructive schema or table statements', 'low', 'These statements can delete data when executed; they may be intentional in migrations.', counts.destructiveStatements);
    } else if (format === 'toml' || format === 'ini' || format === 'config') {
      counts.sections = count(/^\s*\[[^\]]+\]\s*$/gm);
      counts.assignments = count(/^\s*[\w.-]+\s*[:=]/gm);
    } else if (format === 'csv') {
      counts.rowsInSample = text ? text.split(/\r?\n/).filter(Boolean).length : 0;
      counts.commasInSample = count(/,/g);
    } else if (format === 'markdown') {
      counts.headings = count(/^\s{0,3}#{1,6}\s+/gm);
      counts.links = count(/\[[^\]]*\]\(https?:\/\/[^\s)]+\)/gi);
    }
    return { data: { scannedBytes: bytesRead, scanLimitBytes: limit, truncated: size > bytesRead, counts }, findings };
  } finally { await fh.close(); }
}

// Collects file metadata.
export async function metadataModule({ filePath, file }) {
  const st = await fs.stat(filePath);
  const data = { size: st.size, storedFileTimestamps: { modified: st.mtime.toISOString() },
    note: 'Filesystem timestamps reflect server storage, not the original file. Metadata is context, not proof of malicious intent.' };
  const findings = [];
  const fmt = file.detected?.format;
  if (fmt === 'exe') {
    data.pe = await parsePE(filePath);
    if (!data.pe.valid) findings.push({ code: 'PE_STRUCTURE_INVALID', title: 'Executable header could not be parsed as valid PE', severity: 'medium', kind: 'observed',
      description: 'The file starts like a Windows executable but its PE structure is invalid or truncated. This may be a DOS program, damaged, or deliberately malformed.', evidence: { reason: data.pe.reason } });
    else {
      if (!data.pe.complete) findings.push({ code: 'PE_ANALYSIS_INCOMPLETE', title: 'PE section inspection reached its limit', severity: 'info', kind: 'observed',
        description: 'Only the first 96 PE sections are inspected.', evidence: { inspectedSections: data.pe.sections.length, sectionLimit: data.pe.sectionLimit } });
      for (const s of data.pe.sections) if (s.executable && s.entropy >= 7.2)
        findings.push({ code: 'PE_HIGH_ENTROPY_SECTION', title: `Executable section "${s.name}" has high entropy`, severity: 'low', kind: 'heuristic',
          description: 'High-entropy code sections are common in packed executables but also in some legitimate software.', evidence: { section: s.name, entropy: s.entropy } });
    }
  } else if (fmt === 'elf') data.elf = await elfInfo(filePath);
  else if (fmt === 'pdf') {
    data.pdf = await pdfInfo(filePath);
    const c = data.pdf.counts;
    if (!data.pdf.valid) findings.push({ code: 'PDF_STRUCTURE_INVALID', title: 'PDF header or end marker is malformed', severity: 'medium', kind: 'observed',
      description: 'A bounded structural check found a missing PDF header or end marker. This check does not validate the complete PDF object graph.', evidence: { issue: data.pdf.issue } });
    if (data.pdf.truncated) findings.push({ code: 'PDF_ANALYSIS_INCOMPLETE', title: 'PDF inspection reached its byte limit', severity: 'info', kind: 'observed',
      description: 'PDF keyword checks inspect only the first 10 MB; content beyond that limit was not checked.', evidence: { scannedBytes: data.pdf.scannedBytes, scanLimitBytes: data.pdf.scanLimitBytes } });
    if (c.javascript || c.launch)
      findings.push({ code: 'PDF_ACTIVE_CONTENT', title: 'PDF contains script or launch actions', severity: 'medium', kind: 'heuristic',
        description: 'JavaScript or Launch actions can be used maliciously but also appear in legitimate forms.', evidence: { javascript: c.javascript, launch: c.launch } });
    else if (c.openAction || c.additionalActions)
      findings.push({ code: 'PDF_AUTO_ACTION', title: 'PDF defines automatic actions', severity: 'low', kind: 'heuristic',
        description: 'The document defines actions triggered on open or on events.', evidence: { openAction: c.openAction, additionalActions: c.additionalActions } });
    if (c.embeddedFiles) findings.push({ code: 'PDF_EMBEDDED_FILE', title: 'PDF contains embedded files', severity: 'low', kind: 'observed',
      description: 'Embedded files were referenced in the document structure.', evidence: { count: c.embeddedFiles } });
  } else if (['png', 'jpg', 'gif', 'webp', 'bmp'].includes(fmt)) data.image = await imageInfo(filePath, fmt, st.size);
  else if (fmt === 'text' || fmt === 'json' || fmt === 'yaml' || fmt === 'xml' || fmt === 'svg' || fmt === 'toml' || fmt === 'ini' || fmt === 'config' || fmt === 'markdown' || fmt === 'csv' || fmt === 'log' || fmt === 'javascript' || fmt === 'typescript' || fmt === 'css' || fmt === 'sql' || fmt === 'shell' || fmt === 'python' || fmt === 'php' || fmt === 'ruby' || fmt === 'go' || fmt === 'rust' || fmt === 'java' || fmt === 'c' || fmt === 'csharp') {
    data.text = await textInfo(filePath, st.size, fmt);
    const inspection = await inspectTextFormat(filePath, st.size, fmt);
    data.formatDetails = inspection.data;
    findings.push(...inspection.findings);
  }
  else if (fmt === 'html') {
    const result = await htmlInfo(filePath, st.size);
    data.html = result.data;
    findings.push(...result.findings);
  }
  return { status: 'completed', data, findings };
}
