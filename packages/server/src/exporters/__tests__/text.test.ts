/**
 * Tests for the text exporters (CSV / TSV / JSON).
 * TDD: each test captures a real-world scenario a data analyst would hit.
 */
import { describe, it, expect } from 'vitest';
import { toCsv, toTsv, toJson, jsonRowsToObjects, suggestFilename } from '../text.js';

describe('toCsv', () => {
  it('produces a header row and one row per record', () => {
    const out = toCsv(
      ['name', 'age'],
      [
        ['Alice', 30],
        ['Bob', 25],
      ]
    );
    expect(out).toBe('name,age\nAlice,30\nBob,25');
  });

  it('quotes values containing commas', () => {
    const out = toCsv(['a'], [['x,y']]);
    expect(out).toBe('a\n"x,y"');
  });

  it('escapes embedded double quotes', () => {
    const out = toCsv(['a'], [[`he said "hi"`]]);
    expect(out).toBe('a\n"he said ""hi"""');
  });

  it('quotes values containing newlines', () => {
    const out = toCsv(['a'], [['line1\nline2']]);
    expect(out).toBe('a\n"line1\nline2"');
  });

  it('emits empty string for null/undefined', () => {
    const out = toCsv(['a', 'b'], [[null, undefined]]);
    expect(out).toBe('a,b\n,');
  });

  it('serialises objects via JSON.stringify', () => {
    const out = toCsv(['meta'], [[{ k: 'v' }]]);
    expect(out).toBe('meta\n"{""k"":""v""}"');
  });

  it('emits nothing when rows is empty', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b');
  });

  it('emits nothing when both are empty', () => {
    expect(toCsv([], [])).toBe('');
  });

  it('handles Booleans and numbers', () => {
    const out = toCsv(['flag', 'n'], [[true, 0]]);
    expect(out).toBe('flag,n\ntrue,0');
  });

  it('handles Chinese text without escaping (UTF-8 ok in csv)', () => {
    const out = toCsv(['城市'], [['北京']]);
    expect(out).toBe('城市\n北京');
  });

  it('refuses a row with the wrong column count (defensive)', () => {
    expect(() => toCsv(['a', 'b'], [['only-one']])).toThrow();
  });
});

describe('toTsv', () => {
  it('uses tab as separator and only escapes tabs/newlines', () => {
    const out = toTsv(['a', 'b'], [['x\ty', 'z\nw']]);
    expect(out).toBe('a\tb\n"x\ty"\t"z\nw"');
  });
});

describe('toJson and jsonRowsToObjects', () => {
  it('round-trips column-oriented → row-oriented JSON', () => {
    const objs = jsonRowsToObjects(
      ['name', 'age'],
      [
        ['Alice', 30],
        ['Bob', 25],
      ]
    );
    expect(objs).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
  });

  it('emits valid JSON via toJson', () => {
    const out = toJson(['a'], [[1]]);
    expect(JSON.parse(out)).toEqual([{ a: 1 }]);
  });

  it('emits [] for empty rows', () => {
    expect(JSON.parse(toJson(['a'], []))).toEqual([]);
  });

  it('handles Chinese keys/values', () => {
    const out = toJson(['城市'], [['北京']]);
    expect(JSON.parse(out)).toEqual([{ 城市: '北京' }]);
  });
});

describe('suggestFilename', () => {
  it('uses base + timestamp + extension', () => {
    const name = suggestFilename('orders', 'csv');
    expect(name).toMatch(/^orders-\d{8}-\d{6}\.csv$/);
  });

  it('sanitises unsafe characters in the base', () => {
    const name = suggestFilename('a/b c?.x', 'json');
    // a/b c?.x  →  a-b-c-x  (slashes, spaces, ?, . all collapse to dashes)
    expect(name).toMatch(/^a-b-c-x-\d{8}-\d{6}\.json$/);
  });

  it('falls back to "export" when base is empty', () => {
    const name = suggestFilename('', 'csv');
    expect(name).toMatch(/^export-\d{8}-\d{6}\.csv$/);
  });
});