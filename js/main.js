/**
 * Arquivo Principal de JavaScript
 * Responsável por:
 * - Controle do Dialog de verificação de idade
 * - Interatividade dos Filtros
 * - Lógica do Carrinho de Compras (salvo no localStorage) e Cupom de Desconto
 * - Expõe window.vitrine.addToCart para a página de produto
 * - Finalização do pedido via WhatsApp
 * - Newsletter (opcional, só aparece se houver um endpoint configurado)
 */
(() => {
    'use strict';

    /* ======================================================================
       CONFIGURAÇÃO — ajuste aqui os dados da sua cervejaria
       ====================================================================== */
    const CONFIG = {
        // Número que recebe os pedidos: país + DDD + número, só dígitos.
        // TODO: troque pelo seu WhatsApp real (este é um número de exemplo).
        whatsappNumber: '5544999999999',

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

    const MAX_QTY = 99;

    /* ======================================================================
       UTILITÁRIOS
       ====================================================================== */
    const $ = (selector, scope = document) => scope.querySelector(selector);
    const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

    const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    const prefersReducedMotion = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
       2. FILTROS POR ESTILO
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
       3. CARRINHO DE COMPRAS E CUPOM DE DESCONTO
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

        // Elementos do Cupom de Desconto
        const couponInput = $('#cart-coupon-input');
        const couponApplyBtn = $('#cart-coupon-apply');
        const couponMsgEl = $('#cart-coupon-msg');
        const discountRowEl = $('#cart-discount-row');
        const couponNameEl = $('#cart-coupon-name');
        const discountEl = $('#cart-discount');

        let cart = loadCart();
        let activeCoupon = null; // Guarda o código do cupom aplicado

        /* ---------- Persistência ---------- */
        function loadCart() {
            try {
                const parsed = JSON.parse(storage.get(STORAGE_KEYS.cart) || '[]');
                if (!Array.isArray(parsed)) return [];
                return parsed.filter((item) =>
                    item &&
                    typeof item.id === 'string' &&
                    typeof item.name === 'string' &&
                    Number.isFinite(item.price) &&
                    Number.isInteger(item.qty) &&
                    item.qty > 0
                );
            } catch (error) {
                return [];
            }
        }

        function saveCart() {
            storage.set(STORAGE_KEYS.cart, JSON.stringify(cart));
        }

        /* ---------- Cálculos ---------- */
        const totalItems = () => cart.reduce((sum, item) => sum + item.qty, 0);
        const totalPrice = () => cart.reduce((sum, item) => sum + item.price * item.qty, 0);
        const discountValue = () => {
            if (!activeCoupon || !CONFIG.coupons[activeCoupon]) return 0;
            return totalPrice() * CONFIG.coupons[activeCoupon];
        };
        const finalPrice = () => Math.max(0, totalPrice() - discountValue());

        function announce(message) {
            statusEl.textContent = '';
            // pequeno atraso para o leitor de tela perceber a mudança
            window.setTimeout(() => { statusEl.textContent = message; }, 50);
        }

        /* ---------- Ações ---------- */
        function addItem(product, qty = 1) {
            const existing = cart.find((item) => item.id === product.id);
            if (existing) {
                existing.qty = Math.min(existing.qty + qty, MAX_QTY);
            } else {
                cart.push({ ...product, qty: Math.min(qty, MAX_QTY) });
            }
            saveCart();
            render();
            announce(`${product.name} adicionada ao carrinho. ${totalItems()} itens no total.`);
        }

        function changeQty(id, delta) {
            const item = cart.find((entry) => entry.id === id);
            if (!item) return;
            item.qty = Math.min(item.qty + delta, MAX_QTY);
            if (item.qty <= 0) {
                removeItem(id);
                return;
            }
            saveCart();
            render();
        }

        function removeItem(id) {
            const item = cart.find((entry) => entry.id === id);
            cart = cart.filter((entry) => entry.id !== id);
            saveCart();
            render();
            if (item) announce(`${item.name} removida do carrinho.`);
        }

        function clearCart() {
            cart = [];
            activeCoupon = null;
            if (couponInput) couponInput.value = '';
            if (couponMsgEl) couponMsgEl.textContent = '';
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

            if (CONFIG.coupons[code]) {
                activeCoupon = code;
                const pct = Math.round(CONFIG.coupons[code] * 100);
                couponMsgEl.textContent = `Cupom ${code} (${pct}% OFF) aplicado!`;
                announce(`Cupom ${code} com ${pct} por cento de desconto aplicado.`);
            } else {
                activeCoupon = null;
                couponMsgEl.textContent = 'Cupom inválido ou expirado.';
                announce('Cupom inválido ou expirado.');
            }

            render();
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
            emptyEl.hidden = cart.length > 0;
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

        /* ---------- Finalizar pedido (WhatsApp) ---------- */
        function checkout() {
            if (cart.length === 0) return;

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

            const message = [
                'Olá! Gostaria de fazer um pedido:',
                '',
                ...lines,
                '',
                ...summaryLines,
                '',
                'Nome:',
                'Endereço de entrega (ou "retirar na fábrica"):'
            ].join('\n');

            const url = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
            window.open(url, '_blank', 'noopener');
        }

        /* ---------- Eventos ---------- */
        // Botões "Adicionar ao carrinho" nos cards
        $$('.product-card').forEach((card) => {
            const button = $('.product-card__add-btn', card);
            if (!button) return;

            button.addEventListener('click', () => {
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
        });

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

        $('#cart-checkout').addEventListener('click', checkout);
        $('#cart-clear').addEventListener('click', clearCart);

        // Abrir e fechar o painel
        toggleBtn.addEventListener('click', () => {
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
            } else {
                dialog.setAttribute('open', '');
            }
        });
        $('#cart-close').addEventListener('click', () => dialog.close());

        // Clique fora do painel (no fundo escurecido) também fecha
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close();
        });

        render();

        // Permite que outras páginas/scripts (ex.: produto.js) adicionem itens ao carrinho.
        window.vitrine = { addToCart: addItem };
    }

    /* ======================================================================
       4. NEWSLETTER (só funciona com endpoint configurado)
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
    initFilters();
    initCart();
    initNewsletter();
})();