export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const PDF_MIME_TYPE = 'application/pdf';

export type UploadValidation =
  | { ok: true }
  | { ok: false; error: string; status: number };

export function validatePdfUpload(file: File): UploadValidation {
  if (file.type !== PDF_MIME_TYPE) {
    return { ok: false, error: 'Only PDF files are accepted.', status: 415 };
  }

  if (file.size === 0) {
    return { ok: false, error: 'The uploaded PDF is empty.', status: 400 };
  }

  if (file.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      error: `PDF is too large. Maximum size is ${MAX_PDF_BYTES / (1024 * 1024)}MB.`,
      status: 413,
    };
  }

  return { ok: true };
}
