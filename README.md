Cervejaria Artesanal - Vitrine Online
Descrição e Objetivo
Projeto de uma vitrine virtual para venda de cervejas artesanais. A base usa HTML5 semântico, acessibilidade (diretrizes WCAG 2.2) e SEO técnico com Schema.org. O site é estático (sem servidor): o carrinho fica salvo no navegador e o pedido é finalizado pelo WhatsApp.
Site no ar: https://barbosa998.github.io/cerveja-artesanal-vitrine/
Estrutura do Projeto
```
cerveja-artesanal-vitrine/
├── index.html        # Estrutura base e semântica
├── css/
│   └── style.css     # Estilos globais e componentes (BEM)
├── js/
│   └── main.js       # Verificação de idade, filtros, carrinho e pedido
├── assets/
│   └── img/          # Imagens otimizadas (WebP, SVG)
├── README.md         # Documentação
├── .gitignore        # Arquivos ignorados pelo Git
└── LICENSE           # Licença MIT
```
Como Rodar Localmente
Clone este repositório:
`git clone https://github.com/Barbosa998/cerveja-artesanal-vitrine.git`
Navegue até a pasta:
`cd cerveja-artesanal-vitrine`
Abra o arquivo `index.html` no navegador ou use a extensão Live Server do VS Code.
Configuração (js/main.js)
No topo do arquivo, o objeto `CONFIG` reúne o que você precisa trocar:
`whatsappNumber`: número que recebe os pedidos (país + DDD + número, só dígitos).
`freeShippingFrom`: valor mínimo para frete grátis.
`newsletterEndpoint`: endereço de um serviço de formulário (ex.: Formspree). Enquanto estiver vazio, a seção de newsletter fica escondida.
Roadmap
[x] Etapa 1: HTML semântico, acessibilidade e SEO.
[x] Etapa 2: Estilização com CSS Vanilla (BEM, CSS Variables, Flexbox/Grid).
[x] Etapa 3: Verificação de idade, filtros e carrinho (JavaScript).
[ ] Etapa 4: Otimização de performance (imagens WebP, minificação).
[ ] Etapa 5: Dados reais (telefone, e-mail, redes sociais, domínio próprio).