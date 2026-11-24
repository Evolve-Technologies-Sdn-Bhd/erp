import { readGuideValues } from './guide-values.rules';

describe('the words of a company’s guides', () => {
  it('keeps the words of each guide', () => {
    expect(readGuideValues({ common: { agent: 'AG1' }, 'guide.field-sales.a': { voucher: 'V-1001' } })).toEqual({
      common: { agent: 'AG1' },
      'guide.field-sales.a': { voucher: 'V-1001' },
    });
  });

  it('leaves out anything that is not a short word', () => {
    expect(readGuideValues({ common: { agent: 1, 'bad name': 'x', long: 'x'.repeat(201), ok: 'yes' }, list: ['a'], text: 'a', none: {} })).toEqual({ common: { ok: 'yes' } });
    for (const v of [null, undefined, 'a', ['a'], 3]) expect(readGuideValues(v)).toEqual({});
  });
});
