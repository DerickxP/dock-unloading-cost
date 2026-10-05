import {
  extractDanfePage,
  extractDanfes,
  formatInvoiceNumber,
} from '../../src/domain/danfe-text';
import { formatCnpj } from '../../src/domain/cnpj';
import { CARRIER, STORE, danfePages, danfeSpec } from '../support/danfe';

describe('extractDanfePage', () => {
  it('extrai cabeçalho, destinatário, transporte, totais e itens de uma folha', () => {
    const spec = danfeSpec();
    const page = extractDanfePage(danfePages(spec)[0]);
    expect(page.kind).toBe('invoice');
    if (page.kind !== 'invoice') {
      return;
    }
    expect(page.itemsSuspicious).toBe(false);
    expect(page.invoice).toMatchObject({
      accessKey: spec.accessKey,
      number: '1234',
      series: '1',
      issuerCnpj: spec.issuerCnpj,
      issuerName: 'FORNECEDOR FICTICIO LTDA',
      recipientCnpj: STORE,
      recipientName: 'LOJA EXEMPLO CENTRO LTDA',
      issueDate: '2026-07-15', // a menor data da competência (a saída é 16/07)
      carrierVolumes: 4,
      species: 'CAIXAS',
      grossWeight: 150.5,
      netWeight: 140,
      productsValue: 400.55,
      totalValue: 432.59,
      warnings: [],
    });
    expect(page.invoice.items).toEqual(spec.items);
  });

  it('o número impresso como 000.001.234 satisfaz a validação cruzada', () => {
    expect(formatInvoiceNumber(1234)).toBe('000.001.234');
    expect(danfePages(danfeSpec())[0]).toContain('Nº 000.001.234');
  });

  it.each([
    [
      'sem chave',
      (t: string) => t.replace(/\d{4}( \d{4}){10}/, 'CHAVE ILEGIVEL'),
      /nenhuma chave/,
    ],
    [
      'duas chaves',
      (t: string) => t + '\n' + '1'.repeat(44),
      /mais de uma chave/,
    ],
    [
      'DV errado',
      (t: string) =>
        t.replace(
          /(\d{4}( \d{4}){10})/,
          (k) => k.slice(0, -1) + (k.endsWith('0') ? '1' : '0'),
        ),
      /dígito verificador/,
    ],
    [
      'número não impresso',
      (t: string) => t.replace('Nº 000.001.234', 'Nº ---'),
      /número da nota/,
    ],
    [
      'CNPJ do emitente não impresso',
      (t: string) =>
        t.replace(`CNPJ: ${formatCnpj(danfeSpec().issuerCnpj)}`, 'CNPJ: ---'),
      /CNPJ do emitente/,
    ],
    [
      'nenhuma data na competência',
      (t: string) => t.replace(/\/07\/2026/g, '/08/2026'),
      /competência/,
    ],
    [
      'sem bloco de transporte',
      (t: string) => t.replace(/QUANTIDADE: .*\n/, ''),
      /volumes transportados/,
    ],
  ])('rejeita a página: %s', (_label, mutate, reason) => {
    const page = extractDanfePage(mutate(danfePages(danfeSpec())[0]));
    expect(page.kind).toBe('invalid');
    expect((page as { reason: string }).reason).toMatch(reason);
  });

  it('destinatário: com transportadora impressa, o rótulo CNPJ/CPF decide; sem rótulo, a lista de lojas conhecidas', () => {
    const text = danfePages(danfeSpec())[0];
    expect(
      (extractDanfePage(text) as { invoice: { recipientCnpj: string } }).invoice
        .recipientCnpj,
    ).toBe(STORE);

    const noLabel = text.replace('CNPJ/CPF: ', 'DOCUMENTO: ');
    expect(extractDanfePage(noLabel)).toMatchObject({
      kind: 'invalid',
      reason: expect.stringMatching(/2 CNPJs candidatos/),
    });
    expect(extractDanfePage(noLabel, new Set([STORE]))).toMatchObject({
      kind: 'invoice',
      invoice: { recipientCnpj: STORE },
    });
    expect(extractDanfePage(noLabel, new Set([STORE, CARRIER]))).toMatchObject({
      kind: 'invalid',
    });
  });

  it('sem transportadora impressa, o único CNPJ que não é o emitente é o destinatário', () => {
    const text = danfePages(
      danfeSpec({ carrierName: undefined, carrierCnpj: undefined }),
    )[0].replace('CNPJ/CPF: ', 'DOC: ');
    expect(extractDanfePage(text)).toMatchObject({
      kind: 'invoice',
      invoice: { recipientCnpj: STORE },
    });
  });

  it('totais ausentes viram avisos, não rejeição', () => {
    const text = danfePages(danfeSpec())[0]
      .replace(/VALOR TOTAL DOS PRODUTOS: .*\n/, '')
      .replace(/VALOR TOTAL DA NOTA: .*\n/, '');
    const page = extractDanfePage(text);
    expect(page).toMatchObject({
      kind: 'invoice',
      invoice: { productsValue: 0, totalValue: 0 },
    });
    expect(
      (page as { invoice: { warnings: string[] } }).invoice.warnings,
    ).toHaveLength(2);
  });

  it('item que não fecha quantidade × unitário marca os itens como suspeitos', () => {
    const text = danfePages(danfeSpec())[0].replace('119,52', '119,99');
    expect(extractDanfePage(text)).toMatchObject({
      kind: 'invoice',
      itemsSuspicious: true,
    });
  });

  it('linha estranha dentro da tabela de itens também marca suspeita', () => {
    const text = danfePages(danfeSpec())[0] + '\nLINHA QUE NAO E ITEM';
    expect(extractDanfePage(text)).toMatchObject({
      kind: 'invoice',
      itemsSuspicious: true,
    });
  });

  it('folha 2 de N é continuação com os itens dela', () => {
    const pages = danfePages(danfeSpec(), { itemsPerPage: 1 });
    expect(pages).toHaveLength(2);
    const second = extractDanfePage(pages[1]);
    expect(second).toMatchObject({
      kind: 'continuation',
      itemsSuspicious: false,
    });
    expect((second as { items: unknown[] }).items).toHaveLength(2);
  });
});

describe('extractDanfes (arquivo inteiro)', () => {
  it('agrega as folhas de uma nota pela chave e a prova da soma fecha', () => {
    const spec = danfeSpec();
    const { invoices, invalid } = extractDanfes(
      danfePages(spec, { itemsPerPage: 1 }),
    );
    expect(invalid).toEqual([]);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].items).toEqual(spec.items);
    expect(invoices[0].pages).toEqual([1, 2]);
  });

  it('vários DANFEs no mesmo arquivo viram várias notas', () => {
    const pages = [
      ...danfePages(danfeSpec({ number: 1 })),
      ...danfePages(danfeSpec({ number: 2 })),
    ];
    const { invoices } = extractDanfes(pages);
    expect(invoices.map((i) => i.number)).toEqual(['1', '2']);
  });

  it('soma dos itens diferente do total dos produtos: nota entra sem itens, com aviso', () => {
    const { invoices } = extractDanfes(
      danfePages(danfeSpec({ productsValue: 999.99 })),
    );
    expect(invoices[0].items).toEqual([]);
    expect(invoices[0].warnings.join(' ')).toMatch(/conferência aritmética/);
  });

  it('item suspeito em qualquer folha derruba os itens da nota inteira', () => {
    const pages = danfePages(danfeSpec(), { itemsPerPage: 1 });
    pages[1] = pages[1].replace('73,63', '73,00');
    const { invoices } = extractDanfes(pages);
    expect(invoices[0].items).toEqual([]);
  });

  it('total dos produtos não impresso: itens não podem ser conferidos', () => {
    const pages = danfePages(danfeSpec()).map((p) =>
      p.replace(/VALOR TOTAL DOS PRODUTOS: .*\n/, ''),
    );
    const { invoices } = extractDanfes(pages);
    expect(invoices[0].items).toEqual([]);
    expect(invoices[0].warnings).toHaveLength(2);
  });

  it('DANFE repetido e continuação órfã são páginas inválidas com motivo', () => {
    const [first, second] = danfePages(danfeSpec(), { itemsPerPage: 1 });
    const { invoices, invalid } = extractDanfes([
      first,
      first,
      second.replace(/\d{4}( \d{4}){10}/, '1'.repeat(44)),
    ]);
    expect(invoices).toHaveLength(1);
    expect(invalid).toEqual([
      { page: 2, reason: 'DANFE repetido no mesmo arquivo' },
      {
        page: 3,
        reason: expect.stringMatching(/dígito verificador|continuação/),
      },
    ]);
  });

  it('continuação antes da primeira folha ainda é agregada', () => {
    const [first, second] = danfePages(danfeSpec(), { itemsPerPage: 1 });
    const { invoices, invalid } = extractDanfes([second, first]);
    expect(invalid).toEqual([]);
    expect(invoices[0].items).toHaveLength(3);
    expect(invoices[0].pages).toEqual([1, 2]);
  });

  it('página em branco ou de outro documento é inválida sem derrubar as demais', () => {
    const { invoices, invalid } = extractDanfes([
      ...danfePages(danfeSpec()),
      'RECIBO DE ENTREGA\nnada a ver',
    ]);
    expect(invoices).toHaveLength(1);
    expect(invalid).toEqual([
      { page: 2, reason: 'nenhuma chave de acesso de 44 dígitos na página' },
    ]);
  });
});
