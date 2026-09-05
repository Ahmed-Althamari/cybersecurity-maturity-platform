import { MAX_FILE_SIZE_BYTES, validateFileSignature, validateFileUpload } from './file-guard';

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

describe('validateFileSignature', () => {
  it('accepts a real xlsx (ZIP signature present)', () => {
    const zipLike = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rest of the file')]);
    expect(validateFileSignature(zipLike, 'assessment.xlsx')).toEqual([]);
  });

  it('rejects a file claiming to be .xlsx without the ZIP signature — e.g. a renamed/disguised file', () => {
    const notAZip = Buffer.from('this is not a real spreadsheet, just renamed');
    const issues = validateFileSignature(notAZip, 'assessment.xlsx');
    expect(issues).toEqual([expect.objectContaining({ severity: 'error' })]);
    expect(issues[0].message).toContain('ZIP file signature');
  });

  it('rejects an xlsx buffer too short to even contain a signature', () => {
    const issues = validateFileSignature(Buffer.from([0x50, 0x4b]), 'assessment.xlsx');
    expect(issues).toEqual([expect.objectContaining({ severity: 'error' })]);
  });

  it('accepts a real CSV (plain text content)', () => {
    expect(validateFileSignature(Buffer.from('Control_ID,Maturity\nGV.RM-01,DEFINED\n'), 'assessment.csv')).toEqual([]);
  });

  it('rejects a file claiming to be .csv but containing binary content', () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    const issues = validateFileSignature(binary, 'assessment.csv');
    expect(issues).toEqual([expect.objectContaining({ severity: 'error' })]);
    expect(issues[0].message).toContain('binary content');
  });
});
