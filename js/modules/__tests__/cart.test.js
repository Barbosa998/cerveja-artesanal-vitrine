import { describe, it, expect } from 'vitest';
import { sanitizeCart, addItem, changeQty, removeItem, totalItems, totalPrice, MAX_QTY } from '../cart.js';

describe('sanitizeCart', () => {
    it('devolve lista vazia se não for um array', () => {
        expect(sanitizeCart(null)).toEqual([]);
        expect(sanitizeCart(undefined)).toEqual([]);
        expect(sanitizeCart('não é array')).toEqual([]);
        expect(sanitizeCart({ id: 'x' })).toEqual([]);
    });

    it('mantém só itens com o formato esperado', () => {
        const input = [
            { id: 'ipa', name: 'IPA', price: 10, qty: 2 },
            { id: 'stout', name: 'Stout', price: 'grátis', qty: 1 }, // preço inválido
            { id: 'pilsen', name: 'Pilsen', price: 10, qty: 0 },      // qty inválida
            { id: 123, name: 'Sem id string', price: 10, qty: 1 },    // id inválido
            null,
            { id: 'weiss', name: 'Weiss', price: -5, qty: 1 },        // preço negativo
            { id: 'sour', name: 'Sour', price: 20, qty: 1.5 }         // qty não inteira
        ];
        expect(sanitizeCart(input)).toEqual([{ id: 'ipa', name: 'IPA', price: 10, qty: 2 }]);
    });
});

describe('addItem', () => {
    const product = { id: 'ipa', name: 'IPA', price: 28.9 };

    it('adiciona um produto novo com a quantidade pedida', () => {
        const cart = addItem([], product, 2);
        expect(cart).toEqual([{ id: 'ipa', name: 'IPA', price: 28.9, qty: 2 }]);
    });

    it('soma a quantidade se o produto já estiver no carrinho', () => {
        const cart = addItem([{ id: 'ipa', name: 'IPA', price: 28.9, qty: 2 }], product, 3);
        expect(cart).toHaveLength(1);
        expect(cart[0].qty).toBe(5);
    });

    it('nunca passa do limite máximo', () => {
        const cart = addItem([{ id: 'ipa', name: 'IPA', price: 28.9, qty: MAX_QTY - 1 }], product, 5);
        expect(cart[0].qty).toBe(MAX_QTY);
    });

    it('não modifica o array original (imutável)', () => {
        const original = [];
        addItem(original, product, 1);
        expect(original).toEqual([]);
    });
});

describe('changeQty', () => {
    const cart = [{ id: 'ipa', name: 'IPA', price: 28.9, qty: 2 }];

    it('aumenta a quantidade', () => {
        expect(changeQty(cart, 'ipa', 1)[0].qty).toBe(3);
    });

    it('remove o item quando a quantidade chega a zero ou menos', () => {
        expect(changeQty(cart, 'ipa', -2)).toEqual([]);
        expect(changeQty(cart, 'ipa', -10)).toEqual([]);
    });

    it('ignora um id que não existe no carrinho', () => {
        expect(changeQty(cart, 'inexistente', 1)).toEqual(cart);
    });
});

describe('removeItem', () => {
    it('remove só o item pedido', () => {
        const cart = [
            { id: 'ipa', name: 'IPA', price: 28.9, qty: 1 },
            { id: 'stout', name: 'Stout', price: 26.5, qty: 1 }
        ];
        expect(removeItem(cart, 'ipa')).toEqual([{ id: 'stout', name: 'Stout', price: 26.5, qty: 1 }]);
    });
});

describe('totais', () => {
    const cart = [
        { id: 'ipa', name: 'IPA', price: 28.9, qty: 2 },
        { id: 'stout', name: 'Stout', price: 26.5, qty: 1 }
    ];

    it('totalItems soma as quantidades', () => {
        expect(totalItems(cart)).toBe(3);
    });

    it('totalPrice soma preço × quantidade', () => {
        expect(totalPrice(cart)).toBeCloseTo(28.9 * 2 + 26.5);
    });

    it('carrinho vazio dá zero', () => {
        expect(totalItems([])).toBe(0);
        expect(totalPrice([])).toBe(0);
    });
});
