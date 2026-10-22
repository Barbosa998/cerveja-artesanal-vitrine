/**
 * Regras de cupom de desconto — funções puras (ver
 * js/modules/__tests__/coupons.test.js).
 *
 * Lembrete de segurança (já no README): o cupom aplicado no navegador é só
 * uma simulação para o cliente ver o valor. O desconto real é recalculado
 * no servidor, dentro da função criar_pedido() do Supabase — o cliente não
 * consegue se dar um desconto fajuto só adulterando o JS.
 */

/**
 * Procura um cupom pelo código (sempre maiúsculo) no mapa de cupons
 * disponíveis. Retorna a taxa (ex.: 0.10 = 10%) ou null se não existir.
 * @param {string} code
 * @param {Record<string, number>} coupons
 * @returns {number | null}
 */
export function findCouponRate(code, coupons) {
    if (!code) return null;
    const normalized = code.trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(coupons, normalized) ? coupons[normalized] : null;
}

/** Valor do desconto para um subtotal e uma taxa (0 se não houver cupom). */
export function calculateDiscount(subtotal, rate) {
    if (!rate || rate <= 0) return 0;
    return subtotal * rate;
}

/** Total final, nunca negativo. */
export function calculateFinalPrice(subtotal, discount) {
    return Math.max(0, subtotal - discount);
}
