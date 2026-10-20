/**
 * Página "Minha conta" (conta.html)
 * - Entrar, criar conta, recuperar e redefinir senha
 * - Lista de pedidos com status e acompanhamento
 * - Edição dos dados do cliente
 * Depende de js/config.js e js/auth.js (Supabase).
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
    const whatsappNumber = (window.VITRINE_CONFIG || {}).whatsappNumber || '';

    const loadingEl = $('#account-loading');
    const views = {
        unavailable: $('#view-unavailable'),
        auth: $('#view-auth'),
        forgot: $('#view-forgot'),
        recovery: $('#view-recovery'),
        account: $('#view-account')
    };

    /* ======================================================================
       STATUS DOS PEDIDOS
       ====================================================================== */
    const STATUS = {
        aguardando_pagamento: {
            label: 'Aguardando pagamento',
            step: 0,
            text: 'Recebemos o seu pedido. Assim que o pagamento for confirmado, começamos a preparar. Se ainda não enviou o pedido pelo WhatsApp, use o botão abaixo.'
        },
        em_preparo: {
            label: 'Em preparo',
            step: 1,
            text: 'Pagamento confirmado. Estamos preparando o seu pedido.'
        },
        enviado: {
            label: 'Enviado',
            step: 2,
            text: 'Seu pedido já saiu para entrega.'
        },
        entregue: {
            label: 'Entregue',
            step: 3,
            text: 'Pedido entregue. Obrigado por comprar com a gente!'
        },
        cancelado: {
            label: 'Cancelado',
            step: -1,
            text: 'Este pedido foi cancelado. Se tiver alguma dúvida, fale com a gente pelo WhatsApp.'
        }
    };

    const STEPS = ['Pedido recebido', 'Em preparo', 'Enviado', 'Entregue'];

    /* ======================================================================
       ESTADO
       ====================================================================== */
    let client = null;
    let currentUserId = null;
    let recoveryMode = /type=recovery/.test(window.location.hash); // lido antes da biblioteca limpar o endereço
    let returnUrl = readReturnUrl();

    // Só aceitamos voltar para páginas do próprio site (ex.: produto.html?id=...)
    function readReturnUrl() {
        const raw = new URLSearchParams(window.location.search).get('voltar');
        if (!raw) return null;
        return /^[a-z0-9_-]+\.html(\?[\w=&%.-]*)?(#[\w-]*)?$/i.test(raw) ? raw : null;
    }

    /* ======================================================================
       TELAS
       ====================================================================== */
    function showView(name, { focus = true } = {}) {
        loadingEl.hidden = true;
        Object.entries(views).forEach(([key, element]) => {
            element.hidden = key !== name;
        });

        if (focus) {
            const heading = $('[data-focus-target]', views[name]);
            if (heading) heading.focus({ preventScroll: false });
        }
    }

    function setMessage(element, text, type = 'error') {
        element.textContent = text;
        element.className = `form__message form__message--${type}`;
    }

    function friendlyError(error) {
        const message = String((error && error.message) || '').toLowerCase();
        const status = error && error.status;

        if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
        if (message.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar: procure o link na sua caixa de entrada (e no spam).';
        if (message.includes('already registered')) return 'Este e-mail já tem cadastro. Tente entrar ou recuperar a senha.';
        if (message.includes('password should be at least') || message.includes('weak')) return 'Escolha uma senha mais forte, com pelo menos 8 caracteres.';
        if (message.includes('same password')) return 'A nova senha precisa ser diferente da anterior.';
        if (status === 429 || message.includes('rate limit')) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
        if (message.includes('failed to fetch') || message.includes('network')) return 'Sem conexão com o servidor. Confira sua internet e tente de novo.';
        return 'Algo deu errado. Tente novamente em instantes.';
    }

    // Desativa o botão enquanto a requisição acontece
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
       ABAS (acessíveis, com setas do teclado)
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

        return select;
    }

    const selectAuthTab = initTabs($('#auth-tabs'));
    const selectAccountTab = initTabs($('#account-tabs'), (tab) => {
        if (tab.id === 'tab-pedidos') loadOrders();
    });

    /* ======================================================================
       ENTRAR, CRIAR CONTA, RECUPERAR SENHA
       ====================================================================== */
    function initForms() {
        // Entrar
        const loginForm = $('#login-form');
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const message = $('#login-msg');
            setMessage(message, '');

            withBusy(loginForm, async () => {
                const { error } = await client.auth.signInWithPassword({
                    email: loginForm.email.value.trim(),
                    password: loginForm.password.value
                });
                if (error) setMessage(message, friendlyError(error));
                // sucesso: o evento SIGNED_IN abre "Minha conta"
            });
        });

        // Criar conta
        const signupForm = $('#signup-form');
        signupForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const message = $('#signup-msg');
            setMessage(message, '');

            withBusy(signupForm, async () => {
                const email = signupForm.email.value.trim();
                const { data, error } = await client.auth.signUp({
                    email,
                    password: signupForm.password.value,
                    options: {
                        emailRedirectTo: window.location.origin + window.location.pathname,
                        data: {
                            nome: signupForm.nome.value.trim(),
                            telefone: signupForm.telefone.value.trim(),
                            maior_de_18: true
                        }
                    }
                });

                if (error) {
                    setMessage(message, friendlyError(error));
                    return;
                }

                // O Supabase devolve um usuário "vazio" quando o e-mail já existe
                if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
                    setMessage(message, friendlyError({ message: 'already registered' }));
                    return;
                }

                // Com confirmação de e-mail ligada, ainda não há sessão
                if (!data.session) {
                    signupForm.reset();
                    setMessage(message, `Quase lá! Enviamos um link de confirmação para ${email}. Clique nele para ativar sua conta.`, 'success');
                }
            });
        });

        // Esqueci a senha
        $('#forgot-btn').addEventListener('click', () => showView('forgot'));
        $('#forgot-back').addEventListener('click', () => showView('auth'));

        const forgotForm = $('#forgot-form');
        forgotForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const message = $('#forgot-msg');
            setMessage(message, '');

            withBusy(forgotForm, async () => {
                const { error } = await client.auth.resetPasswordForEmail(forgotForm.email.value.trim(), {
                    redirectTo: window.location.origin + window.location.pathname
                });
                if (error) {
                    setMessage(message, friendlyError(error));
                    return;
                }
                // Mesma resposta exista ou não o cadastro, para não revelar quem é cliente
                setMessage(message, 'Se esse e-mail tiver cadastro, enviamos um link para você criar uma nova senha.', 'success');
            });
        });

        // Nova senha (depois de clicar no link do e-mail)
        const recoveryForm = $('#recovery-form');
        recoveryForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const message = $('#recovery-msg');
            setMessage(message, '');

            if (recoveryForm.password.value !== recoveryForm.confirm.value) {
                setMessage(message, 'As senhas não são iguais.');
                return;
            }

            withBusy(recoveryForm, async () => {
                const { error } = await client.auth.updateUser({ password: recoveryForm.password.value });
                if (error) {
                    setMessage(message, friendlyError(error));
                    return;
                }
                recoveryMode = false;
                window.history.replaceState(null, '', window.location.pathname);
                const { data } = await client.auth.getSession();
                if (data.session) {
                    await showAccount(data.session.user);
                } else {
                    showView('auth');
                }
            });
        });

        // Sair
        $('#logout-btn').addEventListener('click', async () => {
            await client.auth.signOut();
        });
    }

    /* ======================================================================
       MINHA CONTA
       ====================================================================== */
    async function showAccount(user) {
        if (currentUserId === user.id && !views.account.hidden) return; // já está aberta

        currentUserId = user.id;

        let profile = null;
        try {
            const { data } = await client.from('profiles').select('nome, telefone').eq('id', user.id).maybeSingle();
            profile = data;
        } catch (error) {
            profile = null; // segue com os dados do cadastro
        }

        const meta = user.user_metadata || {};
        const name = (profile && profile.nome) || meta.nome || '';
        const phone = (profile && profile.telefone) || meta.telefone || '';

        $('#account-name').textContent = name ? name.split(' ')[0] : 'cliente';
        $('#account-email').textContent = user.email || '';

        const profileForm = $('#profile-form');
        profileForm.nome.value = name;
        profileForm.telefone.value = phone;
        profileForm.email.value = user.email || '';

        showView('account');

        // Endereço #dados abre direto a aba de dados; qualquer outro, a de pedidos
        selectAccountTab($(window.location.hash === '#dados' ? '#tab-dados' : '#tab-pedidos'));
    }

    function initProfileForm() {
        const form = $('#profile-form');
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const message = $('#profile-msg');
            setMessage(message, '');

            withBusy(form, async () => {
                const nome = form.nome.value.trim();
                const telefone = form.telefone.value.trim();

                const { error } = await client
                    .from('profiles')
                    .update({ nome, telefone })
                    .eq('id', currentUserId);

                if (error) {
                    setMessage(message, 'Não foi possível salvar agora. Tente novamente.');
                    return;
                }

                $('#account-name').textContent = nome ? nome.split(' ')[0] : 'cliente';
                setMessage(message, 'Dados salvos.', 'success');
            });
        });
    }

    /* ======================================================================
       PEDIDOS
       ====================================================================== */
    function formatDate(iso) {
        return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function timelineMarkup(status) {
        if (status.step < 0) return '';

        const items = STEPS.map((label, index) => {
            const done = index < status.step || status.step === STEPS.length - 1;
            const current = index === status.step && !done;
            const state = done ? 'done' : current ? 'current' : 'todo';
            const hint = done ? ' (concluído)' : current ? ' (etapa atual)' : '';

            return `
                <li class="timeline__step timeline__step--${state}" ${current ? 'aria-current="step"' : ''}>
                    <span class="timeline__dot" aria-hidden="true"></span>
                    <span class="timeline__label">${esc(label)}<span class="sr-only">${hint}</span></span>
                </li>`;
        }).join('');

        return `<ol class="timeline" aria-label="Andamento do pedido">${items}</ol>`;
    }

    function orderMarkup(order, open) {
        const status = STATUS[order.status] || { label: order.status, step: -1, text: '' };
        const items = (order.order_items || []).map((item) => `
            <li class="order__item">
                <span class="order__item-name">${esc(item.qtd)}x ${esc(item.nome)}</span>
                <span class="order__item-price">${brl.format(Number(item.preco) * item.qtd)}</span>
            </li>`).join('');

        const discount = Number(order.desconto);
        const totals = discount > 0 ? `
            <p class="order__line"><span>Subtotal</span><span>${brl.format(Number(order.subtotal))}</span></p>
            <p class="order__line order__line--discount"><span>Cupom ${esc(order.cupom || '')}</span><span>- ${brl.format(discount)}</span></p>` : '';

        const tracking = order.codigo_rastreio ? `
            <p class="order__tracking"><strong>Código de rastreio:</strong> ${esc(order.codigo_rastreio)}</p>` : '';

        const whatsappText = `Olá! Quero falar sobre o pedido #${order.numero}.`;
        const whatsapp = whatsappNumber ? `
            <a class="order__help" href="https://wa.me/${esc(whatsappNumber)}?text=${encodeURIComponent(whatsappText)}" target="_blank" rel="noopener">
                Falar sobre este pedido no WhatsApp
            </a>` : '';

        return `
            <details class="order" ${open ? 'open' : ''}>
                <summary class="order__summary">
                    <span class="order__number">Pedido #${esc(order.numero)}</span>
                    <span class="order__date">${esc(formatDate(order.created_at))}</span>
                    <span class="badge badge--${esc(order.status)}">${esc(status.label)}</span>
                    <span class="order__total">${brl.format(Number(order.total))}</span>
                </summary>
                <div class="order__body">
                    ${timelineMarkup(status)}
                    <p class="order__status-text">${esc(status.text)}</p>
                    ${tracking}
                    <ul class="order__items" aria-label="Itens do pedido">${items}</ul>
                    <div class="order__totals">
                        ${totals}
                        <p class="order__line order__line--total"><span>Total</span><span>${brl.format(Number(order.total))}</span></p>
                    </div>
                    ${whatsapp}
                </div>
            </details>`;
    }

    let loadingOrders = false;

    async function loadOrders() {
        if (!client || !currentUserId || loadingOrders) return;
        loadingOrders = true;

        const list = $('#orders-list');
        const statusLine = $('#orders-status');
        statusLine.textContent = 'Carregando seus pedidos...';

        try {
            const { data, error } = await client
                .from('orders')
                .select('*, order_items(*)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                list.innerHTML = `
                    <div class="orders__empty">
                        <p>Você ainda não fez nenhum pedido.</p>
                        <a href="index.html#vitrine" class="btn btn--primary">Ver as cervejas</a>
                    </div>`;
                statusLine.textContent = '';
                return;
            }

            // Mantém abertos os pedidos que a pessoa já estava vendo
            const openIds = new Set($$('.order[open]', list).map((el) => el.dataset.id));
            const firstLoad = !list.children.length || list.querySelector('.orders__empty');

            list.innerHTML = data.map((order, index) => orderMarkup(order, firstLoad ? index === 0 : false)).join('');
            $$('.order', list).forEach((el, index) => {
                el.dataset.id = data[index].id;
                if (openIds.has(data[index].id)) el.open = true;
            });

            statusLine.textContent = data.length === 1 ? '1 pedido' : `${data.length} pedidos`;
        } catch (error) {
            statusLine.textContent = 'Não foi possível carregar seus pedidos agora. Tente atualizar.';
        } finally {
            loadingOrders = false;
        }
    }

    function initOrders() {
        $('#orders-refresh').addEventListener('click', loadOrders);

        // Ao voltar para a aba do navegador, atualiza o status
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !views.account.hidden && !$('#panel-pedidos').hidden) {
                loadOrders();
            }
        });
    }

    /* ======================================================================
       INÍCIO
       ====================================================================== */
    async function start() {
        if (!auth || !auth.isConfigured()) {
            showView('unavailable', { focus: false });
            return;
        }

        try {
            client = await auth.getClient();
        } catch (error) {
            $('#unavailable-text').textContent = 'Não conseguimos carregar a área do cliente agora. Confira sua conexão e tente de novo.';
            showView('unavailable', { focus: false });
            return;
        }

        initForms();
        initProfileForm();
        initOrders();

        // O Supabase avisa quando alguém entra, sai ou abre o link de recuperar senha.
        // (setTimeout evita travar a biblioteca ao fazer novas chamadas dentro do aviso.)
        client.auth.onAuthStateChange((event, session) => {
            window.setTimeout(() => handleAuthEvent(event, session), 0);
        });
    }

    async function handleAuthEvent(event, session) {
        auth.refreshHeader(); // mantém "Entrar / Minha conta" do cabeçalho em dia

        if (event === 'PASSWORD_RECOVERY') {
            recoveryMode = true;
        }

        if (recoveryMode) {
            showView('recovery', { focus: true });
            return;
        }

        if (!session) {
            currentUserId = null;
            // Se o aviso de "recuperar senha" estiver aberto, não o fechamos sem querer
            if (views.forgot.hidden) showView('auth', { focus: event === 'SIGNED_OUT' });
            return;
        }

        // Entrou agora e veio de uma página de compra: volta para ela
        if (event === 'SIGNED_IN' && returnUrl) {
            window.location.replace(returnUrl);
            return;
        }

        await showAccount(session.user);
    }

    start();
})();
