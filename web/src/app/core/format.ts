/** Formatação pt-BR, as mesmas regras do domínio da API. */

const numberFormatters = new Map<number, Intl.NumberFormat>();

export function formatNumber(value: number | null | undefined, places = 2): string {
  const v = value != null && Number.isFinite(value) ? value : 0;
  let f = numberFormatters.get(places);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: places, maximumFractionDigits: places });
    numberFormatters.set(places, f);
  }
  return f.format(v);
}

export function formatBrl(value: number | null | undefined): string {
  return `R$ ${formatNumber(value, 2)}`;
}

/** 'AAAA-MM-DD' (ou ISO com hora) → 'dd/mm/aaaa'. */
export function formatDateBr(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** ISO com hora → 'dd/mm/aaaa hh:mm' no fuso do navegador. */
export function formatDateTimeBr(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatCnpj(raw: string | null | undefined): string {
  const c = (raw ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (c.length === 14) {
    return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  }
  if (c.length === 11) {
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  }
  return c;
}

/** Chave de acesso em grupos de 4, como no DANFE. */
export function formatAccessKey(raw: string | null | undefined): string {
  const k = (raw ?? '').replace(/\D/g, '');
  return k.length === 44 ? (k.match(/.{4}/g) ?? []).join(' ') : k;
}

/** "2,50" ou "2.50" → 2.5; inválido → NaN. A API só aceita ponto decimal. */
export function parseDecimal(text: string | number | null | undefined): number {
  if (typeof text === 'number') {
    return text;
  }
  const t = (text ?? '').trim();
  if (!t) {
    return Number.NaN;
  }
  const normalized = /,\d+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  return Number(normalized);
}

/** Coluna "volumes" da tabela: nota pesável mostra o peso; divergente leva o alerta. */
export function volumeLabel(i: {
  volumes: number;
  itemVolumes: number;
  grossWeight: number;
  volumeMismatch: boolean;
}): string {
  if (i.itemVolumes === 0 && i.grossWeight > 0 && i.volumes === 0) {
    return `${formatNumber(i.grossWeight, 3)} kg`;
  }
  return i.volumeMismatch ? `${i.volumes} ⚠` : String(i.volumes);
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'DANFE',
  upload: 'XML',
  ingestion: 'Ingestão',
};

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  reconciled: 'Reconciliada',
  discarded: 'Descartada',
};
