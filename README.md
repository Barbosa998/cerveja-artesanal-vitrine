<div align="center">

# 🍺 Cervejaria Artesanal — Vitrine Online

Vitrine digital de cervejas artesanais construída com **HTML5, CSS3 e JavaScript puro (ES Modules)**, com backend leve em **Supabase** — foco em boas práticas de engenharia front-end, acessibilidade, performance e indexação, sem depender de frameworks ou de um bundler.

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev)
[![Lighthouse](https://img.shields.io/badge/Lighthouse-100%2F100-success?style=for-the-badge&logo=lighthouse&logoColor=white)](docs/AUDITORIA-A11Y-SEO.md)

**[🔗 Ver demo ao vivo](https://barbosa998.github.io/cerveja-artesanal-vitrine/)**

<!-- TODO: trocar pelo GIF/print real da vitrine (ex.: assets/img/preview.gif) -->
<p align="center">
  <img src="https://via.placeholder.com/900x500/1A1D21/E08A2B?text=Preview+da+Vitrine" alt="Preview da interface da Cervejaria Artesanal" width="100%">
</p>

</div>

---

## 📋 Sobre o Projeto

A Cervejaria Artesanal é uma vitrine online completa para venda de cervejas artesanais: catálogo, filtros, carrinho com cupom de desconto, área do cliente com histórico de pedidos e um painel administrativo — tudo construído **sem framework**, só HTML/CSS/JS, hospedado como site estático no GitHub Pages.

O objetivo do projeto não é só "funcionar": é servir de vitrine técnica para três frentes que costumam ficar de lado em projetos pequenos —

- **Engenharia front-end **, mesmo sem framework: lógica de negócio (carrinho, cupom, máquina de estados do pedido, busca de CEP) extraída em módulos ES e testados com Vitest.
- **Performance e indexação**: HTML5 semântico, dados estruturados (Schema.org), e uma auditoria com Lighthouse documentada — com antes/depois e explicação de cada correção.
- **Segurança e LGPD levadas a sério**, não só "funciona": Row Level Security no banco, CSP, SRI, máquina de estados validada no servidor, exclusão de conta e consentimento separado por finalidade.

## ✨ Funcionalidades

| Área | O que tem |
|---|---|
| **Vitrine** | Catálogo dinâmico (lido do Supabase, com reserva estática caso o backend esteja fora), filtros por estilo, verificação de idade |
| **Carrinho** | Cupom de desconto, cálculo de frete grátis, busca de endereço por CEP ([ViaCEP](https://viacep.com.br)), **pagamento com Pix e confirmação automática** ([Mercado Pago](docs/PAGAMENTOS.md), via Edge Functions) |
| **Conta do cliente** | Cadastro/login (Supabase Auth), histórico de pedidos com linha do tempo de status, exclusão de conta (LGPD) |
| **Painel administrativo** | Confirmar pagamento, avançar status do pedido, gerenciar produtos/estoque, exportar pedidos em CSV, histórico de auditoria |
| **Jurídico** | Termos de Uso e Política de Privacidade com consentimento separado por finalidade (cadastro, newsletter) |

## 🎯 Destaques Técnicos

### HTML5 Semântico

O documento usa as landmarks semânticas corretas em vez de `<div>` genéricas — `<header>`, `<nav aria-label="Navegação principal">`, `<main id="conteudo-principal">`, `<section aria-labelledby="...">` para cada bloco de conteúdo (vitrine, sobre, benefícios, newsletter) e `<footer>` para as informações institucionais. Os cards de produto são `<article class="product-card">`, já que cada um é um conteúdo independente e republicável por si só — exatamente o caso de uso que a tag `<article>` foi desenhada para cobrir.

Isso importa por dois motivos práticos, não só "boa prática no papel": leitores de tela conseguem pular direto para a seção que importa (as `aria-labelledby` dão nome a cada landmark), e o HTML continua legível e fácil de manter mesmo sem olhar o CSS — a estrutura do documento já conta a história da página.

### SEO e Dados Estruturados (Schema.org)

Os dados estruturados são implementados em **JSON-LD** (`<script type="application/ld+json">`), não em microdados inline (`itemscope`/`itemprop`) — essa é a forma que o próprio Google recomenda hoje: fica num bloco único, não precisa espalhar atributos por cada elemento do HTML, e não quebra se o layout mudar.

- `index.html` declara um `@graph` com os tipos `Brewery` (dados institucionais) e `Product` (oferta em destaque).
- `produto.html` (em `js/produto.js`) **gera o JSON-LD dinamicamente por produto**, montando `name`, `description`, `image` e `offers.price` a partir do catálogo — então cada página de produto tem seus próprios dados estruturados corretos, sem precisar duplicar HTML à mão.

O resultado: Google (e qualquer motor que leia Schema.org) consegue montar *rich snippets* de produto — preço, disponibilidade, imagem — direto no resultado de busca, sem precisar raspar o HTML visual.

### Performance e Acessibilidade — números de verdade

Nada de "deve estar bom": a vitrine tem auditoria real com [Lighthouse](docs/AUDITORIA-A11Y-SEO.md), medida localmente, com antes/depois documentado — inclusive um CLS alto encontrado e corrigido durante o próprio desenvolvimento.

| Página | Performance | Acessibilidade | Boas práticas | SEO |
|---|---|---|---|---|
| `index.html` | 81 | **100** | **100** | **100** |
| `produto.html` | 69 | **100** | **100** | **100** |
| `conta.html` | 87 | **100** | **100** | 55\* |

\* `conta.html` é `noindex` de propósito (área logada) — o Lighthouse penaliza isso como SEO, mas é a decisão correta.

### Arquitetura sem framework, mas nada "espaguete"

- **ES Modules**: a lógica de negócio pura (carrinho, cupom, máquina de estados do pedido, validação de CEP) vive em `js/modules/`, sem tocar no DOM — só funções que recebem dados e devolvem dados. Isso é o que torna possível testar com **Vitest** sem precisar simular um navegador inteiro.
- **Supabase como backend**: autenticação, banco de dados com Row Level Security e funções RPC fazem o papel que normalmente cairia num servidor Node — todo cálculo sensível (total do pedido, transição de status, confirmação de pagamento) acontece no banco, nunca confiando no que vem do navegador.
- **Progressivamente aprimorado**: a vitrine funciona com os produtos padrão mesmo se o Supabase cair; o carrinho é salvo em `localStorage` e sobrevive a um recarregamento de página.

## 📁 Estrutura de Diretórios

```
cerveja-artesanal-vitrine/
├── index.html                  # Página inicial (vitrine, filtros, sobre)
├── produto.html                # Página de produto (produto.html?id=...)
├── conta.html                  # Login, cadastro, pedidos e dados do cliente
├── admin.html                  # Painel administrativo
├── termos.html                 # Termos de Uso
├── privacidade.html            # Política de Privacidade (LGPD)
│
├── css/
│   ├── style.css                # Estilos globais e componentes (metodologia BEM)
│   └── admin.css                # Estilos do painel administrativo
│
├── js/
│   ├── config.js                 # Configuração pública (URL/chave do Supabase)
│   ├── produtos.js               # Catálogo de reserva (usado se o Supabase falhar)
│   ├── catalog.js                # Busca os produtos no Supabase
│   ├── main.js                   # Vitrine, carrinho, cupom, checkout (módulo ES)
│   ├── produto.js                # Monta a página de produto + JSON-LD dinâmico
│   ├── auth.js                   # Ponte com o Supabase Auth
│   ├── conta.js                  # Tela "Minha conta"
│   ├── admin.js                  # Painel administrativo (módulo ES)
│   └── modules/                  # Regras de negócio puras, com testes (Vitest)
│       ├── cart.js
│       ├── coupons.js
│       ├── orderStatus.js
│       ├── viacep.js
│       └── __tests__/
│
├── supabase/
│   ├── schema.sql                # Tabelas e RLS: clientes e pedidos
│   ├── schema_admin.sql          # Painel admin: produtos, pagamentos, auditoria
│   └── functions/                # Edge Functions (pagamento via Pix)
│
├── docs/
│   ├── OPERACAO.md               # Guia completo de setup, Supabase e segurança
│   ├── AUDITORIA-A11Y-SEO.md     # Auditoria Lighthouse com antes/depois
│   └── PAGAMENTOS.md             # Arquitetura do Pix (Mercado Pago): diagrama, segurança, setup
│
├── assets/img/                   # Imagens do catálogo
├── package.json                  # Só para os testes (Vitest) — o site não tem build
└── README.md
```

> 📘 Setup completo do Supabase, variáveis de ambiente, segurança e painel admin: veja **[docs/OPERACAO.md](docs/OPERACAO.md)**.

## 🚀 Como Visualizar Localmente

```bash
git clone https://github.com/Barbosa998/cerveja-artesanal-vitrine.git
cd cerveja-artesanal-vitrine
python -m http.server 5500
# ou: use a extensão Live Server do VS Code
```

Abra `http://127.0.0.1:5500/` no navegador. **Importante:** abrir o `index.html` direto do disco (`file://...`) não funciona — o projeto usa módulos ES (`<script type="module">`), que o navegador bloqueia por CORS fora de um servidor.

Para rodar os testes das regras de negócio:

```bash
npm install
npm test
```

## 👤 Autor

**Vinicius Barbosa Alves**

<!-- TODO: trocar pelos links reais -->
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](www.linkedin.com/in/vinicius-barbosa-alves-72b532259)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Barbosa998)
