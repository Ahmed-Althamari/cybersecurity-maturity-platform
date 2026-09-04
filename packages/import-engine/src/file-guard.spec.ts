import { MAX_FILE_SIZE_BYTES, validateFileUpload } from './file-guard';

describe('validateFileUpload', () => {
  it('accepts a well-formed .xlsx upload', () => {
    expect(validateFileUpload({ filename: 'assessment.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 1024 })).toEqual([]);
  });

  it('accepts a well-formed .csv upload', () => {
    expect(validateFileUpload({ filename: 'assessment.csv', mimetype: 'text/csv', size: 512 })).toEqual([]);
  });

  it('rejects an unsupported extension', () => {
    const issues = validateFileUpload({ filename: 'assessment.exe', size: 100 });
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error', column: 'file' })]));
  });

  it('rejects path traversal in the filename', () => {
    const issues = validateFileUpload({ filename: '../../etc/passwd.csv', size: 100 });
    expect(issues.some((issue) => issue.message.includes('path traversal'))).toBe(true);
  });

  it('rejects an empty file', () => {
    const issues = validateFileUpload({ filename: 'assessment.csv', size: 0 });
    expect(issues.some((issue) => issue.message.includes('empty'))).toBe(true);
  });

  it('rejects a file over the size cap', () => {
    const issues = validateFileUpload({ filename: 'assessment.csv', size: MAX_FILE_SIZE_BYTES + 1 });
    expect(issues.some((issue) => issue.message.includes('exceeds'))).toBe(true);
  });

  it('warns (but does not reject) on an unrecognised MIME type', () => {
    const issues = validateFileUpload({ filename: 'assessment.csv', mimetype: 'text/html', size: 100 });
    expect(issues).toEqual([expect.objectContaining({ severity: 'warning' })]);
  });
});
