import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, attachmentExtension, validateAttachment } from './files';

describe('attachment security', () => {
  it('accepts supported extensions case-insensitively', () => {
    expect(attachmentExtension('evidencia.PDF')).toBe('pdf');
    expect(validateAttachment({ name: 'evidencia.PDF', size: 1024 })).toBeNull();
  });

  it('rejects executable and web files', () => {
    expect(validateAttachment({ name: 'programa.exe', size: 1024 })).toContain('formato não permitido');
    expect(validateAttachment({ name: 'pagina.html', size: 1024 })).toContain('formato não permitido');
  });

  it('rejects files larger than two megabytes', () => {
    expect(validateAttachment({ name: 'relatorio.pdf', size: MAX_ATTACHMENT_BYTES + 1 })).toContain('2 MB');
  });
});
