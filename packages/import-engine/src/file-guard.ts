import type { ValidationIssue } from './types';

// Master prompt §40 also names zip bombs and malformed XLSX as threats to
// defend against. exceljs doesn't expose a cheap "inspect before
// decompressing" API, so the practical mitigation here is capping the
// compressed upload size before it's ever handed to the parser — genuine
// protection against a fully-inflated multi-GB zip bomb would need a
// streaming decompressor with a byte budget, which is a bigger change than
// this phase's scope. Noted as a known limitation, not silently assumed away.
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_ROWS = 20_000;

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Many browsers/OSes report this generic type regardless of the actual file — not a reliable signal on its own.
  'application/octet-stream',
]);

export interface FileUploadMeta {
  filename: string;
  mimetype?: string;
  size: number;
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
}

/**
 * Validates a spreadsheet upload's metadata before any parsing happens.
 * Extension + path-traversal + size checks are hard rejections; an
 * unrecognised MIME type is only a warning since browser-reported MIME
 * types for spreadsheets are notoriously unreliable — the extension check
 * is the real gate.
 */
export function validateFileUpload(file: FileUploadMeta): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (file.filename.includes('..') || file.filename.includes('/') || file.filename.includes('\\')) {
    issues.push({ column: 'file', message: 'Filename contains path traversal characters', severity: 'error' });
  }

  const extension = getExtension(file.filename);
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    issues.push({
      column: 'file',
      message: `Unsupported file extension '${extension || '(none)'}' — expected one of ${ALLOWED_EXTENSIONS.join(', ')}`,
      severity: 'error',
    });
  }

  if (file.size <= 0) {
    issues.push({ column: 'file', message: 'File is empty', severity: 'error' });
  } else if (file.size > MAX_FILE_SIZE_BYTES) {
    issues.push({
      column: 'file',
      message: `File exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      severity: 'error',
    });
  }

  if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    issues.push({ column: 'file', message: `Unexpected MIME type '${file.mimetype}'`, severity: 'warning' });
  }

  return issues;
}
