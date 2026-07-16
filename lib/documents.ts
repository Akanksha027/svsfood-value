/** Max upload size for vault documents (Supabase Storage). */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_DOCUMENT_LABEL = "15 MB";

export function isDocumentTooLarge(sizeBytes: number): boolean {
  return sizeBytes <= 0 || sizeBytes > MAX_DOCUMENT_BYTES;
}

export function documentSizeErrorMessage(): string {
  return `File must be between 1 byte and ${MAX_DOCUMENT_LABEL}`;
}
