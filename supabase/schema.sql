-- ==========================================================================
-- Cervejaria Artesanal: tabelas de clientes e pedidos (Supabase / PostgreSQL)
--
-- Como usar: no painel do Supabase, abra "SQL Editor" > "New query",
-- cole TODO este arquivo e clique em "Run". Pode rodar de novo sem medo
-- (ele não apaga dados existentes).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) PERFIS: dados extras de cada cliente (o e-mail e a senha ficam no Auth)
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    nome        text,
    telefone    text,
    created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Cliente le o proprio perfil" on public.profiles;
create policy "Cliente le o proprio perfil"
    on public.profiles for select
    to authenticated
    using (id = auth.uid());

drop policy if exists "Cliente edita o proprio perfil" on public.profiles;
create policy "Cliente edita o proprio perfil"
    on public.profiles for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- Cria o perfil automaticamente quando alguém se cadastra
create or replace function public.criar_perfil_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, nome, telefone)
    values (
        new.id,
        left(new.raw_user_meta_data ->> 'nome', 120),
        left(new.raw_user_meta_data ->> 'telefone', 30)
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
    after insert on auth.users
    for each row execute function public.criar_perfil_no_cadastro();

-- --------------------------------------------------------------------------
-- 2) PEDIDOS
--    status: aguardando_pagamento > em_preparo > enviado > entregue (ou cancelado)
-- --------------------------------------------------------------------------
create table if not exists public.orders (
    id               uuid primary key default gen_random_uuid(),
    numero           bigint generated always as identity (start with 1001),
    user_id          uuid not null references auth.users (id) on delete cascade,
    status           text not null default 'aguardando_pagamento'
                     check (status in ('aguardando_pagamento', 'em_preparo', 'enviado', 'entregue', 'cancelado')),
    cupom            text,
    subtotal         numeric(10, 2) not null check (subtotal >= 0),
    desconto         numeric(10, 2) not null default 0 check (desconto >= 0),
    total            numeric(10, 2) not null check (total >= 0),
    codigo_rastreio  text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders (user_id, created_at desc);

create table if not exists public.order_items (
    id          uuid primary key default gen_random_uuid(),
    order_id    uuid not null references public.orders (id) on delete cascade,
    produto_id  text not null,
    nome        text not null,
    preco       numeric(10, 2) not null check (preco >= 0),
    qtd         integer not null check (qtd between 1 and 99)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- Mantém "updated_at" em dia quando você muda o status
create or replace function public.atualizar_data_pedido()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists ao_atualizar_pedido on public.orders;
create trigger ao_atualizar_pedido
    before update on public.orders
    for each row execute function public.atualizar_data_pedido();

-- Segurança: o cliente só LÊ os próprios pedidos.
-- Ele não consegue inserir, editar ou apagar direto (nem mudar o status):
-- criar pedido só é possível pela função criar_pedido(), abaixo.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Cliente le os proprios pedidos" on public.orders;
create policy "Cliente le os proprios pedidos"
    on public.orders for select
    to authenticated
    using (user_id = auth.uid());

drop policy if exists "Cliente le os itens dos proprios pedidos" on public.order_items;
create policy "Cliente le os itens dos proprios pedidos"
    on public.order_items for select
    to authenticated
    using (exists (
        select 1 from public.orders o
        where o.id = order_items.order_id and o.user_id = auth.uid()
    ));

-- --------------------------------------------------------------------------
-- 3) FUNÇÃO QUE CRIA O PEDIDO (tudo ou nada: pedido + itens juntos)
--    Os totais são calculados aqui no servidor a partir dos itens enviados.
-- --------------------------------------------------------------------------
create or replace function public.criar_pedido(
    p_itens    jsonb,
    p_cupom    text default null,
    p_desconto numeric default 0
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user      uuid := auth.uid();
    v_subtotal  numeric(10, 2) := 0;
    v_desconto  numeric(10, 2);
    v_item      jsonb;
    v_pedido    public.orders;
begin
    if v_user is null then
        raise exception 'Entre na sua conta para finalizar o pedido.';
    end if;

    if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
        raise exception 'O carrinho está vazio.';
    end if;

    if jsonb_array_length(p_itens) > 50 then
        raise exception 'Itens demais no mesmo pedido.';
    end if;

    for v_item in select * from jsonb_array_elements(p_itens) loop
        v_subtotal := v_subtotal + (v_item ->> 'preco')::numeric * (v_item ->> 'qtd')::int;
    end loop;

    v_desconto := least(greatest(coalesce(p_desconto, 0), 0), v_subtotal);

    insert into public.orders (user_id, cupom, subtotal, desconto, total)
    values (v_user, nullif(left(p_cupom, 40), ''), v_subtotal, v_desconto, v_subtotal - v_desconto)
    returning * into v_pedido;

    insert into public.order_items (order_id, produto_id, nome, preco, qtd)
    select
        v_pedido.id,
        left(i ->> 'id', 80),
        left(i ->> 'nome', 120),
        (i ->> 'preco')::numeric,
        (i ->> 'qtd')::int
    from jsonb_array_elements(p_itens) as i;

    return v_pedido;
end;
$$;

revoke all on function public.criar_pedido(jsonb, text, numeric) from public, anon;
grant execute on function public.criar_pedido(jsonb, text, numeric) to authenticated;

-- --------------------------------------------------------------------------
-- 4) EXCLUSÃO DE CONTA (LGPD, art. 18, VI)
--    O cliente só consegue apagar a PRÓPRIA conta (auth.uid()), nunca a de
--    outra pessoa. Apagar o usuário em auth.users arrasta em cascata o
--    perfil (profiles) e os pedidos (orders/order_items), pelas FKs
--    "on delete cascade" já criadas acima.
-- --------------------------------------------------------------------------
create or replace function public.excluir_conta()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Você precisa estar logado para excluir sua conta.';
    end if;

    delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.excluir_conta() from public, anon;
grant execute on function public.excluir_conta() to authenticated;
