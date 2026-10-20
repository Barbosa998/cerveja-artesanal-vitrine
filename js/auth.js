/**
 * Ponte com o Supabase (login e pedidos).
 * Carregado em todas as páginas. A biblioteca do Supabase só é baixada
 * quando realmente precisa (na página "Minha conta" ou ao finalizar um pedido),
 * para não pesar no resto do site.
 *
 * Expõe: window.vitrineAuth = { isConfigured, getClient, getSession, refreshHeader }
 */
(() => {
    'use strict';

    const SUPABASE_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
    const config = window.VITRINE_CONFIG || {};

    const isConfigured = () => Boolean(config.supabaseUrl && config.supabaseAnonKey);

    let clientPromise = null;

    function loadLibrary() {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = SUPABASE_SRC;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Não foi possível carregar o Supabase.'));
            document.head.appendChild(script);
        });
    }

    function getClient() {
        if (!isConfigured()) {
            return Promise.reject(new Error('Supabase não configurado.'));
        }
        if (!clientPromise) {
            clientPromise = loadLibrary().then(() =>
                window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
                    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
                })
            ).catch((error) => {
                clientPromise = null; // permite tentar de novo
                throw error;
            });
        }
        return clientPromise;
    }

    async function getSession() {
        const client = await getClient();
        const { data } = await client.auth.getSession();
        return data.session || null;
    }

    window.vitrineAuth = { isConfigured, getClient, getSession, refreshHeader: () => updateHeaderLink() };

    /* ----------------------------------------------------------------------
       Link "Entrar / Minha conta" no cabeçalho (sem baixar a biblioteca):
       o Supabase guarda a sessão no localStorage numa chave "sb-...-auth-token".
       ---------------------------------------------------------------------- */
    function hasStoredSession() {
        try {
            return Object.keys(window.localStorage).some((key) => /^sb-.+-auth-token$/.test(key));
        } catch (error) {
            return false;
        }
    }

    function updateHeaderLink() {
        const link = document.getElementById('account-link');
        if (!link) return;

        if (!isConfigured()) {
            link.hidden = true; // sem backend configurado, a área do cliente não aparece
            return;
        }
        link.textContent = hasStoredSession() ? 'Minha conta' : 'Entrar';
    }

    updateHeaderLink();
})();
