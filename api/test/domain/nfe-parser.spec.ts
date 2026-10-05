import {
  cleanSpecies,
  decodeXml,
  detectEncoding,
  parseNfe,
} from '../../src/domain/nfe-parser';
import { buildAccessKey } from '../support/factories';
import { buildNfeXml, ISSUER_CNPJ, RECIPIENT_CNPJ } from '../support/nfe-xml';

describe('parseNfe', () => {
  it('extrai cabeçalho, totais, transporte e itens', () => {
    const inv = parseNfe(buildNfeXml())!;
    expect(inv).toMatchObject({
      number: '1001',
      series: '1',
      issueDate: '2026-07-15',
      issuerCnpj: ISSUER_CNPJ,
      issuerName: 'FORNECEDOR FICTICIO LTDA',
      recipientCnpj: RECIPIENT_CNPJ,
      totalValue: 1000,
      productsValue: 900,
      species: 'CAIXAS',
      carrierVolumes: 10,
      grossWeight: 150.5,
      netWeight: 140,
    });
    expect(inv.accessKey).toBe(
      buildAccessKey({ number: 1001, cnpj: ISSUER_CNPJ }),
    );
    expect(inv.items).toEqual([
      {
        ean: '7890000000017',
        code: '1001',
        description: 'BISCOITO 140G',
        unit: 'CX',
        quantity: 5,
        value: 100,
      },
    ]);
  });

  it('não calcula volumes: isso é do recálculo', () => {
    const inv = parseNfe(buildNfeXml())!;
    expect(inv.volumes).toBeUndefined();
    expect(inv.itemVolumes).toBeUndefined();
  });

  it('aceita tags com prefixo de namespace', () => {
    const inv = parseNfe(buildNfeXml({ prefix: 'nfe' }))!;
    expect(inv.number).toBe('1001');
    expect(inv.items).toHaveLength(1);
  });

  it('sem protocolo, a chave sai do Id do infNFe', () => {
    const key = buildAccessKey({ number: 77 });
    const inv = parseNfe(buildNfeXml({ withProtocol: false, accessKey: key }))!;
    expect(inv.accessKey).toBe(key);
  });

  it('código de produto com zeros à esquerda continua texto', () => {
    const inv = parseNfe(
      buildNfeXml({
        items: [
          {
            cEAN: '00012345678905',
            cProd: '000123',
            xProd: 'X',
            uCom: 'UN',
            qCom: '1',
            vProd: '1',
          },
        ],
      }),
    )!;
    expect(inv.items[0].code).toBe('000123');
    expect(inv.items[0].ean).toBe('00012345678905');
  });

  it('série ausente vale 1 e dEmi é o fallback de dhEmi', () => {
    const inv = parseNfe(
      buildNfeXml({ series: null, dhEmi: null, dEmi: '2026-07-01' }),
    )!;
    expect(inv.series).toBe('1');
    expect(inv.issueDate).toBe('2026-07-01');
  });

  it('destinatário pessoa física usa o CPF', () => {
    const inv = parseNfe(
      buildNfeXml({ recipientCnpj: null, recipientCpf: '12345678909' }),
    )!;
    expect(inv.recipientCnpj).toBe('12345678909');
  });

  it('espécie fica com a primeira palavra; ausente vira UN', () => {
    expect(parseNfe(buildNfeXml({ esp: 'volumes 110.415 m3' }))!.species).toBe(
      'VOLUMES',
    );
    expect(parseNfe(buildNfeXml({ esp: null }))!.species).toBe('UN');
  });

  it('com vários <vol>, vale o primeiro', () => {
    const inv = parseNfe(
      buildNfeXml({
        extraVolumes: [{ qVol: '99', esp: 'FARDOS', pesoB: '9', pesoL: '9' }],
      }),
    )!;
    expect(inv.carrierVolumes).toBe(10);
    expect(inv.species).toBe('CAIXAS');
  });

  it('qVol fracionado e números inválidos', () => {
    const inv = parseNfe(buildNfeXml({ qVol: '10.0', pesoB: 'abc' }))!;
    expect(inv.carrierVolumes).toBe(10);
    expect(inv.grossWeight).toBe(0);
  });

  it('total de produtos sai do ICMSTot, não do vProd dos itens', () => {
    expect(parseNfe(buildNfeXml({ vProd: '900.00' }))!.productsValue).toBe(900);
  });

  it('XML sem número, sem chave ou malformado devolve null', () => {
    expect(parseNfe(buildNfeXml({ number: '' }))).toBeNull();
    expect(
      parseNfe(buildNfeXml({ withProtocol: false, accessKey: '123' })),
    ).toBeNull();
    expect(parseNfe('<nfeProc><NFe>')).toBeNull();
    expect(parseNfe('<raiz/>')).toBeNull();
  });
});

describe('encoding', () => {
  it('ISO-8859-1 declarado preserva acentos', () => {
    const xml = buildNfeXml({
      encoding: 'ISO-8859-1',
      issuerName: 'AÇOUGUE SÃO JOSÉ LTDA',
    });
    const raw = Buffer.from(xml, 'latin1');
    expect(detectEncoding(raw)).toBe('iso-8859-1');
    expect(parseNfe(decodeXml(raw))!.issuerName).toBe('AÇOUGUE SÃO JOSÉ LTDA');
  });

  it('BOM UTF-8 vence a declaração', () => {
    const xml = buildNfeXml({
      encoding: 'ISO-8859-1',
      issuerName: 'CAFÉ LTDA',
    });
    const raw = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(xml, 'utf-8'),
    ]);
    expect(detectEncoding(raw)).toBe('utf-8');
    expect(parseNfe(decodeXml(raw))!.issuerName).toBe('CAFÉ LTDA');
  });

  it('encoding desconhecido cai em UTF-8', () => {
    const raw = Buffer.from(
      buildNfeXml({ encoding: 'X-INEXISTENTE' }),
      'utf-8',
    );
    expect(parseNfe(decodeXml(raw))).not.toBeNull();
  });
});

describe('cleanSpecies', () => {
  it.each([
    ['caixas', 'CAIXAS'],
    ['VOLUMES 110.415 m3', 'VOLUMES'],
    ['', 'UN'],
    ['  ', 'UN'],
  ])('%p → %p', (raw, expected) => {
    expect(cleanSpecies(raw)).toBe(expected);
  });
});
