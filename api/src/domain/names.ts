/**
 * Chave de comparação de nomes de produto tolerante a ordem e pontuação.
 *
 * Cada fornecedor escreve o mesmo produto do seu jeito ("BISCOITO RECHEADO
 * CHOCOLATE 140G" e "BISCOITO 140G RECHEADO - CHOCOLATE"). Maiúsculas, sem
 * acento, só letras/dígitos e tokens ordenados viram a mesma chave.
 */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}
