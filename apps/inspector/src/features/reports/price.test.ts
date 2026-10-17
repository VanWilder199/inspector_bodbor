import { describe, expect, it } from 'vitest';
import { bynToKopecks, formatPriceByn, kopecksToByn, priceError, PRICE_MAX_BYN, PRICE_MIN_BYN } from './price';

describe('bynToKopecks', () => {
  it('«50» → 5000', () => expect(bynToKopecks('50')).toBe(5000));
  it('«49,90» → 4990 (запятая)', () => expect(bynToKopecks('49,90')).toBe(4990));
  it('«49.9» → 4990 (одна цифра дроби, точка)', () => expect(bynToKopecks('49.9')).toBe(4990));
  it('«0,05» → 5', () => expect(bynToKopecks('0,05')).toBe(5));
  it('пустая строка → null', () => expect(bynToKopecks('')).toBeNull());
  it('мусор → null', () => expect(bynToKopecks('abc')).toBeNull());
  it('три цифры дроби → null', () => expect(bynToKopecks('1,005')).toBeNull());
});

describe('kopecksToByn', () => {
  it('5000 → «50,00»', () => expect(kopecksToByn(5000)).toBe('50,00'));
  it('4990 → «49,90»', () => expect(kopecksToByn(4990)).toBe('49,90'));
  it('5 → «0,05»', () => expect(kopecksToByn(5)).toBe('0,05'));
});

describe('formatPriceByn', () => {
  it('4990 → «49,90 BYN»', () => expect(formatPriceByn(4990)).toBe('49,90 BYN'));
  it('null → «—»', () => expect(formatPriceByn(null)).toBe('—'));
});

describe('priceError', () => {
  it('ниже минимума — min', () => expect(priceError('0,50')).toBe('min'));
  it('ровно минимум — ок', () => expect(priceError(String(PRICE_MIN_BYN))).toBeNull());
  it('выше максимума — max', () => expect(priceError('1000001')).toBe('max'));
  it('не число — null (не ошибка)', () => expect(priceError('abc')).toBeNull());
  it('в диапазоне — ок', () => expect(priceError('12000')).toBeNull());
  void PRICE_MAX_BYN;
});