/**
 * Arredondamento explícito de valores em reais e de pesos em kg.
 *
 * O mesmo número vai para a tela, para o JSON e para a planilha, onde alguém
 * soma a coluna; então a soma das linhas precisa fechar com o total.
 * `Math.round(v * 100) / 100` erra no meio (2.675 é 2.67499… em binário). Mover
 * a vírgula pela notação exponencial da string preserva o decimal "humano" e o
 * meio sobe (arredondamento comercial, afastando do zero nos negativos).
 */
function roundTo(value: number | null | undefined, places: number): number {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const text = abs.toString();
  let rounded: number;
  if (text.includes('e')) {
    // Já está em notação exponencial: o truque da string não se aplica.
    rounded = Math.round(abs * 10 ** places) / 10 ** places;
  } else {
    rounded = Number(`${Math.round(Number(`${text}e${places}`))}e-${places}`);
  }
  const result = sign * rounded;
  return result === 0 ? 0 : result;
}

/** Duas casas (reais). */
export const round2 = (value: number | null | undefined): number =>
  roundTo(value, 2);

/** Três casas (kg, mesma precisão do pesoB da NF-e). */
export const round3 = (value: number | null | undefined): number =>
  roundTo(value, 3);
