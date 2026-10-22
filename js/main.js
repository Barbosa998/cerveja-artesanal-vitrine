/**
 * Arquivo Principal de JavaScript (módulo ES).
 * Responsável por:
 * - Controle do Dialog de verificação de idade
 * - Desenhar a vitrine e os filtros
 * - Lógica do Carrinho de Compras (salvo no localStorage) e Cupom de Desconto
 *   — as regras puras (somar, validar, calcular desconto) vivem em
 *   js/modules/cart.js e js/modules/coupons.js, com testes em
 *   js/modules/__tests__/. Aqui só a parte que mexe no DOM/localStorage.
 * - Expõe window.vitrine.addToCart para a página de produto
 * - Finalização do pedido: salva na conta do cliente (Supabase) e envia pelo WhatsApp
 * - Endereço de entrega: busca por CEP na API pública do ViaCEP
 *   (js/modules/viacep.js), com cache em memória, debounce e cancelamento
 *   da busca anterior se a pessoa continuar digitando.
 * - Newsletter (opcional, só aparece se houver um endpoint configurado)
 */
import {
    sanitizeCart,
    addItem as addItemToCart,
    changeQty as changeCartQty,
    removeItem as removeCartItem,
    totalItems as cartTotalItems,
    totalPrice as cartTotalPrice,
    MAX_QTY
} from './modules/cart.js';
import { findCouponRate, calculateDiscount, calculateFinalPrice } from './modules/coupons.js';
import { normalizeCep, isValidCep, fetchAddressByCep } from './modules/viacep.js';

(() => {
    'use strict';

    /* ======================================================================
       CONFIGURAÇÃO — ajuste aqui os dados da sua cervejaria
       ====================================================================== */
    const CONFIG = {
        // Número que recebe os pedidos. Edite em js/config.js (país + DDD + número, só dígitos).
        whatsappNumber: (window.VITRINE_CONFIG || {}).whatsappNumber || '5544999999999',

        // Valor mínimo para frete grátis (em reais).
        freeShippingFrom: 150,

        // Newsletter: cole aqui o endereço de um serviço de formulário
        // (ex.: 'https://formspree.io/f/xxxxxxxx'). Se ficar vazio,
        // a seção de newsletter é escondida.
        newsletterEndpoint: '',

        // Cupons de desconto disponíveis: CODIGO: porcentagem (0.10 = 10%)
        coupons: {
            'BEMVINDO10': 0.10,
            'MARINGA15': 0.15
        }
    };

    const STORAGE_KEYS = {
        age: 'vitrine:idade-verificada',
        cart: 'vitrine:carrinho'
    };

    /* ======================================================================
       UTILITÁRIOS
       ====================================================================== */
    const $ = (selector, scope = document) => scope.querySelector(selector);
    const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

    const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    const prefersReducedMotion = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Cache em memória dos CEPs já consultados nesta visita (não é persistido:
    // some ao recarregar a página). Evita bater na API de novo se a pessoa
    // apagar e digitar o mesmo CEP, ou abrir/fechar o carrinho várias vezes.
    const cepCache = new Map();

    // localStorage pode falhar (modo privado, bloqueado etc.), então protegemos tudo.
    const storage = {
        get(key) {
            try {
                return window.localStorage.getItem(key);
            } catch (error) {
                return null;
            }
        },
        set(key, value) {
            try {
                window.localStorage.setItem(key, value);
            } catch (error) {
                /* sem armazenamento: o site continua funcionando, só não lembra */
            }
        }
    };

    /* ======================================================================
       1. VERIFICAÇÃO DE IDADE
       ====================================================================== */
    function initAgeGate() {
        const dialog = $('#age-gate');
        if (!dialog) return;

        // Já confirmou antes: não pergunta de novo.
        if (storage.get(STORAGE_KEYS.age) === 'true') return;

        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', ''); // navegadores muito antigos
        }

        // Esc não pode fechar o aviso.
        dialog.addEventListener('cancel', (event) => event.preventDefault());

        const form = $('#age-gate-form');
        const title = $('#age-gate-title');
        const description = $('#age-gate-desc');

        // "Sim": o <form method="dialog"> fecha o aviso sozinho; só lembramos a resposta.
        form.addEventListener('submit', () => {
            storage.set(STORAGE_KEYS.age, 'true');
        });

        // "Não": o aviso continua aberto, sem saída, com uma mensagem de acesso restrito.
        $('#btn-no').addEventListener('click', () => {
            title.textContent = 'Acesso restrito';
            description.textContent = 'Desculpe, este site é destinado apenas a maiores de 18 anos.';
            form.hidden = true;
            title.focus();
        });
    }

    /* ======================================================================
       2. VITRINE: desenha os cards a partir do catálogo (Supabase ou reserva)
       ====================================================================== */
    function cardMarkup(product) {
        const photo = (product.fotos && product.fotos[0]) || {};
        const esgotado = Number.isFinite(product.estoque) && product.estoque <= 0;

        return `
            <article class="product-card" data-id="${esc(product.id)}" data-estilo="${esc(product.categoria || 'outro')}">
                <figure class="product-card__figure">
                    <a href="produto.html?id=${encodeURIComponent(product.id)}" class="product-card__figure-link" tabindex="-1" aria-hidden="true">
                        <img src="${esc(photo.src || '')}" alt="${esc(photo.alt || '')}" class="product-card__img" loading="lazy" width="300" height="400">
                    </a>
                </figure>
                <div class="product-card__details">
                    <h3 class="product-card__name"><a href="produto.html?id=${encodeURIComponent(product.id)}" class="product-card__link">${esc(product.nome)}</a></h3>
                    <p class="product-card__style">${esc(product.estilo)}</p>
                    <ul class="product-card__specs" aria-label="Especificações da cerveja">
                        ${product.abv ? `<li class="product-card__spec"><abbr title="Alcohol by Volume">ABV</abbr>: ${esc(product.abv)}</li>` : ''}
                        ${product.ibu ? `<li class="product-card__spec"><abbr title="International Bitterness Units">IBU</abbr>: ${esc(product.ibu)}</li>` : ''}
                        ${product.volume ? `<li class="product-card__spec">${esc(product.volume)}</li>` : ''}
                    </ul>
                    <p class="product-card__price-wrapper">
                        <data value="${Number(product.preco).toFixed(2)}" class="product-card__price">${brl.format(product.preco)}</data>
                    </p>
                    ${esgotado
                        ? '<p class="product-card__stock product-card__stock--out">Esgotado</p>'
                        : `<button type="button" class="btn btn--primary product-card__add-btn" aria-label="Adicionar ${esc(product.nome)} ao carrinho">Adicionar ao carrinho</button>`}
                </div>
            </article>`;
    }

    // Escapa texto antes de colocar no HTML dos cards (os dados podem vir do painel do admin).
    const esc = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    function renderShowcase(produtos) {
        const grid = $('#showcase-grid');
        const loading = $('#showcase-loading');
        if (!grid) return; // página sem vitrine (ex.: produto.html, conta.html)

        grid.innerHTML = (produtos || []).map(cardMarkup).join('');
        if (loading) loading.hidden = true;
    }

    /* ======================================================================
       3. FILTROS POR ESTILO
       ====================================================================== */
    function initFilters() {
        const form = $('#filters-form');
        if (!form) return;

        const cards = $$('.product-card');
        const status = $('#filters-status');

        const applyFilters = () => {
            const selected = $$('input[name="estilo"]:checked', form).map((input) => input.value);
            let visible = 0;

            cards.forEach((card) => {
                const show = selected.length === 0 || selected.includes(card.dataset.estilo);
                card.hidden = !show;
                if (show) visible += 1;
            });

            status.textContent = selected.length === 0
                ? `Mostrando todas as ${cards.length} cervejas.`
                : `Mostrando ${visible} de ${cards.length} cervejas.`;
        };

        form.addEventListener('change', applyFilters);

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            applyFilters();
            $('#vitrine').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        });

        $('#filters-clear').addEventListener('click', () => {
            $$('input[name="estilo"]', form).forEach((input) => { input.checked = false; });
            applyFilters();
        });

        applyFilters();
    }

    /* ======================================================================
       4. CARRINHO DE COMPRAS E CUPOM DE DESCONTO
       ====================================================================== */
    function initCart() {
        const dialog = $('#cart-dialog');
        const toggleBtn = $('#cart-toggle');
        if (!dialog || !toggleBtn) return;

        const countEl = $('#cart-count');
        const itemsEl = $('#cart-items');
        const emptyEl = $('#cart-empty');
        const footerEl = $('#cart-footer');
        const totalEl = $('#cart-total');
        const shippingEl = $('#cart-shipping');
        const statusEl = $('#cart-status');
        const checkoutBtn = $('#cart-checkout');

        // Aviso do carrinho e tela de "pedido registrado"
        const noticeEl = $('#cart-notice');
        const successEl = $('#cart-success');
        const successNumberEl = $('#cart-success-number');
        const successWhatsappEl = $('#cart-success-whatsapp');

        // Pagamento com Pix (Mercado Pago) — ver startPixPayment()/checkPixStatus() abaixo
        const pixBtn = $('#cart-pix-btn');
        const pixMsgEl = $('#cart-pix-msg');
        const pixQrEl = $('#cart-pix-qr');
        const pixQrImgEl = $('#cart-pix-qr-img');
        const pixCodeInput = $('#cart-pix-code');
        const pixCopyBtn = $('#cart-pix-copy');
        const pixStatusEl = $('#cart-pix-status');

        // Elementos do Cupom de Desconto
        const couponInput = $('#cart-coupon-input');
        const couponApplyBtn = $('#cart-coupon-apply');
        const couponMsgEl = $('#cart-coupon-msg');
        const discountRowEl = $('#cart-discount-row');
        const couponNameEl = $('#cart-coupon-name');
        const discountEl = $('#cart-discount');

        // Elementos do endereço de entrega (CEP via ViaCEP)
        const cepInput = $('#cart-cep');
        const cepStatusEl = $('#cart-cep-status');
        const addressFieldsEl = $('#cart-address-fields');
        const numeroInput = $('#cart-numero');
        const complementoInput = $('#cart-complemento');

        let cart = loadCart();
        let activeCoupon = null; // Guarda o código do cupom aplicado
        let resolvedAddress = null; // { cep, rua, bairro, cidade, uf }, preenchido pelo ViaCEP

        /* ---------- Persistência ---------- */
        function loadCart() {
            try {
                return sanitizeCart(JSON.parse(storage.get(STORAGE_KEYS.cart) || '[]'));
            } catch (error) {
                return [];
            }
        }

        function saveCart() {
            storage.set(STORAGE_KEYS.cart, JSON.stringify(cart));
        }

        /* ---------- Cálculos (regras puras importadas de js/modules/) ---------- */
        const totalItems = () => cartTotalItems(cart);
        const totalPrice = () => cartTotalPrice(cart);
        const discountValue = () => calculateDiscount(totalPrice(), findCouponRate(activeCoupon, CONFIG.coupons));
        const finalPrice = () => calculateFinalPrice(totalPrice(), discountValue());

        function announce(message) {
            statusEl.textContent = '';
            // pequeno atraso para o leitor de tela perceber a mudança
            window.setTimeout(() => { statusEl.textContent = message; }, 50);
        }

        /* ---------- Ações (mexem no DOM/localStorage; o cálculo em si é puro) ---------- */
        function addItem(product, qty = 1) {
            if (successEl) successEl.hidden = true;
            cart = addItemToCart(cart, product, qty, MAX_QTY);
            saveCart();
            render();
            announce(`${product.name} adicionada ao carrinho. ${totalItems()} itens no total.`);
        }

        function changeQty(id, delta) {
            cart = changeCartQty(cart, id, delta, MAX_QTY);
            saveCart();
            render();
        }

        function removeItem(id) {
            const item = cart.find((entry) => entry.id === id);
            cart = removeCartItem(cart, id);
            saveCart();
            render();
            if (item) announce(`${item.name} removida do carrinho.`);
        }

        function clearCart() {
            cart = [];
            activeCoupon = null;
            if (couponInput) couponInput.value = '';
            if (couponMsgEl) couponMsgEl.textContent = '';
            resetAddress();
            saveCart();
            render();
            announce('Carrinho esvaziado.');
        }

        function applyCoupon() {
            if (!couponInput || !couponMsgEl) return;

            const code = couponInput.value.trim().toUpperCase();

            if (!code) {
                activeCoupon = null;
                couponMsgEl.textContent = 'Digite um código de cupom.';
                render();
                return;
            }

            const rate = findCouponRate(code, CONFIG.coupons);
            if (rate) {
                activeCoupon = code;
                const pct = Math.round(rate * 100);
                couponMsgEl.textContent = `Cupom ${code} (${pct}% OFF) aplicado!`;
                announce(`Cupom ${code} com ${pct} por cento de desconto aplicado.`);
            } else {
                activeCoupon = null;
                couponMsgEl.textContent = 'Cupom inválido ou expirado.';
                announce('Cupom inválido ou expirado.');
            }

            render();
        }

        /* ---------- Endereço de entrega (CEP via ViaCEP) ---------- */
        let cepDebounceTimer = null;
        let cepAbortController = null;

        function setCepStatus(text, type = '') {
            if (!cepStatusEl) return;
            cepStatusEl.textContent = text;
            cepStatusEl.className = `cart__cep-status${type ? ` cart__cep-status--${type}` : ''}`;
        }

        function clearResolvedAddress() {
            resolvedAddress = null;
            if (addressFieldsEl) addressFieldsEl.hidden = true;
        }

        const CEP_ERROR_MESSAGES = {
            formato_invalido: 'CEP precisa ter 8 dígitos.',
            nao_encontrado: 'CEP não encontrado. Confira o número ou preencha o endereço pelo WhatsApp mesmo.',
            falha_rede: 'Não foi possível consultar o CEP agora. Você pode preencher o endereço pelo WhatsApp.'
        };

        async function lookupCep(rawCep) {
            const cep = normalizeCep(rawCep);

            if (cepAbortController) cepAbortController.abort(); // cancela uma busca anterior ainda em andamento

            if (!cep) {
                setCepStatus('');
                clearResolvedAddress();
                return;
            }

            if (!isValidCep(cep)) {
                setCepStatus(cep.length < 8 ? '' : CEP_ERROR_MESSAGES.formato_invalido, cep.length < 8 ? '' : 'error');
                clearResolvedAddress();
                return;
            }

            if (cepCache.has(cep)) {
                resolvedAddress = cepCache.get(cep);
                setCepStatus(`${resolvedAddress.rua ? resolvedAddress.rua + ', ' : ''}${resolvedAddress.bairro}, ${resolvedAddress.cidade} - ${resolvedAddress.uf}`, 'success');
                if (addressFieldsEl) addressFieldsEl.hidden = false;
                return;
            }

            cepAbortController = new AbortController();
            const { signal } = cepAbortController;
            setCepStatus('Buscando endereço...');

            try {
                const address = await fetchAddressByCep(cep, { signal });
                if (signal.aborted) return; // chegou atrasado (CEP já mudou de novo)

                cepCache.set(cep, address);
                resolvedAddress = address;
                setCepStatus(`${address.rua ? address.rua + ', ' : ''}${address.bairro}, ${address.cidade} - ${address.uf}`, 'success');
                if (addressFieldsEl) addressFieldsEl.hidden = false;
            } catch (error) {
                if (error && error.name === 'AbortError') return; // cancelado, não é erro de verdade
                setCepStatus(CEP_ERROR_MESSAGES[error && error.code] || CEP_ERROR_MESSAGES.falha_rede, 'error');
                clearResolvedAddress();
            }
        }

        // Espera a pessoa parar de digitar por 500ms antes de consultar
        // (evita uma chamada à API a cada tecla digitada).
        function onCepInput() {
            window.clearTimeout(cepDebounceTimer);
            cepDebounceTimer = window.setTimeout(() => lookupCep(cepInput.value), 500);
        }

        function deliveryAddressLine() {
            if (!resolvedAddress) return null;
            const numero = numeroInput ? numeroInput.value.trim() : '';
            const complemento = complementoInput ? complementoInput.value.trim() : '';
            const partes = [
                resolvedAddress.rua && numero ? `${resolvedAddress.rua}, ${numero}` : resolvedAddress.rua,
                complemento,
                resolvedAddress.bairro,
                `${resolvedAddress.cidade} - ${resolvedAddress.uf}`,
                `CEP ${resolvedAddress.cep}`
            ].filter(Boolean);
            return partes.join(', ');
        }

        function resetAddress() {
            if (cepInput) cepInput.value = '';
            if (numeroInput) numeroInput.value = '';
            if (complementoInput) complementoInput.value = '';
            setCepStatus('');
            clearResolvedAddress();
        }

        /* ---------- Renderização ---------- */
        function createQtyButton(label, text, action, id) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'cart__qty-btn';
            button.setAttribute('aria-label', label);
            button.dataset.action = action;
            button.dataset.id = id;
            button.textContent = text;
            return button;
        }

        function createItemElement(item) {
            const li = document.createElement('li');
            li.className = 'cart__item';

            const info = document.createElement('div');
            info.className = 'cart__item-info';

            const name = document.createElement('p');
            name.className = 'cart__item-name';
            name.textContent = item.name;

            const unit = document.createElement('p');
            unit.className = 'cart__item-unit';
            unit.textContent = `${brl.format(item.price)} cada`;

            info.append(name, unit);

            const controls = document.createElement('div');
            controls.className = 'cart__item-controls';

            const qty = document.createElement('span');
            qty.className = 'cart__qty';
            qty.textContent = String(item.qty);
            qty.setAttribute('aria-label', `Quantidade: ${item.qty}`);

            controls.append(
                createQtyButton(`Diminuir quantidade de ${item.name}`, '−', 'decrease', item.id),
                qty,
                createQtyButton(`Aumentar quantidade de ${item.name}`, '+', 'increase', item.id)
            );

            const subtotal = document.createElement('p');
            subtotal.className = 'cart__item-subtotal';
            subtotal.textContent = brl.format(item.price * item.qty);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'cart__remove';
            remove.dataset.action = 'remove';
            remove.dataset.id = item.id;
            remove.setAttribute('aria-label', `Remover ${item.name} do carrinho`);
            remove.textContent = 'Remover';

            li.append(info, controls, subtotal, remove);
            return li;
        }

        function render() {
            const items = totalItems();
            const discount = discountValue();
            const finalTotal = finalPrice();

            // Contador do cabeçalho
            countEl.textContent = String(items);
            countEl.hidden = items === 0;
            toggleBtn.setAttribute(
                'aria-label',
                `Abrir carrinho, ${items} ${items === 1 ? 'item' : 'itens'}`
            );

            // Lista
            itemsEl.replaceChildren(...cart.map(createItemElement));
            emptyEl.hidden = cart.length > 0 || Boolean(successEl && !successEl.hidden);
            footerEl.hidden = cart.length === 0;

            // Linha de Desconto (se os elementos existirem no HTML)
            if (discountRowEl && couponNameEl && discountEl) {
                if (activeCoupon && discount > 0) {
                    discountRowEl.hidden = false;
                    couponNameEl.textContent = activeCoupon;
                    discountEl.textContent = `- ${brl.format(discount)}`;
                } else {
                    discountRowEl.hidden = true;
                }
            }

            // Total e frete
            totalEl.textContent = brl.format(finalTotal);
            const missing = CONFIG.freeShippingFrom - finalTotal;
            shippingEl.textContent = missing > 0
                ? `Faltam ${brl.format(missing)} para o frete grátis.`
                : 'Você ganhou frete grátis!';
        }

        /* ---------- Finalizar pedido ---------- */
        function setNotice(message) {
            if (!noticeEl) return;
            if (message) {
                noticeEl.replaceChildren(message);
            } else {
                noticeEl.replaceChildren();
            }
        }

        // Pede para entrar na conta, com link que volta para esta mesma página depois do login
        function showLoginNotice() {
            if (!noticeEl) return;

            const page = (window.location.pathname.split('/').pop() || 'index.html') + window.location.search;
            const link = document.createElement('a');
            link.href = `conta.html?voltar=${encodeURIComponent(page)}`;
            link.className = 'cart__notice-link';
            link.textContent = 'entre ou crie sua conta';

            noticeEl.replaceChildren(
                'Para finalizar e acompanhar seu pedido, ',
                link,
                '. Seu carrinho fica guardado.'
            );
        }

        function buildOrderMessage(orderNumber) {
            const lines = cart.map((item) =>
                `${item.qty}x ${item.name} - ${brl.format(item.price * item.qty)}`
            );

            const discount = discountValue();
            const summaryLines = discount > 0
                ? [
                    `Subtotal: ${brl.format(totalPrice())}`,
                    `Cupom (${activeCoupon}): -${brl.format(discount)}`,
                    `Total com desconto: ${brl.format(finalPrice())}`
                ]
                : [`Total: ${brl.format(totalPrice())}`];

            const endereco = deliveryAddressLine();

            return [
                orderNumber
                    ? `Olá! Acabei de fazer o pedido #${orderNumber} no site:`
                    : 'Olá! Gostaria de fazer um pedido:',
                '',
                ...lines,
                '',
                ...summaryLines,
                '',
                ...(orderNumber ? [] : ['Nome:']),
                endereco
                    ? `Endereço de entrega: ${endereco}`
                    : 'Endereço de entrega (ou "retirar na fábrica"):'
            ].join('\n');
        }

        const whatsappUrl = (message) =>
            `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;

        /* ---------- Pagamento com Pix (Mercado Pago) ----------
           A confirmação é automática via Edge Function (webhook do Mercado
           Pago). Como pagamento de TESTE nem sempre dispara o webhook de
           forma confiável, também verificamos sozinhos de tempos em tempos
           (checkPixStatus) enquanto o QR Code estiver na tela — então o
           pedido é marcado como pago assim que qualquer um dos dois
           confirmar, o que vier primeiro. Ver docs/PAGAMENTOS.md. */
        const PIX_POLL_INTERVAL_MS = 4000;
        const PIX_POLL_TIMEOUT_MS = 10 * 60 * 1000; // para de verificar sozinho depois de 10min
        let pixPollTimer = null;
        let pixPollStartedAt = 0;

        function setPixMessage(text, type = '') {
            if (!pixMsgEl) return;
            pixMsgEl.textContent = text;
            pixMsgEl.className = `cart__pix-msg${type ? ` cart__pix-msg--${type}` : ''}`;
        }

        function setPixStatus(text, type = '') {
            if (!pixStatusEl) return;
            pixStatusEl.textContent = text;
            pixStatusEl.className = `cart__pix-status${type ? ` cart__pix-status--${type}` : ''}`;
        }

        function stopPixPolling() {
            if (pixPollTimer) window.clearInterval(pixPollTimer);
            pixPollTimer = null;
        }

        function resetPixUI() {
            stopPixPolling();
            if (pixBtn) {
                pixBtn.hidden = false;
                pixBtn.disabled = false;
                pixBtn.textContent = 'Pagar com Pix';
            }
            if (pixQrEl) pixQrEl.hidden = true;
            setPixMessage('');
            setPixStatus('Aguardando pagamento...');
        }

        async function checkPixStatus(orderId) {
            const auth = window.vitrineAuth;
            if (!auth) return;

            try {
                const client = await auth.getClient();
                const { data, error } = await client.functions.invoke('check-pix-payment', {
                    body: { order_id: orderId }
                });
                if (error || !data) return; // tenta de novo no próximo intervalo

                if (data.status === 'pago') {
                    stopPixPolling();
                    setPixStatus('Pagamento confirmado! 🎉', 'success');
                    if (pixCopyBtn) pixCopyBtn.hidden = true;
                    announce('Pagamento confirmado pelo Pix.');
                    return;
                }

                if (Date.now() - pixPollStartedAt > PIX_POLL_TIMEOUT_MS) {
                    stopPixPolling();
                    setPixStatus('Ainda não identificamos o pagamento. Se já pagou, acompanhe em "Minha conta" — pode levar alguns minutos.', '');
                }
            } catch (error) {
                /* falha pontual: tenta de novo no próximo intervalo, sem incomodar com mensagem */
            }
        }

        async function startPixPayment(orderId) {
            const auth = window.vitrineAuth;
            if (!auth || !pixBtn) return;

            pixBtn.disabled = true;
            pixBtn.textContent = 'Gerando o Pix...';
            setPixMessage('');

            try {
                const client = await auth.getClient();
                const { data, error } = await client.functions.invoke('create-pix-payment', {
                    body: { order_id: orderId }
                });
                if (error) throw error;
                if (data && data.error) throw new Error(data.error);

                pixQrImgEl.src = `data:image/png;base64,${data.qr_code_base64}`;
                pixCodeInput.value = data.qr_code;
                if (pixCopyBtn) pixCopyBtn.hidden = false;
                pixQrEl.hidden = false;
                pixBtn.hidden = true;
                setPixStatus('Aguardando pagamento... a confirmação é automática.');

                pixPollStartedAt = Date.now();
                stopPixPolling();
                pixPollTimer = window.setInterval(() => checkPixStatus(orderId), PIX_POLL_INTERVAL_MS);
            } catch (error) {
                setPixMessage('Não foi possível gerar o Pix agora. Você pode finalizar pelo WhatsApp.', 'error');
                pixBtn.disabled = false;
                pixBtn.textContent = 'Pagar com Pix';
            }
        }

        // Pedido salvo: esvazia o carrinho e mostra o botão para enviar pelo WhatsApp
        // (e, se o backend estiver configurado, o de pagar com Pix)
        function showOrderRegistered(orderId, orderNumber, message) {
            successNumberEl.textContent = `#${orderNumber}`;
            successWhatsappEl.href = whatsappUrl(message);
            resetPixUI();
            if (pixBtn) pixBtn.dataset.orderId = orderId;

            cart = [];
            activeCoupon = null;
            if (couponInput) couponInput.value = '';
            if (couponMsgEl) couponMsgEl.textContent = '';
            resetAddress();
            saveCart();

            successEl.hidden = false;
            render();
            announce(`Pedido ${orderNumber} registrado.`);
            successEl.querySelector('.cart__success-title').scrollIntoView({ block: 'nearest' });
        }

        async function checkout() {
            if (cart.length === 0) return;

            const auth = window.vitrineAuth;
            setNotice('');

            // Área do cliente não configurada: segue direto para o WhatsApp
            if (!auth || !auth.isConfigured() || !successEl) {
                window.open(whatsappUrl(buildOrderMessage()), '_blank', 'noopener');
                return;
            }

            checkoutBtn.disabled = true;

            try {
                const session = await auth.getSession();
                if (!session) {
                    showLoginNotice();
                    return;
                }

                const client = await auth.getClient();
                const { data, error } = await client.rpc('criar_pedido', {
                    p_itens: cart.map((item) => ({
                        id: item.id,
                        nome: item.name,
                        preco: item.price,
                        qtd: item.qty
                    })),
                    p_cupom: activeCoupon,
                    p_desconto: Number(discountValue().toFixed(2))
                });

                if (error) throw error;

                const order = Array.isArray(data) ? data[0] : data;
                showOrderRegistered(order.id, order.numero, buildOrderMessage(order.numero));
            } catch (error) {
                setNotice('Não foi possível registrar o pedido agora. Confira sua conexão e tente novamente.');
            } finally {
                checkoutBtn.disabled = false;
            }
        }

        /* ---------- Eventos ---------- */
        // Botões "Adicionar ao carrinho" nos cards da vitrine. Delegação no
        // container (em vez de um listener por card): os cards são desenhados
        // depois, quando o catálogo termina de carregar.
        const showcaseGrid = $('#showcase-grid');
        if (showcaseGrid) {
            showcaseGrid.addEventListener('click', (event) => {
                const button = event.target.closest('.product-card__add-btn');
                if (!button) return;

                const card = button.closest('.product-card');
                if (!card) return;

                addItem({
                    id: card.dataset.id,
                    name: $('.product-card__name', card).textContent.trim(),
                    price: parseFloat($('data', card).value)
                });

                // Feedback visual rápido no botão
                const original = button.textContent;
                button.textContent = 'Adicionado ✓';
                window.setTimeout(() => { button.textContent = original; }, 1200);
            });
        }

        // Botões dentro do carrinho (+, −, remover)
        itemsEl.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            const { action, id } = button.dataset;
            if (action === 'increase') changeQty(id, 1);
            if (action === 'decrease') changeQty(id, -1);
            if (action === 'remove') removeItem(id);
        });

        // Eventos do Cupom (botão Aplicar e tecla Enter no campo)
        if (couponApplyBtn && couponInput) {
            couponApplyBtn.addEventListener('click', applyCoupon);
            couponInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyCoupon();
                }
            });
        }

        // Evento do CEP (busca com debounce, ver onCepInput/lookupCep acima)
        if (cepInput) {
            cepInput.addEventListener('input', onCepInput);
        }

        checkoutBtn.addEventListener('click', checkout);
        $('#cart-clear').addEventListener('click', clearCart);

        // Eventos do pagamento com Pix
        if (pixBtn) {
            pixBtn.addEventListener('click', () => {
                const orderId = pixBtn.dataset.orderId;
                if (orderId) startPixPayment(orderId);
            });
        }
        if (pixCopyBtn && pixCodeInput) {
            pixCopyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(pixCodeInput.value);
                } catch (error) {
                    // Sem permissão/API de clipboard: seleciona o texto pra copiar manual (Ctrl+C)
                    pixCodeInput.select();
                }
                const original = pixCopyBtn.textContent;
                pixCopyBtn.textContent = 'Copiado!';
                window.setTimeout(() => { pixCopyBtn.textContent = original; }, 1500);
            });
        }

        // Abrir e fechar o painel
        toggleBtn.addEventListener('click', () => {
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
            } else {
                dialog.setAttribute('open', '');
            }
        });
        $('#cart-close').addEventListener('click', () => dialog.close());

        // Ao fechar o painel, some o aviso e a tela de "pedido registrado"
        // (e para de verificar o Pix sozinho — se já pagou, o webhook ainda
        // confirma por trás; "Minha conta" mostra o status atualizado)
        dialog.addEventListener('close', () => {
            setNotice('');
            stopPixPolling();
            if (successEl && !successEl.hidden) {
                successEl.hidden = true;
                render();
            }
        });

        // Clique fora do painel (no fundo escurecido) também fecha
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close();
        });

        render();

        // Permite que outras páginas/scripts (ex.: produto.js) adicionem itens ao carrinho.
        window.vitrine = { addToCart: addItem };
    }

    /* ======================================================================
       5. NEWSLETTER (só funciona com endpoint configurado)
       ====================================================================== */
    function initNewsletter() {
        const section = $('#newsletter');
        if (!section) return;

        // Sem servidor para receber os e-mails, não faz sentido mostrar o formulário.
        if (!CONFIG.newsletterEndpoint) {
            section.hidden = true;
            return;
        }

        const form = $('#newsletter-form');
        const message = $('#newsletter-message');
        const submit = $('button[type="submit"]', form);

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            submit.disabled = true;
            message.textContent = 'Enviando...';

            try {
                const response = await fetch(CONFIG.newsletterEndpoint, {
                    method: 'POST',
                    body: new FormData(form),
                    headers: { Accept: 'application/json' }
                });

                if (!response.ok) throw new Error('Falha no envio');

                form.reset();
                message.textContent = 'Inscrição feita! Obrigado.';
            } catch (error) {
                message.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
            } finally {
                submit.disabled = false;
            }
        });
    }

    /* ======================================================================
       INICIALIZAÇÃO (o script usa "defer", então o HTML já está pronto)
       ====================================================================== */

    initAgeGate();
    initCart(); // não depende dos produtos (carrinho já salvo + delegação de eventos)
    initNewsletter();

    // Desenha a vitrine e liga os filtros assim que o catálogo (Supabase ou
    // reserva estática) estiver pronto.
    (window.VITRINE_CATALOG_READY || Promise.resolve(window.PRODUTOS || [])).then((produtos) => {
        renderShowcase(produtos);
        initFilters();
    });
})();