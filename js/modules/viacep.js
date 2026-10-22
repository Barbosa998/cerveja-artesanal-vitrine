/**
 * Busca de endereço por CEP (ViaCEP: https://viacep.com.br — pública, sem
 * chave). Contrato confirmado direto na API antes de codar:
 *   - CEP de 8 dígitos existente  -> 200 com o endereço em JSON.
 *   - CEP de 8 dígitos inexistente -> 200 com { "erro": "true" }.
 *   - CEP fora do formato (não são 8 dígitos) -> 400 com HTML (não é
 *     JSON!), por isso validamos o formato ANTES de chamar a API.
 *
 * `normalizeCep`/`isValidCep` são puras (testadas em
 * js/modules/__tests__/viacep.test.js). `fetchAddressByCep` recebe o
 * `fetch` por parâmetro (injeção de dependência) só para dar pra testar
 * sem precisar de rede de verdade nem mockar `window.fetch` global.
 */

const VIACEP_BASE = 'https://viacep.com.br/ws';

/** Remove tudo que não é dígito. */
export function normalizeCep(cep) {
    return String(cep ?? '').replace(/\D/g, '');
}

/** Um CEP válido pra consultar tem exatamente 8 dígitos. */
export function isValidCep(cep) {
    return /^\d{8}$/.test(normalizeCep(cep));
}

/**
 * @param {string} cep
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal }} [options]
 * @returns {Promise<{cep: string, rua: string, bairro: string, cidade: string, uf: string}>}
 * @throws {Error} com `.code` = 'formato_invalido' | 'nao_encontrado' | 'falha_rede'
 */
export async function fetchAddressByCep(cep, options = {}) {
    const { fetchImpl = fetch, signal } = options;
    const normalized = normalizeCep(cep);

    if (!isValidCep(normalized)) {
        throw Object.assign(new Error('CEP precisa ter 8 dígitos.'), { code: 'formato_invalido' });
    }

    let response;
    try {
        response = await fetchImpl(`${VIACEP_BASE}/${normalized}/json/`, { signal });
    } catch (error) {
        if (error && error.name === 'AbortError') throw error; // deixa o cancelamento passar direto
        throw Object.assign(new Error('Não foi possível consultar o CEP agora.'), { code: 'falha_rede', cause: error });
    }

    if (!response.ok) {
        throw Object.assign(new Error('Não foi possível consultar o CEP agora.'), { code: 'falha_rede' });
    }

    const data = await response.json();
    if (data.erro) {
        throw Object.assign(new Error('CEP não encontrado.'), { code: 'nao_encontrado' });
    }

    return {
        cep: data.cep || normalized,
        rua: data.logradouro || '',
        bairro: data.bairro || '',
        cidade: data.localidade || '',
        uf: data.uf || ''
    };
}
