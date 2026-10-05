/**
 * Decodificação de arquivos de texto que chegam por upload (CSV do ERP,
 * listas): BOM > UTF-8 estrito > Windows-1252. O export do ERP costuma vir em
 * Windows-1252 sem BOM; ler como UTF-8 corromperia acentos em silêncio, por
 * isso a tentativa UTF-8 é estrita e a falha cai no legado.
 */
export function decodeText(raw: Uint8Array): string {
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(raw);
  }
  if (
    (raw[0] === 0xff && raw[1] === 0xfe) ||
    (raw[0] === 0xfe && raw[1] === 0xff)
  ) {
    return new TextDecoder(raw[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(
      raw,
    );
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    return new TextDecoder('windows-1252').decode(raw);
  }
}

/** O exceljs e o pdf-parse querem ArrayBuffer; o Node entrega Buffer/Uint8Array. */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export { parseBrNumber } from '../domain/format';
