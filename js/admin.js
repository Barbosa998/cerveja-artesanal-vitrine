/**
 * Painel administrativo (admin.html).
 *
 * Importante: esconder esta página não protege nada — em site estático,
 * admin.html e admin.js são públicos como qualquer outro arquivo. Quem
 * decide quem é admin é o banco (tabela public.admins + função is_admin()),
 * nunca este arquivo. Toda ação sensível (mudar status, confirmar
 * pagamento, editar produto) passa pela política RLS ou por uma função do
 * Supabase que confere is_admin() no servidor antes de fazer qualquer coisa.
 */
(() => {
    'use strict';

    const $ = (selector, scope = document) => scope.querySelector(selector);
    const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

    const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const esc = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const auth = window.vitrineAuth;
    let client = null;

    const views = {
        unavailable: $('#view-unavailable'),
        login: $('#view-login'),
        denied: $('#view-denied'),
        panel: $('#view-panel')
    };
    const loadingEl = $('#admin-loading');

    function showView(name) {
        loadingEl.hidden = true;
        Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
        const heading = $('[data-focus-target]', views[name]);
        if (heading) heading.focus({ preventScroll: false });
    }

    function setMessage(el, text, type = 'error') {
        el.textContent = text;
        el.className = `form__message form__message--${type}`;
    }

    function friendlyError(error) {
        const message = String((error && error.message) || '').toLowerCase();
        if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
        if (message.includes('failed to fetch') || message.includes('network')) return 'Sem conexão com o servidor.';
        return (error && error.message) || 'Algo deu errado. Tente novamente.';
    }

    async function withBusy(form, action) {
        const button = $('button[type="submit"]', form);
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Aguarde...';
        try {
            await action();
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    /* ======================================================================
       MÁQUINA DE ESTADOS (espelha o que admin_set_order_status valida no banco;
       aqui é só para não oferecer opções que o servidor vai recusar)
       ====================================================================== */
    const STATUS_LABELS = {
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

    /* ======================================================================
       LOGIN / SESSÃO
       ====================================================================== */
    function initLogin() {
        const form = $('#admin-login-form');
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const message = $('#admin-login-msg');
            setMessage(message, '');

            withBusy(form, async () => {
                const { error } = await client.auth.signInWithPassword({
                    email: form.email.value.trim(),
                    password: form.password.value
                });
                if (error) setMessage(message, friendlyError(error));
                // sucesso: onAuthStateChange cuida do resto
            });
        });
    }

    function initLogout() {
        const doLogout = async () => { await client.auth.signOut(); };
        $('#admin-logout').addEventListener('click', doLogout);
        $('#denied-logout').addEventListener('click', doLogout);
    }

    async function checkIsAdmin() {
        try {
            const { data, error } = await client.rpc('is_admin');
            if (error) return false;
            return data === true;
        } catch (error) {
            return false;
        }
    }

    async function handleAuthEvent(session) {
        const logoutBtn = $('#admin-logout');
        const emailEl = $('#admin-email');

        if (!session) {
            logoutBtn.hidden = true;
            emailEl.hidden = true;
            showView('login');
            return;
        }

        const isAdmin = await checkIsAdmin();
        if (!isAdmin) {
            logoutBtn.hidden = true;
            emailEl.hidden = true;
            showView('denied');
            return;
        }

        emailEl.textContent = session.user.email || '';
        emailEl.hidden = false;
        logoutBtn.hidden = false;
        showView('panel');
        loadOrders();
        loadProdutos();
    }

    /* ======================================================================
       ABAS
       ====================================================================== */
    function initTabs(tablist, onSelect) {
        const tabs = $$('[role="tab"]', tablist);
        const select = (tab, { focus = false } = {}) => {
            tabs.forEach((item) => {
                const selected = item === tab;
                item.setAttribute('aria-selected', String(selected));
                item.tabIndex = selected ? 0 : -1;
                const panel = document.getElementById(item.getAttribute('aria-controls'));
                if (panel) panel.hidden = !selected;
            });
            if (focus) tab.focus();
            if (onSelect) onSelect(tab);
        };
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => select(tab));
            tab.addEventListener('keydown', (event) => {
                const keys = { ArrowRight: 1, ArrowLeft: -1 };
                if (!(event.key in keys)) return;
                event.preventDefault();
                select(tabs[(index + keys[event.key] + tabs.length) % tabs.length], { focus: true });
            });
        });
    }

    /* ======================================================================
       PEDIDOS
       ====================================================================== */
    let allOrders = [];
    let currentOrder = null;

    async function loadOrders() {
        const status = $('#orders-admin-status');
        status.textContent = 'Carregando pedidos...';
        try {
            const { data, error } = await client.rpc('admin_listar_pedidos');
            if (error) throw error;
            allOrders = data || [];
            status.textContent = allOrders.length === 1 ? '1 pedido' : `${allOrders.length} pedidos`;
            renderOrdersTable();
        } catch (error) {
            status.textContent = 'Não foi possível carregar os pedidos agora.';
        }
    }

    function filteredOrders() {
        const statusFilter = $('#orders-filter-status').value;
        const term = $('#orders-search').value.trim().toLowerCase();

        return allOrders.filter((order) => {
            if (statusFilter && order.status !== statusFilter) return false;
            if (!term) return true;
            const haystack = [
                order.numero, order.cliente_nome, order.cliente_email, order.cliente_telefone
            ].map((v) => String(v ?? '').toLowerCase()).join(' ');
            return haystack.includes(term);
        });
    }

    function formatDateTime(iso) {
        return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }

    function renderOrdersTable() {
        const body = $('#orders-table-body');
        const rows = filteredOrders();

        body.replaceChildren(...rows.map((order) => {
            const tr = document.createElement('tr');

            const tdNumero = document.createElement('td');
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'admin-table__link';
            link.textContent = `#${order.numero}`;
            link.addEventListener('click', () => openOrderDialog(order));
            tdNumero.append(link);

            const tdCliente = document.createElement('td');
            tdCliente.textContent = order.cliente_nome || order.cliente_email || '—';

            const tdData = document.createElement('td');
            tdData.textContent = formatDateTime(order.created_at);

            const tdStatus = document.createElement('td');
            tdStatus.textContent = STATUS_LABELS[order.status] || order.status;

            const tdTotal = document.createElement('td');
            tdTotal.textContent = brl.format(Number(order.total));

            const tdAcoes = document.createElement('td');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn--secondary';
            btn.textContent = 'Ver';
            btn.addEventListener('click', () => openOrderDialog(order));
            tdAcoes.append(btn);

            tr.append(tdNumero, tdCliente, tdData, tdStatus, tdTotal, tdAcoes);
            return tr;
        }));
    }

    async function openOrderDialog(order) {
        currentOrder = order;
        const dialog = $('#order-dialog');
        $('#order-dialog-title').textContent = `Pedido #${order.numero}`;

        const body = $('#order-dialog-body');
        body.replaceChildren();

        const summary = document.createElement('div');
        summary.className = 'admin-order-summary';
        summary.innerHTML = `
            <p><strong>Cliente:</strong> ${esc(order.cliente_nome || '—')}</p>
            <p><strong>E-mail:</strong> ${esc(order.cliente_email || '—')}</p>
            <p><strong>Telefone:</strong> ${esc(order.cliente_telefone || '—')}</p>
            <p><strong>Cupom:</strong> ${esc(order.cupom || '—')}</p>
            <p><strong>Subtotal:</strong> ${brl.format(Number(order.subtotal))} &middot; <strong>Desconto:</strong> ${brl.format(Number(order.desconto))} &middot; <strong>Total:</strong> ${brl.format(Number(order.total))}</p>
        `;
        body.append(summary);

        const itemsList = document.createElement('ul');
        itemsList.className = 'admin-order-items';
        itemsList.textContent = 'Carregando itens...';
        body.append(itemsList);

        // Status + rastreio
        const statusSelect = $('#order-status-select');
        statusSelect.replaceChildren();
        const currentOption = document.createElement('option');
        currentOption.value = order.status;
        currentOption.textContent = `${STATUS_LABELS[order.status] || order.status} (atual)`;
        statusSelect.append(currentOption);
        (NEXT_STATUS[order.status] || []).forEach((status) => {
            const opt = document.createElement('option');
            opt.value = status;
            opt.textContent = STATUS_LABELS[status] || status;
            statusSelect.append(opt);
        });
        $('#order-tracking-input').value = order.codigo_rastreio || '';
        $('#order-status-note').value = '';
        setMessage($('#order-status-msg'), '');

        // Pagamento: só faz sentido enquanto aguardando
        const paymentForm = $('#order-payment-form');
        paymentForm.hidden = order.status !== 'aguardando_pagamento';
        $('#payment-amount').value = Number(order.total).toFixed(2);
        $('#payment-note').value = '';
        setMessage($('#order-payment-msg'), '');

        $('#order-history-list').replaceChildren();

        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');

        // Itens e histórico (não bloqueiam a abertura do modal)
        try {
            const { data: items, error: itemsError } = await client
                .from('order_items').select('*').eq('order_id', order.id);
            if (itemsError) throw itemsError;
            itemsList.replaceChildren(...(items || []).map((item) => {
                const li = document.createElement('li');
                li.textContent = `${item.qtd}x ${item.nome} — ${brl.format(Number(item.preco) * item.qtd)}`;
                return li;
            }));
        } catch (error) {
            itemsList.textContent = 'Não foi possível carregar os itens.';
        }

        try {
            const { data: history, error: historyError } = await client
                .from('audit_log').select('*').eq('order_id', order.id).order('created_at', { ascending: false });
            if (historyError) throw historyError;
            const list = $('#order-history-list');
            if (!history || history.length === 0) {
                list.innerHTML = '<li>Sem movimentações registradas ainda.</li>';
            } else {
                list.replaceChildren(...history.map((entry) => {
                    const li = document.createElement('li');
                    const detalhes = entry.detalhes ? JSON.stringify(entry.detalhes) : '';
                    li.textContent = `${formatDateTime(entry.created_at)} — ${entry.acao} ${detalhes}`;
                    return li;
                }));
            }
        } catch (error) {
            $('#order-history-list').innerHTML = '<li>Não foi possível carregar o histórico.</li>';
        }
    }

    function initOrderDialog() {
        const dialog = $('#order-dialog');
        $('#order-dialog-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

        $('#order-status-form').addEventListener('submit', (event) => {
            event.preventDefault();
            if (!currentOrder) return;
            const message = $('#order-status-msg');
            setMessage(message, '');

            const newStatus = $('#order-status-select').value;
            const tracking = $('#order-tracking-input').value.trim();
            const note = $('#order-status-note').value.trim();
            const confirmMsg = newStatus === 'cancelado'
                ? 'Tem certeza que quer cancelar este pedido?'
                : `Mudar o status para "${STATUS_LABELS[newStatus] || newStatus}"?`;
            if (!window.confirm(confirmMsg)) return;

            withBusy(event.target, async () => {
                try {
                    const { data, error } = await client.rpc('admin_set_order_status', {
                        p_order_id: currentOrder.id,
                        p_new_status: newStatus,
                        p_codigo_rastreio: tracking || null,
                        p_note: note || null
                    });
                    if (error) throw error;
                    setMessage(message, 'Status atualizado.', 'success');
                    await loadOrders();
                    const updated = allOrders.find((o) => o.id === currentOrder.id);
                    if (updated) openOrderDialog(updated);
                } catch (error) {
                    setMessage(message, friendlyError(error));
                }
            });
        });

        $('#order-payment-form').addEventListener('submit', (event) => {
            event.preventDefault();
            if (!currentOrder) return;
            const message = $('#order-payment-msg');
            setMessage(message, '');

            const method = $('#payment-method').value;
            const amount = Number.parseFloat($('#payment-amount').value);
            const note = $('#payment-note').value.trim();

            if (!Number.isFinite(amount) || amount < 0) {
                setMessage(message, 'Informe um valor válido.');
                return;
            }
            if (!window.confirm('Confirmar o pagamento deste pedido?')) return;

            withBusy(event.target, async () => {
                try {
                    const { error } = await client.rpc('admin_confirm_payment', {
                        p_order_id: currentOrder.id,
                        p_method: method,
                        p_amount: amount,
                        p_note: note || null
                    });
                    if (error) throw error;
                    setMessage(message, 'Pagamento confirmado.', 'success');
                    await loadOrders();
                    const updated = allOrders.find((o) => o.id === currentOrder.id);
                    if (updated) openOrderDialog(updated);
                } catch (error) {
                    setMessage(message, friendlyError(error));
                }
            });
        });
    }

    function exportOrdersCsv() {
        const rows = filteredOrders();
        const header = ['numero', 'status', 'cliente', 'email', 'telefone', 'subtotal', 'desconto', 'total', 'cupom', 'criado_em'];
        const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const lines = [header.join(',')];
        rows.forEach((order) => {
            lines.push([
                order.numero, order.status, order.cliente_nome, order.cliente_email, order.cliente_telefone,
                order.subtotal, order.desconto, order.total, order.cupom, order.created_at
            ].map(csvEscape).join(','));
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function initOrdersToolbar() {
        $('#orders-refresh').addEventListener('click', loadOrders);
        $('#orders-filter-status').addEventListener('change', renderOrdersTable);
        $('#orders-search').addEventListener('input', renderOrdersTable);
        $('#orders-export').addEventListener('click', exportOrdersCsv);
    }

    /* ======================================================================
       PRODUTOS
       ====================================================================== */
    let allProdutos = [];
    let editingProdutoId = null;

    async function loadProdutos() {
        const status = $('#produtos-admin-status');
        status.textContent = 'Carregando produtos...';
        try {
            const { data, error } = await client.from('produtos').select('*').order('ordem', { ascending: true });
            if (error) throw error;
            allProdutos = data || [];
            status.textContent = allProdutos.length === 1 ? '1 produto' : `${allProdutos.length} produtos`;
            renderProdutosTable();
        } catch (error) {
            status.textContent = 'Não foi possível carregar os produtos. Você já rodou supabase/schema_admin.sql?';
        }
    }

    function renderProdutosTable() {
        const body = $('#produtos-table-body');
        body.replaceChildren(...allProdutos.map((produto) => {
            const tr = document.createElement('tr');

            const tdNome = document.createElement('td');
            tdNome.textContent = produto.nome;

            const tdCategoria = document.createElement('td');
            tdCategoria.textContent = produto.categoria;

            const tdPreco = document.createElement('td');
            tdPreco.textContent = brl.format(Number(produto.preco));

            const tdEstoque = document.createElement('td');
            tdEstoque.textContent = String(produto.estoque);

            const tdAtivo = document.createElement('td');
            tdAtivo.textContent = produto.ativo ? 'Sim' : 'Não';

            const tdAcoes = document.createElement('td');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn--secondary';
            btn.textContent = 'Editar';
            btn.addEventListener('click', () => openProdutoDialog(produto));
            tdAcoes.append(btn);

            tr.append(tdNome, tdCategoria, tdPreco, tdEstoque, tdAtivo, tdAcoes);
            return tr;
        }));
    }

    function openProdutoDialog(produto) {
        editingProdutoId = produto ? produto.id : null;
        $('#produto-dialog-title').textContent = produto ? `Editar: ${produto.nome}` : 'Novo produto';
        $('#produto-id').value = produto ? produto.id : '';
        $('#produto-id').readOnly = Boolean(produto);
        $('#produto-nome').value = produto ? produto.nome : '';
        $('#produto-estilo').value = produto ? produto.estilo : '';
        $('#produto-categoria').value = produto ? produto.categoria : 'outro';
        $('#produto-resumo').value = produto ? (produto.resumo || '') : '';
        $('#produto-sobre').value = produto ? (produto.sobre || []).join('\n') : '';
        $('#produto-preco').value = produto ? Number(produto.preco).toFixed(2) : '';
        $('#produto-estoque').value = produto ? produto.estoque : 0;
        $('#produto-abv').value = produto ? (produto.abv || '') : '';
        $('#produto-ibu').value = produto ? (produto.ibu || '') : '';
        $('#produto-volume').value = produto ? (produto.volume || '') : '';
        $('#produto-temperatura').value = produto ? (produto.temperatura || '') : '';
        $('#produto-copo').value = produto ? (produto.copo || '') : '';
        $('#produto-harmonizacao').value = produto ? (produto.harmonizacao || '') : '';
        $('#produto-fotos').value = produto
            ? (produto.fotos || []).map((f) => `${f.src} | ${f.alt || ''}`).join('\n')
            : '';
        $('#produto-ordem').value = produto ? produto.ordem : allProdutos.length;
        $('#produto-ativo').checked = produto ? Boolean(produto.ativo) : true;
        $('#produto-excluir').hidden = !produto;
        setMessage($('#produto-form-msg'), '');

        const dialog = $('#produto-dialog');
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
    }

    function parseFotos(text) {
        return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
            const [src, ...rest] = line.split('|');
            return { src: (src || '').trim(), alt: rest.join('|').trim() };
        });
    }

    function initProdutoDialog() {
        const dialog = $('#produto-dialog');
        $('#produto-dialog-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
        $('#produto-novo').addEventListener('click', () => openProdutoDialog(null));

        $('#produto-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const message = $('#produto-form-msg');
            setMessage(message, '');

            const id = $('#produto-id').value.trim();
            if (!/^[a-z0-9-]+$/.test(id)) {
                setMessage(message, 'O identificador só pode ter letras minúsculas, números e hífen.');
                return;
            }

            const payload = {
                id,
                nome: $('#produto-nome').value.trim(),
                estilo: $('#produto-estilo').value.trim(),
                categoria: $('#produto-categoria').value,
                resumo: $('#produto-resumo').value.trim(),
                sobre: $('#produto-sobre').value.split('\n').map((l) => l.trim()).filter(Boolean),
                preco: Number.parseFloat($('#produto-preco').value),
                abv: $('#produto-abv').value.trim(),
                ibu: $('#produto-ibu').value.trim(),
                volume: $('#produto-volume').value.trim(),
                temperatura: $('#produto-temperatura').value.trim(),
                copo: $('#produto-copo').value.trim(),
                harmonizacao: $('#produto-harmonizacao').value.trim(),
                fotos: parseFotos($('#produto-fotos').value),
                estoque: Number.parseInt($('#produto-estoque').value, 10) || 0,
                ordem: Number.parseInt($('#produto-ordem').value, 10) || 0,
                ativo: $('#produto-ativo').checked
            };

            if (!Number.isFinite(payload.preco) || payload.preco < 0) {
                setMessage(message, 'Informe um preço válido.');
                return;
            }

            withBusy(event.target, async () => {
                try {
                    const { error } = await client.from('produtos').upsert(payload);
                    if (error) throw error;
                    setMessage(message, 'Produto salvo.', 'success');
                    await loadProdutos();
                    window.setTimeout(() => dialog.close(), 600);
                } catch (error) {
                    setMessage(message, friendlyError(error));
                }
            });
        });

        $('#produto-excluir').addEventListener('click', () => {
            if (!editingProdutoId) return;
            if (!window.confirm('Excluir este produto? Ele some da vitrine e não pode ser desfeito.')) return;

            withBusy($('#produto-form'), async () => {
                try {
                    const { error } = await client.from('produtos').delete().eq('id', editingProdutoId);
                    if (error) throw error;
                    await loadProdutos();
                    dialog.close();
                } catch (error) {
                    setMessage($('#produto-form-msg'), friendlyError(error));
                }
            });
        });
    }

    /* ======================================================================
       INÍCIO
       ====================================================================== */
    async function start() {
        if (!auth || !auth.isConfigured()) {
            showView('unavailable');
            return;
        }

        try {
            client = await auth.getClient();
        } catch (error) {
            showView('unavailable');
            return;
        }

        initLogin();
        initLogout();
        initTabs($('#admin-tabs'));
        initOrdersToolbar();
        initOrderDialog();
        initProdutoDialog();

        client.auth.onAuthStateChange((event, session) => {
            window.setTimeout(() => handleAuthEvent(session), 0);
        });
    }

    start();
})();
