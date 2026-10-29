-- ==========================================================================
-- Cervejaria Artesanal: confirmação automática de Pix (Mercado Pago)
--
-- Rode este arquivo DEPOIS de supabase/schema.sql e supabase/schema_admin.sql,
-- no SQL Editor do Supabase. Pode rodar de novo sem perder dados.
--
-- Como funciona (visão geral; detalhes em docs/PAGAMENTOS.md):
--   1. Cliente finaliza o carrinho -> pedido criado com status
--      "aguardando_pagamento" (já existia).
--   2. Front chama a Edge Function create-pix-payment, que cria o
--      pagamento Pix no Mercado Pago e devolve o QR Code.
--   3. O Mercado Pago avisa a Edge Function mp-webhook quando o Pix é
--      pago (ou o front verifica sozinho, chamando check-pix-payment,
--      caso o aviso demore ou não chegue — comum em modo de teste).
--   4. As duas Edge Functions chamam a função abaixo
--      (confirmar_pagamento_automatico), que grava o pagamento e muda o
--      pedido para "pago" — exatamente como admin_confirm_payment() faz
--      manualmente, só que automático.
--
-- As Edge Functions usam a chave service_role do Supabase (nunca a chave
-- do Mercado Pago, que fica só nos secrets das próprias functions) e por
-- isso não precisam de permissão especial para chamar esta função.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) Onde fica o id do pagamento Pix no Mercado Pago, por pedido.
-- --------------------------------------------------------------------------
alter table public.orders add column if not exists mp_payment_id text;

create unique index if not exists orders_mp_payment_id_idx
    on public.orders (mp_payment_id)
    where mp_payment_id is not null;

-- --------------------------------------------------------------------------
-- 2) payments/audit_log: quem confirmou pode ser "ninguém" (automático,
--    via webhook do Mercado Pago) — até então só um admin confirmava.
-- --------------------------------------------------------------------------
alter table public.payments alter column confirmed_by drop not null;
alter table public.payments add column if not exists mp_payment_id text;

alter table public.audit_log alter column admin_id drop not null;
alter table public.audit_log add column if not exists fonte text not null default 'admin'
    check (fonte in ('admin', 'webhook_mp'));

-- --------------------------------------------------------------------------
-- 3) Função chamada pelas Edge Functions (create-pix-payment/mp-webhook)
--    quando o Mercado Pago confirma que o Pix foi pago.
--
--    Idempotente de propósito: o Mercado Pago pode mandar a mesma
--    notificação mais de uma vez (está nos próprios termos deles), e o
--    front também pode chamar isso via "check-pix-payment". Se o pedido
--    já não estiver "aguardando_pagamento", não faz nada e devolve o
--    pedido como já está — sem duplicar pagamento nem dar erro.
-- --------------------------------------------------------------------------
create or replace function public.confirmar_pagamento_automatico(
    p_order_id      uuid,
    p_mp_payment_id text,
    p_amount        numeric
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pedido public.orders;
begin
    select * into v_pedido from public.orders where id = p_order_id for update;
    if not found then
        raise exception 'Pedido não encontrado.';
    end if;

    -- Idempotência: outra notificação (ou a verificação manual) já
    -- confirmou este mesmo pedido antes. Não é erro, só não repete.
    if v_pedido.status <> 'aguardando_pagamento' then
        return v_pedido;
    end if;

    insert into public.payments (order_id, method, amount, confirmed_by, mp_payment_id, proof_note)
    values (p_order_id, 'pix', p_amount, null, p_mp_payment_id, 'Confirmado automaticamente pelo Mercado Pago (Pix)');

    update public.orders
       set status = 'pago',
           mp_payment_id = p_mp_payment_id
     where id = p_order_id
    returning * into v_pedido;

    insert into public.audit_log (admin_id, order_id, acao, detalhes, fonte)
    values (null, p_order_id, 'confirmar_pagamento', jsonb_build_object(
        'metodo', 'pix', 'valor', p_amount, 'mp_payment_id', p_mp_payment_id, 'automatico', true
    ), 'webhook_mp');

    return v_pedido;
end;
$$;

revoke all on function public.confirmar_pagamento_automatico(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.confirmar_pagamento_automatico(uuid, text, numeric) to service_role;

-- --------------------------------------------------------------------------
-- 4) Função que a Edge Function create-pix-payment chama para conferir o
--    pedido e pegar o total ANTES de criar o pagamento no Mercado Pago —
--    nunca confiamos num valor que viesse do navegador. Só devolve o
--    pedido se ele pertencer ao dono (auth.uid()) e ainda estiver
--    aguardando pagamento.
-- --------------------------------------------------------------------------
create or replace function public.obter_pedido_para_pagamento(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pedido public.orders;
begin
    select * into v_pedido from public.orders
     where id = p_order_id and user_id = auth.uid();

    if not found then
        raise exception 'Pedido não encontrado.';
    end if;

    if v_pedido.status <> 'aguardando_pagamento' then
        raise exception 'Este pedido já não está aguardando pagamento.'; 
    end if;

    return v_pedido;
end;
$$;

revoke all on function public.obter_pedido_para_pagamento(uuid) from public, anon;
grant execute on function public.obter_pedido_para_pagamento(uuid) to authenticated, service_role;
