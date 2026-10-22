/**
 * Dados dos produtos e da fábrica.
 *
 * É AQUI que você edita os textos e as fotos de cada página de produto.
 *
 * Como adicionar mais fotos a uma cerveja:
 *   1. Coloque o arquivo em assets/img/ (ex.: assets/img/ipa-2.jpg)
 *   2. Acrescente uma linha em "fotos": { src: 'assets/img/ipa-2.jpg', alt: 'Descrição da foto' }
 *   O carrossel mostra setas e miniaturas automaticamente quando há 2 ou mais fotos.
 *
 * Atenção: o preço também aparece nos cartões do index.html; se mudar aqui, mude lá.
 * Os textos abaixo são rascunhos baseados no estilo de cada cerveja: ajuste para a sua receita.
 */
window.FABRICA = {
    titulo: 'Nossa fábrica',
    textos: [
        'Tudo começou com pequenos lotes feitos em casa com o método Brew in a Bag (BIAB). A paixão por testar receitas e moer nosso próprio malte nos fez crescer.',
        'Hoje, nossa fábrica em Maringá - PR leva essa mesma essência e cuidado artesanal da panela direto para o seu copo. Compre online e retire sua cerveja fresca na própria fábrica.'
    ],
    // Fotos da fábrica (opcional). Exemplo: { src: 'assets/img/fabrica-1.jpg', alt: 'Tanques de fermentação' }
    fotos: []
};

window.PRODUTOS = [
    {
        id: 'hop-explosion-ipa',
        nome: 'Hop Explosion IPA',
        estilo: 'India Pale Ale',
        categoria: 'ipa',
        resumo: 'India Pale Ale com notas cítricas e amargor marcante.',
        sobre: [
            'Uma IPA para quem gosta de lúpulo de verdade: aroma cítrico logo ao abrir, amargor marcante e um final que convida ao próximo gole.',
            'Ideal para apreciar bem gelada, com calma, e para acompanhar pratos com personalidade.'
        ],
        preco: 28.90,
        abv: '6.5%',
        ibu: '55',
        volume: '473 ml',
        temperatura: '6 a 8 °C',
        copo: 'Tulipa ou caneca',
        harmonizacao: 'Carnes grelhadas, queijos curados e comida picante',
        fotos: [
            { src: 'assets/img/beer-ipa.jpg', alt: 'Garrafa de cerveja IPA com rótulo verde' }
        ]
    },
    {
        id: 'midnight-stout',
        nome: 'Midnight Stout',
        estilo: 'Dry Stout',
        categoria: 'stout',
        resumo: 'Stout escura, de corpo médio e final seco.',
        sobre: [
            'Uma Dry Stout escura com notas de malte tostado, lembrando café e cacau, e um final seco que deixa vontade de continuar.',
            'Boa companhia para noites frias e para sobremesas com chocolate.'
        ],
        preco: 26.50,
        abv: '5.0%',
        ibu: '35',
        volume: '473 ml',
        temperatura: '8 a 10 °C',
        copo: 'Caneca ou tulipa',
        harmonizacao: 'Chocolate, churrasco e sobremesas',
        fotos: [
            { src: 'assets/img/beer-stout.jpg', alt: 'Lata de cerveja Stout com rótulo escuro' }
        ]
    },
    {
        id: 'classic-pilsen',
        nome: 'Classic Pilsen',
        estilo: 'Premium American Lager',
        categoria: 'pilsen',
        resumo: 'Leve, refrescante e de final limpo.',
        sobre: [
            'Uma lager clara, leve e refrescante, com amargor suave e final limpo. A cerveja para o dia a dia, feita com cuidado artesanal.',
            'Funciona em qualquer ocasião, do churrasco de domingo ao happy hour.'
        ],
        preco: 22.00,
        abv: '4.8%',
        ibu: '15',
        volume: '600 ml',
        temperatura: '3 a 5 °C',
        copo: 'Copo pilsner ou americano',
        harmonizacao: 'Petiscos, frituras e pratos leves',
        fotos: [
            { src: 'assets/img/beer-pilsen.jpg', alt: 'Garrafa de cerveja Pilsen cristalina' }
        ]
    },
    {
        id: 'bavarian-weiss',
        nome: 'Bavarian Weiss',
        estilo: 'Hefeweizen',
        categoria: 'weiss',
        resumo: 'Cerveja de trigo, turva e cremosa.',
        sobre: [
            'Uma Hefeweizen de trigo, turva e cremosa, com notas que lembram banana e cravo, característica do estilo bávaro.',
            'Leve e aromática, combina com dias quentes e refeições simples.'
        ],
        preco: 25.90,
        abv: '5.2%',
        ibu: '12',
        volume: '473 ml',
        temperatura: '5 a 7 °C',
        copo: 'Copo weizen',
        harmonizacao: 'Saladas, frutos do mar e comida leve',
        fotos: [
            { src: 'assets/img/beer-weiss.jpg', alt: 'Lata de cerveja Weiss com rótulo amarelo' }
        ]
    },
    {
        id: 'sunset-apa',
        nome: 'Sunset APA',
        estilo: 'American Pale Ale',
        categoria: 'apa',
        resumo: 'Equilíbrio entre malte e lúpulo, com aroma cítrico.',
        sobre: [
            'Uma American Pale Ale equilibrada: malte na medida, lúpulo aromático e amargor moderado. Ótima porta de entrada para quem está começando nas artesanais.',
            'Versátil à mesa e fácil de gostar.'
        ],
        preco: 27.50,
        abv: '5.5%',
        ibu: '40',
        volume: '473 ml',
        temperatura: '6 a 8 °C',
        copo: 'Tulipa ou caneca',
        harmonizacao: 'Hambúrguer, pizza e queijos',
        fotos: [
            { src: 'assets/img/beer-apa.jpg', alt: 'Garrafa de cerveja APA com rótulo laranja' }
        ]
    },
    {
        id: 'berry-sour',
        nome: 'Berry Sour',
        estilo: 'Catharina Sour',
        categoria: 'sour',
        resumo: 'Ácida, leve e refrescante, com frutas vermelhas.',
        sobre: [
            'Uma Catharina Sour com acidez refrescante e frutas vermelhas. Baixo amargor, baixo teor alcoólico e muito sabor.',
            'Para quem quer experimentar algo diferente e leve.'
        ],
        preco: 30.00,
        abv: '4.2%',
        ibu: '8',
        volume: '473 ml',
        temperatura: '4 a 6 °C',
        copo: 'Taça ou tulipa',
        harmonizacao: 'Queijos cremosos, saladas e sobremesas de frutas',
        fotos: [
            { src: 'assets/img/beer-sour.jpg', alt: 'Lata de cerveja Sour com frutas vermelhas' }
        ]
    }
];
