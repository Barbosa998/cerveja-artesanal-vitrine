import { describe, it, expect } from 'vitest';
import { findCouponRate, calculateDiscount, calculateFinalPrice } from '../coupons.js';

const COUPONS = { BEMVINDO10: 0.10, MARINGA15: 0.15 };

describe('findCouponRate', () => {
    it('encontra um cupom válido, ignorando maiúsculas/minúsculas e espaços', () => {
        expect(findCouponRate('bemvindo10', COUPONS)).toBe(0.10);
        expect(findCouponRate('  MARINGA15  ', COUPONS)).toBe(0.15);
    });

    it('devolve null para cupom inexistente ou vazio', () => {
        expect(findCouponRate('NAO-EXISTE', COUPONS)).toBeNull();
        expect(findCouponRate('', COUPONS)).toBeNull();
        expect(findCouponRate(null, COUPONS)).toBeNull();
    });

    it('não deixa usar propriedades herdadas do Object como cupom', () => {
        // "toString", "constructor" etc. não são cupons válidos
        expect(findCouponRate('TOSTRING', COUPONS)).toBeNull();
        expect(findCouponRate('CONSTRUCTOR', COUPONS)).toBeNull();
    });
});

describe('calculateDiscount', () => {
    it('calcula a porcentagem sobre o subtotal', () => {
        expect(calculateDiscount(100, 0.10)).toBeCloseTo(10);
    });

    it('é zero sem taxa (cupom não aplicado)', () => {
        expect(calculateDiscount(100, null)).toBe(0);
        expect(calculateDiscount(100, 0)).toBe(0);
        expect(calculateDiscount(100, undefined)).toBe(0);
    });
});

describe('calculateFinalPrice', () => {
    it('subtrai o desconto do subtotal', () => {
        expect(calculateFinalPrice(100, 10)).toBe(90);
    });

    it('nunca fica negativo, mesmo com desconto maior que o subtotal', () => {
        expect(calculateFinalPrice(10, 50)).toBe(0);
    });
});
