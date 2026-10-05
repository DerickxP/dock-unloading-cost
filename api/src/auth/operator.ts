/**
 * Quem está operando: header opcional `x-operator` (nome ou e-mail), gravado
 * em createdBy/updatedBy e no rodapé da planilha. Sem SSO, é informativo.
 */
export const OPERATOR_HEADER = 'x-operator';
const OPERATOR_MAX = 100;

export function operatorFrom(
  header: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  const value = (raw ?? '').trim().slice(0, OPERATOR_MAX);
  return value || undefined;
}
