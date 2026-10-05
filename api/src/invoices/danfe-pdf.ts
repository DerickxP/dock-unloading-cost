/**
 * Leitor de PDF: a única fronteira com a biblioteca (pdf-parse). Devolve o
 * texto por página; quem entende o texto é o domínio (domain/danfe-text).
 */
import { PDFParse } from 'pdf-parse';

export class PdfUnreadableError extends Error {}

/** Bytes do PDF → texto de cada página, na ordem do arquivo. */
export async function readPdfPages(bytes: Uint8Array): Promise<string[]> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: new Uint8Array(bytes) });
    const result = await parser.getText();
    return result.pages.map((p) => p.text ?? '');
  } catch (e) {
    throw new PdfUnreadableError(
      'não foi possível ler o arquivo; está corrompido ou não é um PDF',
      { cause: e },
    );
  } finally {
    if (parser) {
      await parser.destroy().catch(() => undefined);
    }
  }
}

/** PDF digitalizado não tem camada de texto; uma folha de DANFE real tem milhares de caracteres. */
export function hasNoTextLayer(pages: string[]): boolean {
  return pages.every((p) => p.trim().length < 50);
}
