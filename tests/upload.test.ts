import { describe, expect, it } from 'vitest';
import { MAX_PDF_BYTES, validatePdfUpload } from '@/lib/upload';

const file = (bytes: number, type: string) =>
  new File([new Uint8Array(bytes)], 'resume.pdf', { type });

describe('validatePdfUpload', () => {
  it('accepts a PDF within the size limit', () => {
    expect(validatePdfUpload(file(1024, 'application/pdf'))).toEqual({ ok: true });
  });

  it('rejects other MIME types with 415', () => {
    expect(validatePdfUpload(file(1024, 'image/png'))).toMatchObject({ ok: false, status: 415 });
  });

  it('rejects an empty file with 400', () => {
    expect(validatePdfUpload(file(0, 'application/pdf'))).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects an oversized file with 413', () => {
    expect(validatePdfUpload(file(MAX_PDF_BYTES + 1, 'application/pdf'))).toMatchObject({
      ok: false,
      status: 413,
    });
  });
});
