// Supported-format policy. Keyed by the format detected from the file SIGNATURE.
// `family` lists extensions considered consistent with that format.
export const FORMATS = {
  exe:  { category: 'Windows executable', family: ['exe', 'dll', 'sys', 'scr'] },
  elf:  { category: 'Linux executable', family: ['elf', 'so', 'bin', 'o', ''] },
  pdf:  { category: 'PDF document', family: ['pdf'] },
  docx: { category: 'Office document', family: ['docx'] },
  xlsx: { category: 'Office document', family: ['xlsx'] },
  pptx: { category: 'Office document', family: ['pptx'] },
  cfb:  { category: 'Office document (legacy)', family: ['doc', 'xls', 'ppt'] },
  zip:  { category: 'ZIP archive', family: ['zip'] },
  png:  { category: 'Image', family: ['png'] },
  jpg:  { category: 'Image', family: ['jpg', 'jpeg'] },
  gif:  { category: 'Image', family: ['gif'] },
  webp: { category: 'Image', family: ['webp'] },
  bmp:  { category: 'Image', family: ['bmp'] },
};
export const TEXT_EXTS = ['txt', 'log', 'md', 'csv', 'json'];
export const SUPPORTED_CATEGORIES = [...new Set(Object.values(FORMATS).map((f) => f.category)), 'Plain text', 'JSON'];
