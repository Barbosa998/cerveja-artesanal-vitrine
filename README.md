# Cervejaria Artesanal - Vitrine Online

## Descrição e Objetivo
Vitrine virtual para venda de cervejas artesanais, com HTML5 semântico, acessibilidade (WCAG 2.2) e SEO técnico (Schema.org). O site é estático (GitHub Pages). O carrinho fica salvo no navegador; os pedidos podem ser registrados na conta do cliente (Supabase) e são finalizados pelo WhatsApp.

Site no ar: https://barbosa998.github.io/cerveja-artesanal-vitrine/

## Estrutura do Projeto
```
cerveja-artesanal-vitrine/
├── index.html              # Página inicial (vitrine, filtros, sobre)
├── produto.html            # Página de produto (modelo: produto.html?id=...)
├── conta.html              # Entrar, criar conta, pedidos e dados do cliente
├── admin.html              # Painel administrativo (pedidos, pagamentos, produtos)
├── termos.html             # Termos de Uso (CDC, direito de arrependimento)
├── privacidade.html        # Política de Privacidade (LGPD)
├── css/
│   ├── style.css           # Estilos globais e componentes (BEM)
│   └── admin.css           # Estilos específicos do painel administrativo
├── js/
│   ├── config.js           # WhatsApp e chaves do Supabase  <- você edita
│   ├── produtos.js         # Produtos de reserva (usados se o Supabase falhar)  <- você edita
│   ├── catalog.js          # Busca os produtos no Supabase (com reserva de produtos.js)
│   ├── main.js              # Idade, vitrine, filtros, carrinho, cupom e finalização do pedido (módulo ES)
│   ├── produto.js          # Monta a página de produto (carrossel de fotos)
│   ├── auth.js              # Ponte com o Supabase
│   ├── conta.js             # Tela "Minha conta"
│   ├── admin.js             # Painel administrativo (módulo ES)
│   └── modules/              # Regras de negócio puras (sem DOM), com testes
│       ├── cart.js           # Somar, validar e mudar o carrinho
│       ├── coupons.js        # Calcular desconto de cupom
│       ├── orderStatus.js    # Máquina de estados do pedido (espelha o banco)
│       └── __tests__/        # Testes (Vitest) dos três módulos acima
├── supabase/
│   ├── schema.sql           # Tabelas e regras de segurança do banco (clientes/pedidos)
│   └── schema_admin.sql     # Migração do painel: admins, produtos, pagamentos, histórico
├── assets/img/              # Imagens (WebP, JPG, SVG)
├── package.json              # Só para os testes (Vitest); o site em si não precisa de build
└── README.md
```

## Como Rodar Localmente
1. `git clone https://github.com/Barbosa998/cerveja-artesanal-vitrine.git`
2. `cd cerveja-artesanal-vitrine`
3. Sirva a pasta com um servidor local — use a extensão *Live Server* do VS Code, ou `python -m http.server 5500` — e abra `index.html` por ele (ex.: `http://127.0.0.1:5500/`).
   Abrir o arquivo direto do disco (`file://...`) **não funciona**: tanto a área do cliente (Supabase) quanto `js/main.js`/`js/admin.js` (módulos ES, que o navegador bloqueia em `file://` por CORS) precisam de um endereço `http://`.

## Testes (regras de negócio)

O site em si não tem build (continua HTML/CSS/JS puro, servido como está pelo GitHub Pages). Mas as regras que valem a pena testar isoladamente — carrinho, cupom, máquina de estados do pedido — ficam em `js/modules/`, como funções puras (sem DOM, sem `localStorage`), e têm testes com [Vitest](https://vitest.dev):

```bash
npm install
npm test
```

`js/main.js` e `js/admin.js` importam essas funções (são `<script type="module">`), então rodar como módulo ES é obrigatório — não dá mais para abrir `index.html` direto do disco (`file://`); use sempre um servidor local (Live Server, `python -m http.server` etc.), como aliás a área do cliente já exigia.

## Configuração rápida (js/config.js)
- `whatsappNumber`: número que recebe os pedidos (país + DDD + número, só dígitos).
- `supabaseUrl` e `supabaseAnonKey`: ativam login, cadastro e pedidos (veja abaixo). Vazios = o botão "Entrar" some e o carrinho envia direto pelo WhatsApp.

Outras opções ficam no topo do `js/main.js`: `freeShippingFrom` (frete grátis), `coupons` (cupons de desconto) e `newsletterEndpoint`.

**Produtos:** depois de rodar `supabase/schema_admin.sql` (veja a seção do painel administrativo, abaixo), edite os produtos pelo `admin.html`, não mais em `js/produtos.js`. Esse arquivo continua existindo só como reserva, usada automaticamente se o Supabase não estiver configurado ou a tabela `produtos` ainda não existir.

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

## Painel administrativo (admin.html)

O painel em `admin.html` substitui o Table Editor para o dia a dia: confirmar pagamento, mudar o status do pedido, preencher o código de rastreio, editar produtos/estoque e exportar um CSV dos pedidos.

### 1. Rodar a migração
No **SQL Editor** do Supabase, cole e rode todo o conteúdo de `supabase/schema_admin.sql` (depois de já ter rodado `supabase/schema.sql`). Ele cria as tabelas do painel e **copia os 6 produtos de `js/produtos.js` para a tabela `produtos`** (só na primeira vez — depois disso, edite os produtos pelo painel, não mais pelo arquivo).

### 2. Virar administrador
Não existe tela para isso (de propósito: ninguém vira admin só porque acessou uma URL). Crie sua conta normalmente pelo site (`conta.html`) e depois, no SQL Editor, rode (trocando o e-mail):

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'SEU-EMAIL-AQUI@exemplo.com';
```

### 3. Entrar no painel
Abra `admin.html`, entre com essa mesma conta. Quem não está na tabela `admins` vê "Acesso restrito" — o front só mostra ou esconde telas; quem decide de verdade é a política de segurança (RLS) do banco.

### 4. Confirmar um pagamento (ex.: Pix pelo WhatsApp)
Na aba **Pedidos**, abra o pedido "Aguardando pagamento", confira o comprovante fora do site, preencha a forma e o valor recebido e confirme. Se o valor for diferente do total do pedido, o painel pede uma justificativa antes de deixar confirmar.

### 5. Avançar o status / preencher rastreio
No mesmo pedido, escolha o próximo status (só aparecem os status válidos a partir do atual — o banco recusa qualquer pulo inválido, mesmo se alguém tentar pela API direto) e o código de rastreio. O cliente vê a mudança em "Minha conta".

### 6. Histórico
Cada confirmação de pagamento ou mudança de status fica registrada (quem, quando, o quê) e aparece na aba "Histórico" do pedido. Isso não pode ser editado nem apagado pela própria interface — nem por um admin.

### Segurança do painel (o que ainda falta, se quiser reforçar)
- O login do admin é o mesmo e-mail/senha do Supabase Auth. Para uma conta que mexe com confirmação de pagamento, recomendamos ativar **MFA (autenticação em duas etapas)** para essa conta em **Authentication > Providers** no painel do Supabase. Isso **não foi configurado automaticamente** aqui: é uma configuração manual, no painel do Supabase, fora do código.
- Troque a senha da conta admin periodicamente e não a reaproveite de outro serviço.

## Como funciona o pedido
1. O cliente monta o carrinho (que fica guardado no navegador).
2. Ao finalizar, se não estiver logado, é convidado a entrar ou criar conta e volta para onde estava.
3. O pedido é salvo na conta dele com o status "Aguardando pagamento".
4. Aparece o botão **Enviar pelo WhatsApp**, com o pedido pronto, para combinar pagamento e entrega.

O pagamento continua sendo combinado por fora (WhatsApp/Pix). Por isso, confira o valor do pedido na hora de cobrar. Pagamento online dentro do site seria uma próxima etapa.

## Segurança

- **Limite de tentativas de login/cadastro:** o botão trava durante o envio (evita duplo clique) e há um limite local de 5 tentativas a cada 10 minutos por formulário, só para UX — a proteção real contra abuso é do Supabase. Se o Supabase devolver erro 429 (limite do servidor), aparece uma contagem regressiva de 60s. Para testar sem esperar o limite: em `localhost`/`127.0.0.1`, abra `conta.html?reset-auth=1` (nunca funciona fora de localhost).
- **RLS no Supabase:** cada tabela (`profiles`, `orders`, `order_items`) só permite ao cliente ler/editar os próprios dados; admin lê tudo (`is_admin()`). Pedidos só são criados pela função `criar_pedido()`, que recalcula os totais no servidor (o carrinho do navegador não é confiável). Mudar status e confirmar pagamento só é possível pelas funções `admin_set_order_status()`/`admin_confirm_payment()`, nunca por `UPDATE` direto — e ambas conferem `is_admin()` no servidor antes de fazer qualquer coisa. A tabela `produtos` é de leitura pública só para quem está `ativo`; escrever nela exige ser admin. Nunca use a chave `service_role` no site.
- **Exclusão de conta:** em "Minha conta > Meus dados", o cliente pode excluir a própria conta e dados (função `excluir_conta()` no `schema.sql`, que precisa ter sido rodada no SQL Editor do Supabase).
- **CSP:** todas as páginas têm uma Content-Security-Policy via `<meta>`, liberando apenas recursos do próprio site, o CDN do Supabase (`cdn.jsdelivr.net`) e as fontes do Google. Limitação: `frame-ancestors` não funciona por `<meta>` (precisaria de cabeçalho HTTP, que o GitHub Pages não permite configurar).
- **SRI:** o script do `supabase-js` carregado via CDN é validado por hash (`integrity`) em `js/auth.js`. Se você trocar a versão em `SUPABASE_SRC`, recalcule o hash (ex.: baixando o arquivo e rodando `openssl dgst -sha384 -binary arquivo.js | openssl base64 -A`) e atualize `SUPABASE_SRI`.
- **XSS:** todo dado dinâmico escrito na tela (pedidos, nome do produto etc.) passa por uma função de escape antes de virar HTML.

## Jurídico (LGPD, CDC, venda de bebida alcoólica)

- `termos.html` e `privacidade.html` têm campos marcados como `[PREENCHER]` (CNPJ, razão social, endereço, telefone, encarregado de dados). **Preencha com os dados reais da empresa antes de divulgar o site.**
- Isso é uma adequação técnica orientada, não um parecer jurídico. Recomendamos revisão por um advogado antes de operar com venda real de bebidas alcoólicas.

## Roadmap
- [x] **Etapa 1:** HTML semântico, acessibilidade e SEO.
- [x] **Etapa 2:** CSS Vanilla (BEM, variáveis, Flexbox/Grid).
- [x] **Etapa 3:** Verificação de idade, filtros, carrinho e cupom.
- [x] **Etapa 4:** Páginas de produto com carrossel de fotos.
- [x] **Etapa 5:** Área do cliente (login, cadastro, pedidos e status).
- [x] **Etapa 6:** Painel de administração (pedidos, pagamentos, produtos/estoque).
- [ ] **Etapa 7:** Otimização de performance (imagens WebP).
- [ ] **Etapa 8:** Dados reais (telefone, e-mail, redes sociais, domínio próprio).
