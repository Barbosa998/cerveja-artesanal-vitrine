/**
 * Catálogo de produtos (window.PRODUTOS).
 *
 * Busca os produtos ativos na tabela "produtos" do Supabase (editável pelo
 * painel de administrador, admin.html). Se o Supabase não estiver
 * configurado, a tabela ainda não existir (você não rodou
 * supabase/schema_admin.sql) ou a busca falhar por qualquer motivo, usa os
 * dados fixos de js/produtos.js como reserva — o site nunca fica sem
 * produtos por causa disso.
 *
 * Expõe window.VITRINE_CATALOG_READY: uma Promise que resolve com a lista
 * final de produtos (window.PRODUTOS já atualizado nesse momento).
 * js/main.js e js/produto.js esperam essa Promise antes de desenhar a tela.
 */
window.VITRINE_CATALOG_READY = (async () => {
    const fallback = Array.isArray(window.PRODUTOS) ? window.PRODUTOS : [];
    const auth = window.vitrineAuth;

    if (!auth || !auth.isConfigured()) {
        return fallback;
    }

    try {
        const client = await auth.getClient();
        const { data, error } = await client
            .from('produtos')
            .select('*')
            .eq('ativo', true)
            .order('ordem', { ascending: true });

        if (error || !Array.isArray(data) || data.length === 0) {
            return fallback;
        }

        const produtos = data.map((row) => ({
            id: row.id,
            nome: row.nome,
            estilo: row.estilo,
            categoria: row.categoria || 'outro',
            resumo: row.resumo || '',
            sobre: Array.isArray(row.sobre) ? row.sobre : [],
            preco: Number(row.preco),
            abv: row.abv || '',
            ibu: row.ibu || '',
            volume: row.volume || '',
            temperatura: row.temperatura || '',
            copo: row.copo || '',
            harmonizacao: row.harmonizacao || '',
            fotos: Array.isArray(row.fotos) ? row.fotos : [],
            estoque: Number.isFinite(row.estoque) ? row.estoque : 0
        }));

        window.PRODUTOS = produtos;
        return produtos;
    } catch (error) {
        return fallback;
    }
})();
