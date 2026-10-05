import {
  choosePackaging,
  classifyUnit,
  computeItemVolumes,
  convertByPackaging,
} from '../../src/domain/volumes';

describe('classifyUnit', () => {
  it('medida contínua não gera volume', () => {
    expect(classifyUnit('KG', 35.4)).toEqual({
      kind: 'resolved',
      result: { volumes: 0, packagingUsed: 'KG', status: 'continuous' },
    });
    expect(classifyUnit('KG1', 10)).toMatchObject({
      result: { status: 'continuous' },
    });
  });

  it('embalagem física conta a quantidade', () => {
    expect(classifyUnit('CX12', 7)).toEqual({
      kind: 'resolved',
      result: { volumes: 7, packagingUsed: 'CX12', status: 'packaging' },
    });
  });

  it('unidade conhecida diferente de UN conta direto (truncando)', () => {
    expect(classifyUnit('BJ', 3.9)).toMatchObject({
      result: { volumes: 3, status: 'direct' },
    });
  });

  it('UN e unidade vazia precisam de conversão pelo cadastro', () => {
    expect(classifyUnit('UN', 24)).toEqual({ kind: 'needs_conversion' });
    expect(classifyUnit('UN1', 24)).toEqual({ kind: 'needs_conversion' });
    expect(classifyUnit('', 24)).toEqual({ kind: 'needs_conversion' });
  });
});

describe('convertByPackaging', () => {
  const box24 = { packaging: 'CX', unitsPerPackage: 24 };

  it('conta caixas fechadas', () => {
    expect(convertByPackaging(48, box24).volumes).toBe(2);
  });

  it('cada unidade solta é um volume, nunca truncar a sobra', () => {
    expect(convertByPackaging(1, box24).volumes).toBe(1);
    expect(convertByPackaging(50, box24)).toEqual({
      volumes: 4, // 2 caixas + 2 unidades soltas
      packagingUsed: 'CX',
      status: 'converted',
    });
  });

  it('sem cadastro, usa a quantidade bruta e sinaliza', () => {
    expect(convertByPackaging(12, null)).toEqual({
      volumes: 12,
      packagingUsed: 'UN*',
      status: 'uncataloged',
    });
  });

  it('embalagem com quantidade zero é tratada como sem cadastro', () => {
    expect(
      convertByPackaging(5, { packaging: 'CX', unitsPerPackage: 0 }).status,
    ).toBe('uncataloged');
  });
});

describe('computeItemVolumes', () => {
  it('só consulta o cadastro quando a unidade é UN', () => {
    const lookup = jest
      .fn()
      .mockReturnValue({ packaging: 'FD', unitsPerPackage: 6 });
    expect(
      computeItemVolumes({ unit: 'CX', quantity: 3 }, lookup).volumes,
    ).toBe(3);
    expect(lookup).not.toHaveBeenCalled();
    expect(
      computeItemVolumes({ unit: 'UN', quantity: 12 }, lookup).volumes,
    ).toBe(2);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});

describe('choosePackaging', () => {
  it('prefere a maior embalagem real (master pack)', () => {
    const options = [
      { packaging: 'UN', unitsPerPackage: 1 },
      { packaging: 'CX', unitsPerPackage: 6 },
      { packaging: 'CX', unitsPerPackage: 12 },
      { packaging: 'KG', unitsPerPackage: 50 },
    ];
    expect(choosePackaging(options)).toEqual({
      packaging: 'CX',
      unitsPerPackage: 12,
    });
  });

  it('só com UN/medida contínua, fica com a maior quantidade válida', () => {
    expect(
      choosePackaging([
        { packaging: 'UN', unitsPerPackage: 1 },
        { packaging: 'KG', unitsPerPackage: 5 },
      ]),
    ).toEqual({ packaging: 'KG', unitsPerPackage: 5 });
  });

  it('sem quantidade válida devolve a primeira; lista vazia devolve null', () => {
    const first = { packaging: 'CX', unitsPerPackage: 0 };
    expect(
      choosePackaging([first, { packaging: 'FD', unitsPerPackage: 0 }]),
    ).toBe(first);
    expect(choosePackaging([])).toBeNull();
  });
});
