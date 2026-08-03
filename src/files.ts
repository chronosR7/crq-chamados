export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods'
] as const;

export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(',');

export function attachmentExtension(filename: string) {
  return filename.split('.').pop()?.trim().toLowerCase() ?? '';
}

export function validateAttachment(file: Pick<File, 'name' | 'size'>): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} ultrapassa o limite de 2 MB.`;
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(attachmentExtension(file.name) as any)) {
    return `${file.name} possui um formato não permitido.`;
  }
  return null;
}
