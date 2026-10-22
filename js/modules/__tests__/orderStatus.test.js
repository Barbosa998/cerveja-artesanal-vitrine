import { describe, it, expect } from 'vitest';
import { nextAllowedStatuses, isValidTransition, statusLabel } from '../orderStatus.js';

describe('nextAllowedStatuses', () => {
    it('segue a ordem normal do pedido', () => {
        expect(nextAllowedStatuses('aguardando_pagamento')).toEqual(['pago', 'cancelado']);
        expect(nextAllowedStatuses('pago')).toEqual(['em_preparo', 'cancelado']);
        expect(nextAllowedStatuses('em_preparo')).toEqual(['enviado', 'cancelado']);
        expect(nextAllowedStatuses('enviado')).toEqual(['entregue']);
    });

    it('estados finais não têm próximo passo (nem para cancelar)', () => {
        expect(nextAllowedStatuses('entregue')).toEqual([]);
        expect(nextAllowedStatuses('cancelado')).toEqual([]);
    });

    it('status desconhecido não quebra, só devolve lista vazia', () => {
        expect(nextAllowedStatuses('nao_existe')).toEqual([]);
    });
});

describe('isValidTransition', () => {
    it('permite ficar no mesmo status (ex.: só corrigir o rastreio)', () => {
        expect(isValidTransition('enviado', 'enviado')).toBe(true);
    });

    it('permite avançar na ordem certa', () => {
        expect(isValidTransition('aguardando_pagamento', 'pago')).toBe(true);
        expect(isValidTransition('em_preparo', 'enviado')).toBe(true);
    });

    it('permite cancelar enquanto não foi enviado', () => {
        expect(isValidTransition('aguardando_pagamento', 'cancelado')).toBe(true);
        expect(isValidTransition('pago', 'cancelado')).toBe(true);
        expect(isValidTransition('em_preparo', 'cancelado')).toBe(true);
    });

    it('recusa pular etapas', () => {
        expect(isValidTransition('aguardando_pagamento', 'enviado')).toBe(false);
        expect(isValidTransition('aguardando_pagamento', 'entregue')).toBe(false);
    });

    it('recusa cancelar depois de enviado', () => {
        expect(isValidTransition('enviado', 'cancelado')).toBe(false);
        expect(isValidTransition('entregue', 'cancelado')).toBe(false);
    });

    it('recusa andar para trás', () => {
        expect(isValidTransition('pago', 'aguardando_pagamento')).toBe(false);
        expect(isValidTransition('entregue', 'enviado')).toBe(false);
    });

    it('recusa qualquer mudança a partir de um estado final', () => {
        expect(isValidTransition('entregue', 'pago')).toBe(false);
        expect(isValidTransition('cancelado', 'pago')).toBe(false);
    });
});

describe('statusLabel', () => {
    it('traduz o status para o texto em português', () => {
        expect(statusLabel('aguardando_pagamento')).toBe('Aguardando pagamento');
        expect(statusLabel('pago')).toBe('Pago');
    });

    it('devolve o próprio valor se não reconhecer o status', () => {
        expect(statusLabel('status_novo')).toBe('status_novo');
    });
});
