import { fromStroops, toStroops, fmtAmount, fmtUsd, fmtPct, shortAddr } from '../format';

describe('stroops conversion', () => {
  it('converts stroops to a human number', () => {
    expect(fromStroops(10_000_000n)).toBe(1);
    expect(fromStroops(5_000_000n)).toBe(0.5);
  });

  it('parses a decimal string into stroops', () => {
    expect(toStroops('1')).toBe(10_000_000n);
    expect(toStroops('0.5')).toBe(5_000_000n);
    expect(toStroops('1.2345678')).toBe(12_345_678n);
  });

  it('truncates beyond 7 decimal places', () => {
    expect(toStroops('1.123456789')).toBe(11_234_567n);
  });

  it('returns 0 for empty or invalid input', () => {
    expect(toStroops('')).toBe(0n);
    expect(toStroops('abc')).toBe(0n);
  });

  it('round-trips a clean value', () => {
    expect(fromStroops(toStroops('42.5'))).toBe(42.5);
  });
});

describe('fmtAmount', () => {
  it('renders zero plainly', () => {
    expect(fmtAmount(0)).toBe('0');
  });

  it('collapses dust below the display threshold', () => {
    expect(fmtAmount(0.0000001)).toBe('<0.000001');
  });

  it('accepts bigint stroops directly', () => {
    expect(fmtAmount(10_000_000n)).toBe('1');
  });
});

describe('fmtUsd', () => {
  it('formats a normal dollar value', () => {
    expect(fmtUsd(1234.5)).toBe('$1,234.50');
  });

  it('collapses sub-cent values', () => {
    expect(fmtUsd(0.001)).toBe('<$0.01');
  });

  it('guards against non-finite input', () => {
    expect(fmtUsd(Infinity)).toBe('$0.00');
  });
});

describe('fmtPct', () => {
  it('formats a 0..1 fraction as a percentage', () => {
    expect(fmtPct(0.0123)).toBe('1.23%');
  });
});

describe('shortAddr', () => {
  it('shortens a Stellar address with an ellipsis', () => {
    expect(shortAddr('GAVFAXLV54GY7M4WZYIZQGP5NFRAJOUQA2LA4UDDUWVJCOIEPEMKYNQG')).toBe('GAVF…YNQG');
  });

  it('returns an empty string for missing input', () => {
    expect(shortAddr('')).toBe('');
  });
});
