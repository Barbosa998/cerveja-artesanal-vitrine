import { describe, it, expect, vi } from 'vitest';
import { normalizeCep, isValidCep, fetchAddressByCep } from '../viacep.js';

describe('normalizeCep', () => {
    it('remove tudo que não é dígito', () => {
        expect(normalizeCep('01310-100')).toBe('01310100');
        expect(normalizeCep('  01310 100  ')).toBe('01310100');
    });

    it('lida com valores vazios/ausentes', () => {
        expect(normalizeCep('')).toBe('');
        expect(normalizeCep(null)).toBe('');
        expect(normalizeCep(undefined)).toBe('');
    });
});

describe('isValidCep', () => {
    it('aceita CEP com exatamente 8 dígitos, formatado ou não', () => {
        expect(isValidCep('01310100')).toBe(true);
        expect(isValidCep('01310-100')).toBe(true);
    });

    it('recusa CEP com formato errado', () => {
        expect(isValidCep('123')).toBe(false);
        expect(isValidCep('011310100')).toBe(false);
        expect(isValidCep('')).toBe(false);
        expect(isValidCep('abcdefgh')).toBe(false);
    });
});

// Monta um `fetch` falso (nunca bate na rede de verdade) para os testes abaixo.
function fakeFetch(body, { ok = true, status = 200 } = {}) {
    return vi.fn().mockResolvedValue({
        ok,
        status,
        json: async () => body
    });
}

describe('fetchAddressByCep', () => {
    it('recusa um CEP mal formatado antes mesmo de chamar a API', async () => {
        const fetchImpl = fakeFetch({});
        await expect(fetchAddressByCep('123', { fetchImpl })).rejects.toMatchObject({ code: 'formato_invalido' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('devolve o endereço normalizado quando o CEP existe', async () => {
        const fetchImpl = fakeFetch({
            cep: '01310-100',
            logradouro: 'Avenida Paulista',
            bairro: 'Bela Vista',
            localidade: 'São Paulo',
            uf: 'SP'
        });

        const result = await fetchAddressByCep('01310100', { fetchImpl });

        expect(result).toEqual({
            cep: '01310-100',
            rua: 'Avenida Paulista',
            bairro: 'Bela Vista',
            cidade: 'São Paulo',
            uf: 'SP'
        });
        expect(fetchImpl).toHaveBeenCalledWith('https://viacep.com.br/ws/01310100/json/', expect.any(Object));
    });

    it('rejeita com code "nao_encontrado" quando a API devolve { erro: true }', async () => {
        const fetchImpl = fakeFetch({ erro: 'true' });
        await expect(fetchAddressByCep('99999999', { fetchImpl })).rejects.toMatchObject({ code: 'nao_encontrado' });
    });

    it('rejeita com code "falha_rede" se a resposta não for ok', async () => {
        const fetchImpl = fakeFetch({}, { ok: false, status: 500 });
        await expect(fetchAddressByCep('01310100', { fetchImpl })).rejects.toMatchObject({ code: 'falha_rede' });
    });

    it('rejeita com code "falha_rede" se o fetch falhar (ex.: sem internet)', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
        await expect(fetchAddressByCep('01310100', { fetchImpl })).rejects.toMatchObject({ code: 'falha_rede' });
    });

    it('deixa o AbortError passar direto (cancelamento, não é um erro de verdade)', async () => {
        const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
        const fetchImpl = vi.fn().mockRejectedValue(abortError);
        await expect(fetchAddressByCep('01310100', { fetchImpl })).rejects.toBe(abortError);
    });
});
