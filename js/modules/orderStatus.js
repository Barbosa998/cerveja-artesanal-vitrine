/**
 * Máquina de estados do pedido — espelha exatamente o que a função
 * admin_set_order_status() valida no Postgres (supabase/schema_admin.sql).
 *
 * Importante: isto é só para a interface não oferecer opções que o
 * servidor vai recusar (melhor experiência). A autoridade de verdade é
 * sempre o banco — mesmo que alguém adultere este arquivo no navegador,
 * a função no Supabase recusa qualquer transição inválida.
 */

export const STATUS_LABELS = {
    aguardando_pagamento: 'Aguardando pagamento',
    pago: 'Pago',
    em_preparo: 'Em preparo',
    enviado: 'Enviado',
    entregue: 'Entregue',
    cancelado: 'Cancelado'
};

const NEXT_STATUS = {
    aguardando_pagamento: ['pago', 'cancelado'],
    pago: ['em_preparo', 'cancelado'],
    em_preparo: ['enviado', 'cancelado'],
    enviado: ['entregue'],
    entregue: [],
    cancelado: []
};

/** Quais status um pedido pode assumir a partir do status atual. */
export function nextAllowedStatuses(status) {
    return NEXT_STATUS[status] || [];
}

/** Se mudar de `from` para `to` é uma transição permitida (ou é o mesmo status). */
export function isValidTransition(from, to) {
    return from === to || nextAllowedStatuses(from).includes(to);
}

export function statusLabel(status) {
    return STATUS_LABELS[status] || status;
}
