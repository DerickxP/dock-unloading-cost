/**
 * Formatação pt-BR para tela, planilha e mensagens.
 */

const formatters = new Map<number, Intl.NumberFormat>();

function numberFormatter(places: number): Intl.NumberFormat {
  let f = formatters.get(places);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    });
    formatters.set(places, f);
  }
  return f;
}

/** 1234.5 → '1.234,50'. Ausente ou inválido vira zero. */
export function formatNumber(
  value: number | null | undefined,
  places = 2,
): string {
  const v = value != null && Number.isFinite(value) ? value : 0;
  return numberFormatter(places).format(v);
}

/** 'R$ 1.234,50' com espaço comum (o Intl usa espaço inseparável). */
export function formatBrl(value: number | null | undefined): string {
  return `R$ ${formatNumber(value, 2)}`;
}

export interface VolumeLabelInput {
  volumes: number;
  itemVolumes: number;
  grossWeight: number;
  volumeMismatch?: boolean;
}

/**
 * Coluna "volumes" do relatório. Nota pesável (nenhum item gera volume, mas
 * há peso) mostra o peso em kg; nota divergente leva o alerta.
 */
export function volumeLabel(invoice: VolumeLabelInput): string {
  if (invoice.itemVolumes === 0 && invoice.grossWeight > 0) {
    return formatNumber(invoice.grossWeight, 3);
  }
  return invoice.volumeMismatch
    ? `${invoice.volumes} ⚠`
    : String(invoice.volumes);
}

/** "1.234,5" → 1234.5; "12.5" → 12.5; vazio ou inválido → NaN. */
export function parseBrNumber(text: string): number {
  const t = text.trim();
  if (!t) {
    return Number.NaN;
  }
  const normalized = /,\d+$/.test(t)
    ? t.replace(/\./g, '').replace(',', '.')
    : t.replace(/,/g, '');
  return Number(normalized);
}
