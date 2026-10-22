# Pagamento com Pix (Mercado Pago)

> Confirmação automática de pagamento Pix, em modo de **teste/sandbox** — projeto de portfólio, sem dinheiro real envolvido. O fluxo manual pelo WhatsApp continua existindo como alternativa (e como único caminho se o Pix não estiver configurado).

## Por que Edge Function, e não chamar o Mercado Pago direto do navegador

O **Access Token** do Mercado Pago dá acesso total à conta (criar e consultar pagamentos, ver saldo). Ele nunca pode aparecer no JavaScript que roda no navegador do cliente — qualquer pessoa com o DevTools aberto conseguiria vê-lo. Por isso, quem fala com o Mercado Pago são as **Edge Functions** do Supabase (código de servidor, com o token guardado como *secret*), nunca o `js/main.js`.

O valor cobrado também nunca vem do navegador: a função `create-pix-payment` lê o total do pedido direto do banco (`obter_pedido_para_pagamento()`), o mesmo princípio já usado em `criar_pedido()` e `admin_confirm_payment()`.

## Diagrama de sequência

```
Cliente (navegador)        Edge Functions (Supabase)         Mercado Pago              Banco (Postgres)
      |                            |                               |                          |
      |-- finalizar carrinho ----->|                                                           |
      |                            |-- criar_pedido() ------------------------------------------>| status: aguardando_pagamento
      |                            |                                                           |
      |-- "Pagar com Pix" -------->|                                                           |
      |                      create-pix-payment                                                |
      |                            |-- obter_pedido_para_pagamento() -------------------------->| confere dono + total
      |                            |-- POST /v1/payments (pix) -->|                             |
      |                            |<-- qr_code + qr_code_base64 --|                            |
      |                            |-- grava mp_payment_id no pedido -------------------------->|
      |<-- QR Code + código -------|                                                           |
      |                            |                               |                            |
      |   (cliente paga no app do banco dele, fora deste site)     |                            |
      |                            |                               |                            |
      |                            |<== webhook "payment" =========|                            |
      |                      mp-webhook                             |                            |
      |                            |-- valida x-signature (HMAC) --|                            |
      |                            |-- GET /v1/payments/{id} ----->|   (nunca confia no corpo)   |
      |                            |<-- status: approved ----------|                            |
      |                            |-- confirmar_pagamento_automatico() ----------------------->| status: pago
      |                            |                                                           |
      |-- (a cada 4s) ------------>|                                                           |
      |                      check-pix-payment  (reforço: nem sempre o webhook chega em teste)  |
      |                            |-- GET /v1/payments/{id} ----->|                            |
      |                            |-- confirmar_pagamento_automatico() (idempotente) --------->| já pago: não duplica
      |<-- "pago" ------------------|                                                           |
      |   mostra "Pagamento confirmado! 🎉"                                                     |
```

## Por que duas formas de confirmar (webhook *e* verificação)

A própria documentação do Mercado Pago avisa: **pagamentos de teste nem sempre disparam notificação**. Depender só do webhook deixaria a demonstração quebrada às vezes, sem motivo aparente. Por isso o front chama `check-pix-payment` a cada 4 segundos enquanto o QR Code está na tela — ele faz a mesma verificação que o webhook faria (busca o pagamento direto na API do Mercado Pago), só que iniciada pelo cliente. Os dois caminhos chamam a mesma função `confirmar_pagamento_automatico()`, que é **idempotente**: não importa se o webhook e a verificação manual confirmarem o mesmo pedido quase ao mesmo tempo, o pagamento só é registrado uma vez.

## Segurança

- **Assinatura do webhook validada** (`x-signature` / `x-request-id`, HMAC-SHA256 com `MP_WEBHOOK_SECRET`), exatamente como a documentação manda — sem isso, qualquer POST externo poderia fingir "paguei" para um pedido alheio.
- **`create-pix-payment`/`check-pix-payment` exigem sessão do cliente** e só enxergam pedidos do próprio dono (a função `obter_pedido_para_pagamento()` filtra por `auth.uid()`).
- **`confirmar_pagamento_automatico()`** só pode ser chamada com a chave `service_role` (nunca pelo navegador) — ver `revoke`/`grant` em `supabase/schema_pix.sql`.
- **Idempotência em duas camadas**: `X-Idempotency-Key` na criação do pagamento (o mesmo pedido nunca gera duas cobranças Pix, mesmo se a função rodar de novo por uma falha de rede) e a checagem de status antes de confirmar (não duplica o registro em `payments`).

## Configuração (o que você precisa fazer)

### 1. Criar a aplicação de teste no Mercado Pago
1. Crie uma conta de desenvolvedor em [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers).
2. Crie uma aplicação e pegue as **credenciais de teste** (começam com `TEST-`): `Access Token` e, nas configurações de notificações da aplicação, a **chave secreta do webhook** (usada para gerar o `x-signature`).
3. (Opcional, mas recomendado) Crie um [usuário de teste comprador](https://www.mercadopago.com.br/developers/en/docs/checkout-api/additional-content/test-accounts) para simular o pagamento sem usar sua conta real.

### 2. Rodar a migração
No SQL Editor do Supabase, depois de `schema.sql` e `schema_admin.sql`, rode `supabase/schema_pix.sql`.

### 3. Configurar os *secrets* das Edge Functions
**Nunca cole essas chaves no chat, no código ou em qualquer arquivo versionado.** Use a CLI do Supabase (`npx supabase login`, depois `npx supabase link --project-ref SEU_PROJECT_REF`) ou o painel do Supabase em **Edge Functions > Secrets**:

```bash
npx supabase secrets set MP_ACCESS_TOKEN=TEST-xxxxxxxx
npx supabase secrets set MP_WEBHOOK_SECRET=xxxxxxxx
```

### 4. Publicar as functions
```bash
npx supabase functions deploy create-pix-payment
npx supabase functions deploy check-pix-payment
npx supabase functions deploy mp-webhook --no-verify-jwt
```
`mp-webhook` precisa de `--no-verify-jwt`: quem chama é o Mercado Pago, sem token de sessão — a proteção dela é a assinatura (`x-signature`), não o JWT do Supabase.

### 5. Configurar a URL do webhook no Mercado Pago
No painel da aplicação, em **Webhooks**, cole a URL pública da function (`https://SEU_PROJECT_REF.supabase.co/functions/v1/mp-webhook`) e marque o evento **Pagamentos**.

## Como testar

1. Monte um pedido no site e finalize o carrinho.
2. Clique em **Pagar com Pix** — deve aparecer o QR Code e o código copia e cola.
3. No [simulador de pagamentos de teste](https://www.mercadopago.com.br/developers/en/docs/checkout-api/integration-test/test-cards) do Mercado Pago (ou usando o app do Mercado Pago logado com um usuário de teste), pague o Pix gerado.
4. Em poucos segundos — pelo webhook ou pela verificação automática do front — a tela deve mostrar "Pagamento confirmado! 🎉", e o pedido aparece como **Pago** em "Minha conta" e no painel administrativo.

## Limitações conhecidas

- Não coleta CPF do pagador no checkout (o cadastro do site não pede isso). A Payments API aceita Pix sem essa informação para a maioria dos casos de teste; se o Mercado Pago passar a exigir, será preciso adicionar o campo ao carrinho.
- Isto é uma integração de **demonstração**: antes de processar pagamentos reais, revise a política do Mercado Pago para o seu tipo de produto (bebida alcoólica pode ter restrições) e troque as credenciais de teste pelas de produção.
