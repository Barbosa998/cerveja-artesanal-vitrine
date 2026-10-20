# Cervejaria Artesanal - Vitrine Online

## Descrição e Objetivo
Vitrine virtual para venda de cervejas artesanais, com HTML5 semântico, acessibilidade (WCAG 2.2) e SEO técnico (Schema.org). O site é estático (GitHub Pages). O carrinho fica salvo no navegador; os pedidos podem ser registrados na conta do cliente (Supabase) e são finalizados pelo WhatsApp.

Site no ar: https://barbosa998.github.io/cerveja-artesanal-vitrine/

## Estrutura do Projeto
```
cerveja-artesanal-vitrine/
├── index.html          # Página inicial (vitrine, filtros, sobre)
├── produto.html        # Página de produto (modelo: produto.html?id=...)
├── conta.html          # Entrar, criar conta, pedidos e dados do cliente
├── privacidade.html    # Política de Privacidade (LGPD)
├── css/style.css       # Estilos globais e componentes (BEM)
├── js/
│   ├── config.js       # WhatsApp e chaves do Supabase  <- você edita
│   ├── produtos.js     # Textos, detalhes e fotos de cada cerveja  <- você edita
│   ├── main.js         # Idade, filtros, carrinho, cupom e finalização do pedido
│   ├── produto.js      # Monta a página de produto (carrossel de fotos)
│   ├── auth.js         # Ponte com o Supabase
│   └── conta.js        # Tela "Minha conta"
├── supabase/schema.sql # Tabelas e regras de segurança do banco
├── assets/img/         # Imagens (WebP, JPG, SVG)
└── README.md
```

## Como Rodar Localmente
1. `git clone https://github.com/Barbosa998/cerveja-artesanal-vitrine.git`
2. `cd cerveja-artesanal-vitrine`
3. Abra o `index.html` no navegador ou use a extensão *Live Server* do VS Code.
   (A área do cliente precisa de um endereço `http://`, então use o Live Server para testá-la.)

## Configuração rápida (js/config.js)
- `whatsappNumber`: número que recebe os pedidos (país + DDD + número, só dígitos).
- `supabaseUrl` e `supabaseAnonKey`: ativam login, cadastro e pedidos (veja abaixo). Vazios = o botão "Entrar" some e o carrinho envia direto pelo WhatsApp.

Outras opções ficam no topo do `js/main.js`: `freeShippingFrom` (frete grátis), `coupons` (cupons de desconto) e `newsletterEndpoint`.

## Ativar a área do cliente (Supabase)

### 1. Criar o projeto
1. Crie uma conta grátis em https://supabase.com e clique em **New project** (escolha uma senha forte para o banco e a região mais próxima, ex.: São Paulo).
2. Aguarde o projeto ficar pronto (1 a 2 minutos).

### 2. Criar as tabelas
1. No menu lateral, abra **SQL Editor** > **New query**.
2. Cole todo o conteúdo do arquivo `supabase/schema.sql` e clique em **Run**.
3. Deve aparecer "Success". (Pode rodar de novo sem perder dados.)

### 3. Copiar as chaves para o site
1. Vá em **Project Settings** > **API** (ou **API Keys**).
2. Copie a **Project URL** e a chave **anon public**.
3. Cole em `js/config.js`, nos campos `supabaseUrl` e `supabaseAnonKey`.
   Nunca use a chave `service_role` no site.

### 4. Liberar o endereço do site (e-mails de confirmação e senha)
1. Vá em **Authentication** > **URL Configuration**.
2. Em **Site URL**, coloque `https://barbosa998.github.io/cerveja-artesanal-vitrine/`.
3. Em **Redirect URLs**, adicione `https://barbosa998.github.io/cerveja-artesanal-vitrine/**` (e, para testar localmente, `http://127.0.0.1:5500/**`).

### 5. Conferir a confirmação de e-mail
Em **Authentication** > **Sign In / Providers** > **Email**, a opção "Confirm email" vem ligada: o cliente recebe um link para ativar a conta. Isso é o recomendado. Para testes rápidos você pode desligar, mas ligue de novo antes de divulgar.

> Atenção: o envio de e-mails do plano grátis tem limite baixo por hora. Quando o site tiver movimento, configure um serviço de e-mail próprio em **Authentication** > **SMTP Settings**.

## Como atualizar o status de um pedido
Por enquanto, pelo painel do Supabase:
1. Abra **Table Editor** > tabela **orders**.
2. Clique na linha do pedido e altere a coluna **status** para um destes valores:
   `aguardando_pagamento`, `em_preparo`, `enviado`, `entregue` ou `cancelado`.
3. Para pedidos enviados, preencha **codigo_rastreio**: ele aparece para o cliente.

O cliente vê a mudança em "Minha conta" (botão "Atualizar" ou ao voltar para a aba).

## Como funciona o pedido
1. O cliente monta o carrinho (que fica guardado no navegador).
2. Ao finalizar, se não estiver logado, é convidado a entrar ou criar conta e volta para onde estava.
3. O pedido é salvo na conta dele com o status "Aguardando pagamento".
4. Aparece o botão **Enviar pelo WhatsApp**, com o pedido pronto, para combinar pagamento e entrega.

O pagamento continua sendo combinado por fora (WhatsApp/Pix). Por isso, confira o valor do pedido na hora de cobrar. Pagamento online dentro do site seria uma próxima etapa.

## Roadmap
- [x] **Etapa 1:** HTML semântico, acessibilidade e SEO.
- [x] **Etapa 2:** CSS Vanilla (BEM, variáveis, Flexbox/Grid).
- [x] **Etapa 3:** Verificação de idade, filtros, carrinho e cupom.
- [x] **Etapa 4:** Páginas de produto com carrossel de fotos.
- [x] **Etapa 5:** Área do cliente (login, cadastro, pedidos e status).
- [ ] **Etapa 6:** Painel de administração dos pedidos.
- [ ] **Etapa 7:** Otimização de performance (imagens WebP).
- [ ] **Etapa 8:** Dados reais (telefone, e-mail, redes sociais, domínio próprio).
