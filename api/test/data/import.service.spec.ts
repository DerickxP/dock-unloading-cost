/**
 * ImportService (Prisma mockado, cadastro em memória): o upload de XML é a
 * entrada de notas com itens, então é aqui que a cascata trabalha.
 */
import type { CatalogService } from '../../src/catalog/catalog.service';
import { InMemoryCatalog } from '../../src/domain/catalog';
import { ImportService } from '../../src/invoices/import.service';
import { buildAccessKey } from '../support/factories';
import { buildNfeXml, ISSUER_CNPJ, RECIPIENT_CNPJ } from '../support/nfe-xml';
import { asPrisma, prismaMock } from '../support/prisma-mock';

const KEY = buildAccessKey({ number: 1001, cnpj: ISSUER_CNPJ });

function catalog(): CatalogService {
  const c = new InMemoryCatalog();
  c.add({
    ean: '7890000000017',
    code: '1001',
    name: 'BISCOITO 140G',
    packaging: 'CX',
    unitsPerPackage: 24,
  });
  return c as unknown as CatalogService;
}

const file = (name: string, xml: string) => ({
  name,
  bytes: Buffer.from(xml, 'utf-8'),
});

const MANUAL = {
  accessKey: KEY,
  number: '1001',
  series: '1',
  issueDate: new Date('2026-07-15T00:00:00Z'),
  issuerCnpj: ISSUER_CNPJ,
  issuerName: 'FORNECEDOR',
  recipientCnpj: RECIPIENT_CNPJ,
  recipientName: 'LOJA',
  carrierVolumes: 8,
  grossWeight: 0,
  volumes: 8,
  source: 'manual',
  status: 'pending',
  note: 'digitada na doca',
};

describe('ImportService.importXml', () => {
  it('nota nova entra confirmada, com itens convertidos pela cascata e snapshot', async () => {
    const mock = prismaMock();
    const svc = new ImportService(asPrisma(mock), catalog());

    const report = await svc.importXml(
      [
        file(
          'nota.xml',
          buildNfeXml({
            qVol: '4',
            pesoB: '150.500',
            items: [
              {
                cEAN: '7890000000017',
                cProd: '1001',
                xProd: 'BISCOITO 140G',
                uCom: 'UN',
                qCom: '50',
                vProd: '100.00',
              },
              {
                cEAN: '',
                cProd: 'Z',
                xProd: 'TOMATE',
                uCom: 'KG',
                qCom: '30',
                vProd: '90.00',
              },
            ],
          }),
        ),
      ],
      'doca',
    );

    expect(report).toMatchObject({
      imported: 1,
      reconciled: 0,
      updated: 0,
      errors: 0,
    });
    expect(report.results[0]).toMatchObject({
      status: 'imported',
      accessKey: KEY,
      number: '1001',
    });

    const data = mock.invoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      accessKey: KEY,
      source: 'upload',
      status: 'confirmed',
      createdBy: 'doca',
      carrierVolumes: 4,
      volumes: 4,
      itemVolumes: 4, // 2 caixas + 2 soltas
      itemsWeight: 30,
      volumeMismatch: false,
      grossWeight: 150.5,
      species: 'CAIXAS',
    });
    expect(data.items.create).toEqual([
      expect.objectContaining({
        seq: 1,
        volumes: 4,
        packagingUsed: 'CX',
        status: 'converted',
      }),
      expect.objectContaining({
        seq: 2,
        volumes: 0,
        packagingUsed: 'KG',
        status: 'continuous',
      }),
    ]);
  });

  it('nota manual pendente é reconciliada: XML manda, observação fica, diferença vira aviso', async () => {
    const mock = prismaMock();
    mock.invoice.findUnique.mockResolvedValueOnce(MANUAL);
    const svc = new ImportService(asPrisma(mock), catalog());

    const report = await svc.importXml(
      [file('nota.xml', buildNfeXml({ qVol: '10' }))],
      'doca',
    );
    expect(report.reconciled).toBe(1);
    expect(report.results[0].warnings.map((w) => w.code)).toContain(
      'RECONCILED_WITH_DIFFERENCE',
    );

    const update = mock.invoice.update.mock.calls[0][0];
    expect(update.where).toEqual({ accessKey: KEY });
    expect(update.data).toMatchObject({
      status: 'reconciled',
      updatedBy: 'doca',
      volumes: 10,
    });
    expect(update.data.reconciledAt).toBeInstanceOf(Date);
    expect(update.data).not.toHaveProperty('note');
    expect(update.data).not.toHaveProperty('source');
    expect(update.data.items).toEqual({
      deleteMany: {},
      create: expect.any(Array),
    });
  });

  it('nota manual descartada volta à cobrança quando o XML chega', async () => {
    const mock = prismaMock();
    // Digitado igual ao XML (5 CX = 5 volumes, 150,5 kg): reconcilia sem avisos.
    mock.invoice.findUnique.mockResolvedValueOnce({
      ...MANUAL,
      status: 'discarded',
      carrierVolumes: 5,
      volumes: 5,
      grossWeight: 150.5,
    });
    const report = await new ImportService(asPrisma(mock), catalog()).importXml(
      [file('n.xml', buildNfeXml({ qVol: '5' }))],
    );
    expect(report.results[0].status).toBe('reconciled');
    expect(report.results[0].warnings).toEqual([]);
  });

  it('re-upload de nota já importada atualiza, nunca duplica', async () => {
    const mock = prismaMock();
    mock.invoice.findUnique.mockResolvedValueOnce({
      ...MANUAL,
      source: 'upload',
      status: 'confirmed',
    });
    const report = await new ImportService(asPrisma(mock), catalog()).importXml(
      [file('n.xml', buildNfeXml())],
    );
    expect(report.updated).toBe(1);
    expect(mock.invoice.create).not.toHaveBeenCalled();
    expect(mock.invoice.update.mock.calls[0][0].data).not.toHaveProperty(
      'status',
    );
  });

  it('arquivo ruim entra como erro e o resto do lote segue', async () => {
    const mock = prismaMock();
    const badKey = KEY.slice(0, 43) + (KEY[43] === '0' ? '1' : '0');
    const report = await new ImportService(asPrisma(mock), catalog()).importXml(
      [
        file('lixo.xml', '<html>não é nota</html>'),
        file('dv.xml', buildNfeXml({ accessKey: badKey })),
        file('semdata.xml', buildNfeXml({ dhEmi: null })),
        file('ok.xml', buildNfeXml()),
      ],
    );
    expect(report).toMatchObject({ imported: 1, errors: 3 });
    expect(report.results.map((r) => r.status)).toEqual([
      'error',
      'error',
      'error',
      'imported',
    ]);
    expect(report.results[1].reason).toMatch(/dígito verificador/);
  });

  it('divergência de volumes e item sem cadastro viram avisos da nota', async () => {
    const mock = prismaMock();
    const report = await new ImportService(asPrisma(mock), catalog()).importXml(
      [
        file(
          'n.xml',
          buildNfeXml({
            qVol: '9',
            items: [
              {
                cEAN: '',
                cProd: 'N1',
                xProd: 'ITEM NOVO',
                uCom: 'UN',
                qCom: '3',
                vProd: '1',
              },
              {
                cEAN: '',
                cProd: 'C1',
                xProd: 'CAIXA',
                uCom: 'CX',
                qCom: '2',
                vProd: '1',
              },
            ],
          }),
        ),
      ],
    );
    expect(report.results[0].warnings.map((w) => w.code)).toEqual([
      'VOLUME_MISMATCH',
      'UNCATALOGED_ITEMS',
    ]);
    expect(mock.invoice.create.mock.calls[0][0].data).toMatchObject({
      volumes: 9,
      itemVolumes: 5,
      volumeMismatch: true,
    });
  });
});
