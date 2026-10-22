/**
 * Página de produto (produto.html?id=...)
 * Lê os dados de js/produtos.js e monta:
 * - Carrossel de fotos
 * - Resumo, preço e botão de compra
 * - Sobre a cerveja, detalhes e fábrica
 * O carrinho vem do js/main.js (window.vitrine.addToCart).
 */
(() => {
    'use strict';

    const root = document.getElementById('produto-root');
    if (!root) return;

    const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const MAX_QTY = 99;

    // Escapa texto antes de colocar no HTML.
    const esc = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const prefersReducedMotion = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Só considera "esgotado" quando o produto tem controle de estoque (vindo do
    // Supabase) e ele chegou a zero. Produtos sem esse campo (reserva estática)
    // continuam disponíveis como sempre.
    const outOfStock = (item) => Number.isFinite(item.estoque) && item.estoque <= 0;

    // Compara dois produtos ignorando a diferença de formato entre a reserva
    // estática (produtos.js, sem o campo "estoque") e o que vem do Supabase
    // (sempre com "estoque", nem que seja 0) — sem isso, a comparação
    // JSON.stringify ingênua nunca bateria, e repintaríamos à toa sempre
    // que os dados reais chegassem, mesmo sem nada ter mudado de verdade.
    const sameProduct = (a, b) => {
        const normalize = (p) => JSON.stringify({ ...p, estoque: Number.isFinite(p.estoque) ? p.estoque : 0 });
        return normalize(a) === normalize(b);
    };

    const productId = new URLSearchParams(window.location.search).get('id');
    const fallbackProdutos = window.PRODUTOS || [];
    const fallbackProduct = fallbackProdutos.find((item) => item.id === productId);

    // Pinta com os dados que já temos em mãos (a reserva estática, carregada
    // de forma síncrona) assim que a página abre — sem esperar a rede.
    // Isso evita o rodapé "pulando" quando o Supabase demora a responder
    // (CLS alto). Se o catálogo do Supabase trouxer dados diferentes
    // (preço/estoque atualizados no painel do admin), repintamos; se vier
    // igual (o caso mais comum), não repintamos de novo.
    if (fallbackProduct) {
        renderProduct(fallbackProduct);
        updateMetaTags(fallbackProduct);
        initGallery();
        initBuyBox(fallbackProduct);
    }

    (window.VITRINE_CATALOG_READY || Promise.resolve(fallbackProdutos)).then((produtos) => {
        const product = (produtos || []).find((item) => item.id === productId);

        if (!product) {
            if (!fallbackProduct) renderNotFound();
            return;
        }

        if (fallbackProduct && sameProduct(product, fallbackProduct)) {
            return; // já está na tela, igualzinho
        }

        renderProduct(product);
        updateMetaTags(product);
        initGallery();
        initBuyBox(product);
    });

    /* ======================================================================
       PRODUTO NÃO ENCONTRADO
       ====================================================================== */
    function renderNotFound() {
        document.title = 'Produto não encontrado | Cervejaria Artesanal';
        root.innerHTML = `
            <section class="not-found">
                <h1 class="not-found__title">Produto não encontrado</h1>
                <p class="not-found__text">Não achamos essa cerveja. Ela pode ter saído de linha ou o endereço está incorreto.</p>
                <a href="index.html#vitrine" class="btn btn--primary">Ver todas as cervejas</a>
            </section>`;
    }

    /* ======================================================================
       MONTAGEM DA PÁGINA
       ====================================================================== */
    function galleryMarkup(item) {
        const photos = item.fotos || [];
        const many = photos.length > 1;

        const slides = photos.map((photo, index) => `
            <li class="gallery__slide">
                <img src="${esc(photo.src)}" alt="${esc(photo.alt)}"
                     width="800" height="1000" ${index === 0 ? '' : 'loading="lazy"'}>
            </li>`).join('');

        const controls = many ? `
            <button type="button" class="gallery__btn gallery__btn--prev" aria-label="Foto anterior">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button type="button" class="gallery__btn gallery__btn--next" aria-label="Próxima foto">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <p class="gallery__counter" role="status">1 / ${photos.length}</p>` : '';

        const thumbs = many ? `
            <ul class="gallery__thumbs">
                ${photos.map((photo, index) => `
                <li>
                    <button type="button" class="gallery__thumb" data-index="${index}" aria-label="Ver foto ${index + 1} de ${photos.length}">
                        <img src="${esc(photo.src)}" alt="" width="96" height="120" loading="lazy">
                    </button>
                </li>`).join('')}
            </ul>` : '';

        return `
            <div class="gallery" role="group" aria-roledescription="carrossel" aria-label="Fotos de ${esc(item.nome)}">
                <div class="gallery__viewport">
                    <ul class="gallery__track" ${many ? 'tabindex="0" aria-label="Fotos, use as setas do teclado para navegar"' : ''}>${slides}</ul>
                    ${controls}
                </div>
                ${thumbs}
            </div>`;
    }

    function detailsMarkup(item) {
        const rows = [
            ['Estilo', item.estilo],
            ['Teor alcoólico (ABV)', item.abv],
            ['Amargor (IBU)', item.ibu],
            ['Volume', item.volume],
            ['Temperatura ideal', item.temperatura],
            ['Copo indicado', item.copo],
            ['Harmoniza com', item.harmonizacao]
        ].filter(([, value]) => value);

        return rows.map(([label, value]) => `
            <div class="details__row">
                <dt>${esc(label)}</dt>
                <dd>${esc(value)}</dd>
            </div>`).join('');
    }

    function factoryMarkup() {
        const factory = window.FABRICA;
        if (!factory) return '';

        const texts = (factory.textos || []).map((text) => `<p>${esc(text)}</p>`).join('');
        const photos = (factory.fotos || []).length ? `
            <ul class="factory__photos">
                ${factory.fotos.map((photo) => `
                <li><img src="${esc(photo.src)}" alt="${esc(photo.alt)}" loading="lazy" width="600" height="400"></li>`).join('')}
            </ul>` : '';

        return `
            <section class="product-section" aria-labelledby="fabrica-titulo">
                <div class="product-section__inner">
                    <h2 id="fabrica-titulo" class="product-section__title">${esc(factory.titulo || 'Nossa fábrica')}</h2>
                    <div class="product-section__body">
                        ${texts}
                        ${photos}
                        <a href="index.html#vitrine" class="factory__link">Ver todas as cervejas</a>
                    </div>
                </div>
            </section>`;
    }

    function renderProduct(item) {
        const about = (item.sobre || []).map((text) => `<p>${esc(text)}</p>`).join('');

        root.innerHTML = `
            <nav class="breadcrumb" aria-label="Você está em">
                <ol class="breadcrumb__list">
                    <li><a href="index.html">Início</a></li>
                    <li><a href="index.html#vitrine">Cervejas</a></li>
                    <li aria-current="page">${esc(item.nome)}</li>
                </ol>
            </nav>

            <section class="product-page" aria-labelledby="produto-titulo">
                ${galleryMarkup(item)}

                <div class="product-page__summary">
                    <p class="product-page__style">${esc(item.estilo)}</p>
                    <h1 id="produto-titulo" class="product-page__title">${esc(item.nome)}</h1>
                    <p class="product-page__lead">${esc(item.resumo)}</p>

                    <ul class="product-page__specs" aria-label="Especificações da cerveja">
                        <li class="product-page__spec"><abbr title="Alcohol by Volume">ABV</abbr>: ${esc(item.abv)}</li>
                        <li class="product-page__spec"><abbr title="International Bitterness Units">IBU</abbr>: ${esc(item.ibu)}</li>
                        <li class="product-page__spec">${esc(item.volume)}</li>
                    </ul>

                    <p class="product-page__price">
                        <data value="${item.preco.toFixed(2)}">${brl.format(item.preco)}</data>
                    </p>

                    ${outOfStock(item) ? '<p class="product-page__stock product-page__stock--out">Esgotado no momento.</p>' : ''}

                    <div class="product-page__buy">
                        <div class="qty" role="group" aria-label="Quantidade">
                            <button type="button" class="qty__btn" id="qty-decrease" aria-label="Diminuir quantidade">−</button>
                            <input type="number" class="qty__input" id="qty-input" value="1" min="1" max="${MAX_QTY}" inputmode="numeric" aria-label="Quantidade">
                            <button type="button" class="qty__btn" id="qty-increase" aria-label="Aumentar quantidade">+</button>
                        </div>
                        <button type="button" class="btn btn--primary product-page__add-btn" id="add-to-cart" ${outOfStock(item) ? 'disabled' : ''}>${outOfStock(item) ? 'Esgotado' : 'Adicionar ao carrinho'}</button>
                    </div>

                    <p class="product-page__note">Frete grátis em compras acima de R$ 150,00. Você também pode retirar na fábrica, em Maringá - PR.</p>
                </div>
            </section>

            <section class="product-section" aria-labelledby="sobre-titulo">
                <div class="product-section__inner">
                    <h2 id="sobre-titulo" class="product-section__title">Sobre a cerveja</h2>
                    <div class="product-section__body">${about}</div>
                </div>
            </section>

            <section class="product-section" aria-labelledby="detalhes-titulo">
                <div class="product-section__inner">
                    <h2 id="detalhes-titulo" class="product-section__title">Detalhes</h2>
                    <dl class="details">${detailsMarkup(item)}</dl>
                </div>
            </section>

            ${factoryMarkup()}`;
    }

    /* ======================================================================
       TÍTULO DA ABA, DESCRIÇÃO E DADOS PARA O GOOGLE
       ====================================================================== */
    function setMeta(selector, value) {
        const element = document.querySelector(selector);
        if (element) element.setAttribute('content', value);
    }

    function updateMetaTags(item) {
        const title = `${item.nome} | Cervejaria Artesanal`;
        const baseUrl = new URL('.', window.location.href).href;
        const photo = item.fotos && item.fotos[0] ? new URL(item.fotos[0].src, baseUrl).href : '';

        document.title = title;
        setMeta('meta[name="description"]', `${item.nome} (${item.estilo}): ${item.resumo} Compre online na Cervejaria Artesanal, em Maringá - PR.`);
        setMeta('meta[property="og:title"]', title);
        setMeta('meta[property="og:description"]', item.resumo);
        setMeta('meta[property="og:url"]', window.location.href);
        if (photo) setMeta('meta[property="og:image"]', photo);

        const schema = document.createElement('script');
        schema.type = 'application/ld+json';
        schema.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: item.nome,
            description: item.resumo,
            image: photo || undefined,
            offers: {
                '@type': 'Offer',
                price: item.preco.toFixed(2),
                priceCurrency: 'BRL',
                availability: 'https://schema.org/InStock'
            }
        });
        document.head.appendChild(schema);
    }

    /* ======================================================================
       CARROSSEL DE FOTOS
       ====================================================================== */
    function initGallery() {
        const track = root.querySelector('.gallery__track');
        const slides = track ? Array.from(track.children) : [];
        if (slides.length < 2) return; // com uma foto só, não há o que navegar

        const prev = root.querySelector('.gallery__btn--prev');
        const next = root.querySelector('.gallery__btn--next');
        const counter = root.querySelector('.gallery__counter');
        const thumbs = Array.from(root.querySelectorAll('.gallery__thumb'));
        let index = 0;

        const update = () => {
            counter.textContent = `${index + 1} / ${slides.length}`;
            prev.disabled = index === 0;
            next.disabled = index === slides.length - 1;
            thumbs.forEach((thumb, i) => {
                if (i === index) {
                    thumb.setAttribute('aria-current', 'true');
                } else {
                    thumb.removeAttribute('aria-current');
                }
            });
        };

        const goTo = (target) => {
            index = Math.max(0, Math.min(target, slides.length - 1));
            track.scrollTo({
                left: index * track.clientWidth,
                behavior: prefersReducedMotion() ? 'auto' : 'smooth'
            });
            update();
        };

        // Quem arrasta com o dedo (ou usa o touchpad) também atualiza o contador.
        track.addEventListener('scroll', () => {
            const current = Math.round(track.scrollLeft / track.clientWidth);
            if (current !== index) {
                index = current;
                update();
            }
        }, { passive: true });

        prev.addEventListener('click', () => goTo(index - 1));
        next.addEventListener('click', () => goTo(index + 1));
        thumbs.forEach((thumb) => {
            thumb.addEventListener('click', () => goTo(Number(thumb.dataset.index)));
        });

        track.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                goTo(index - 1);
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                goTo(index + 1);
            }
        });

        update();
    }

    /* ======================================================================
       QUANTIDADE E BOTÃO DE COMPRA
       ====================================================================== */
    function initBuyBox(item) {
        const input = document.getElementById('qty-input');
        const addButton = document.getElementById('add-to-cart');

        const readQty = () => {
            const value = parseInt(input.value, 10);
            return Number.isFinite(value) ? Math.min(Math.max(value, 1), MAX_QTY) : 1;
        };

        document.getElementById('qty-decrease').addEventListener('click', () => {
            input.value = String(Math.max(readQty() - 1, 1));
        });

        document.getElementById('qty-increase').addEventListener('click', () => {
            input.value = String(Math.min(readQty() + 1, MAX_QTY));
        });

        // Corrige valores digitados fora do limite quando o campo perde o foco.
        input.addEventListener('change', () => {
            input.value = String(readQty());
        });

        addButton.addEventListener('click', () => {
            if (addButton.disabled || outOfStock(item)) return;
            if (!window.vitrine || typeof window.vitrine.addToCart !== 'function') return;

            window.vitrine.addToCart({ id: item.id, name: item.nome, price: item.preco }, readQty());

            const original = addButton.textContent;
            addButton.textContent = 'Adicionado ✓';
            window.setTimeout(() => { addButton.textContent = original; }, 1200);
        });
    }
})();
