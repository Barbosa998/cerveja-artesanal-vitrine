/**
 * Regras do carrinho de compras — funções puras, sem DOM e sem localStorage,
 * para serem fáceis de testar (ver js/modules/__tests__/cart.test.js).
 *
 * Um item de carrinho é sempre: { id: string, name: string, price: number, qty: number }
 */

export const MAX_QTY = 99;

/**
 * Valida e filtra uma lista de itens vinda de fora (ex.: JSON.parse do
 * localStorage, que pode ter sido adulterado). Descarta qualquer item que
 * não tenha exatamente o formato esperado.
 * @param {unknown} parsed
 * @returns {Array<{id: string, name: string, price: number, qty: number}>}
 */
export function sanitizeCart(parsed) {
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        Number.isFinite(item.price) &&
        item.price >= 0 &&
        Number.isInteger(item.qty) &&
        item.qty > 0
    );
}

/**
 * Adiciona um produto ao carrinho (ou soma a quantidade, se já existir),
 * sempre respeitando o limite máximo. Não modifica o array recebido.
 * @param {Array} cart
 * @param {{id: string, name: string, price: number}} product
 * @param {number} qty
 * @param {number} maxQty
 */
export function addItem(cart, product, qty = 1, maxQty = MAX_QTY) {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
        return cart.map((item) =>
            item.id === product.id
                ? { ...item, qty: Math.min(item.qty + qty, maxQty) }
                : item
        );
    }
    return [...cart, { ...product, qty: Math.min(qty, maxQty) }];
}

/**
 * Muda a quantidade de um item em `delta` (positivo ou negativo). Remove o
 * item se a quantidade chegar a zero ou menos.
 */
export function changeQty(cart, id, delta, maxQty = MAX_QTY) {
    return cart
        .map((item) => (item.id === id ? { ...item, qty: Math.min(item.qty + delta, maxQty) } : item))
        .filter((item) => item.qty > 0);
}

export function removeItem(cart, id) {
    return cart.filter((item) => item.id !== id);
}

/** Soma das quantidades de todos os itens. */
export function totalItems(cart) {
    return cart.reduce((sum, item) => sum + item.qty, 0);
}

/** Soma de preço × quantidade de todos os itens (sem desconto). */
export function totalPrice(cart) {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}
