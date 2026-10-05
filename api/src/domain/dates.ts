/**
 * Datas de emissão sem hora, sempre no calendário UTC.
 *
 * A emissão é gravada como data pura (meia-noite UTC). Num servidor em UTC-3,
 * qualquer getter local (`getDate`, `toLocaleDateString`) mostraria o dia
 * anterior, no filtro de período e na planilha. Por isso a data da nota entra e
 * sai apenas por estas funções.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * 'AAAA-MM-DD' (ou ISO com hora, que é descartada) → meia-noite UTC.
 * `null` para datas inexistentes: `new Date('2026-02-30')` viraria 02/03.
 */
export function dateFromIso(iso: string | null | undefined): Date | null {
  const m = ISO_DATE.exec((iso ?? '').trim());
  if (!m) {
    return null;
  }
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  const sameDay =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day;
  return sameDay ? d : null;
}

/** Date → 'AAAA-MM-DD' pelo calendário UTC; '' quando ausente/inválida. */
export function isoFromDate(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) {
    return '';
  }
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** 'dd/mm/aaaa' para exibição. */
export function formatDateBr(d: Date | string | null | undefined): string {
  const iso =
    typeof d === 'string' ? isoFromDate(dateFromIso(d)) : isoFromDate(d);
  if (!iso) {
    return '';
  }
  const [y, m, day] = iso.split('-');
  return `${day}/${m}/${y}`;
}
