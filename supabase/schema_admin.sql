-- ==========================================================================
-- Cervejaria Artesanal: painel de administração
--
-- Rode este arquivo DEPOIS do supabase/schema.sql, no SQL Editor do
-- Supabase ("SQL Editor" > "New query", cole tudo, clique em "Run").
-- Pode rodar de novo sem perder dados já existentes.
--
-- Depois de rodar, vire admin (não existe tela para isso, é proposital):
-- crie sua conta normalmente pelo site e depois rode, trocando o e-mail:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'SEU-EMAIL-AQUI@exemplo.com';
--
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) ADMINS + is_admin()
--    Quem é admin é decidido só aqui no banco. O front nunca decide isso.
-- --------------------------------------------------------------------------
create table if not exists public.admins (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    role        text not null default 'admin',
    created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Cada admin só enxerga o próprio registro (não vaza a lista de admins)
drop policy if exists "Admin le o proprio registro" on public.admins;
create policy "Admin le o proprio registro"
    on public.admins for select
    to authenticated
    using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
    select exists (
        select 1 from public.admins where user_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- --------------------------------------------------------------------------
-- 2) PEDIDOS: admin lê todos; status ganha o passo "pago"
-- --------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
    check (status in ('aguardando_pagamento', 'pago', 'em_preparo', 'enviado', 'entregue', 'cancelado'));

drop policy if exists "Admin le todos os pedidos" on public.orders;
create policy "Admin le todos os pedidos"
    on public.orders for select
    to authenticated
    using (public.is_admin());

drop policy if exists "Admin le itens de todos os pedidos" on public.order_items;
create policy "Admin le itens de todos os pedidos"
    on public.order_items for select
    to authenticated
    using (public.is_admin());

-- Admin também precisa ver o nome/telefone de quem fez o pedido.
drop policy if exists "Admin le todos os perfis" on public.profiles;
create policy "Admin le todos os perfis"
    on public.profiles for select
    to authenticated
    using (public.is_admin());

-- --------------------------------------------------------------------------
-- 3) PAGAMENTOS (confirmados manualmente pelo admin, ex.: Pix por fora)
-- --------------------------------------------------------------------------
create table if not exists public.payments (
    id            uuid primary key default gen_random_uuid(),
    order_id      uuid not null references public.orders (id) on delete cascade,
    method        text not null check (method in ('pix', 'dinheiro', 'outro')),
    amount        numeric(10, 2) not null check (amount >= 0),
    received_at   timestamptz not null default now(),
    confirmed_by  uuid not null references auth.users (id),
    proof_note    text,
    created_at    timestamptz not null default now()
);

create index if not exists payments_order_id_idx on public.payments (order_id);

alter table public.payments enable row level security;

drop policy if exists "Admin le pagamentos" on public.payments;
create policy "Admin le pagamentos"
    on public.payments for select
    to authenticated
    using (public.is_admin());
-- Sem policy de INSERT: só a função admin_confirm_payment() grava aqui.

-- --------------------------------------------------------------------------
-- 4) HISTÓRICO (audit_log) — só leitura pela API; escrita só pelas funções
--    abaixo. Nem o próprio admin consegue editar ou apagar pela API.
-- --------------------------------------------------------------------------
create table if not exists public.audit_log (
    id          uuid primary key default gen_random_uuid(),
    admin_id    uuid not null references auth.users (id),
    order_id    uuid references public.orders (id) on delete set null,
    acao        text not null,
    detalhes    jsonb,
    created_at  timestamptz not null default now()
);

create index if not exists audit_log_order_id_idx on public.audit_log (order_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "Admin le o historico" on public.audit_log;
create policy "Admin le o historico"
    on public.audit_log for select
    to authenticated
    using (public.is_admin());

-- --------------------------------------------------------------------------
-- 5) RPC: mudar status do pedido (o front nunca faz UPDATE direto em orders)
--    Máquina de estados: só avança, ou cancela enquanto não foi enviado.
-- --------------------------------------------------------------------------
create or replace function public.admin_set_order_status(
    p_order_id        uuid,
    p_new_status      text,
    p_codigo_rastreio text default null,
    p_note            text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pedido   public.orders;
    v_old      text;
    v_allowed  text[];
begin
    if not public.is_admin() then
        raise exception 'Acesso restrito.';
    end if;

    select * into v_pedido from public.orders where id = p_order_id for update;
    if not found then
        raise exception 'Pedido não encontrado.';
    end if;
    v_old := v_pedido.status;

    v_allowed := case v_old
        when 'aguardando_pagamento' then array['pago', 'cancelado']
        when 'pago'                 then array['em_preparo', 'cancelado']
        when 'em_preparo'           then array['enviado', 'cancelado']
        when 'enviado'              then array['entregue']
        else array[]::text[]
    end;

    if p_new_status <> v_old and not (p_new_status = any(v_allowed)) then
        raise exception 'Não é possível mudar o pedido de "%" para "%".', v_old, p_new_status;
    end if;

    update public.orders
       set status = p_new_status,
           codigo_rastreio = coalesce(nullif(btrim(p_codigo_rastreio), ''), codigo_rastreio)
     where id = p_order_id
    returning * into v_pedido;

    insert into public.audit_log (admin_id, order_id, acao, detalhes)
    values (auth.uid(), p_order_id, 'mudar_status', jsonb_build_object(
        'de', v_old, 'para', p_new_status, 'rastreio', p_codigo_rastreio, 'nota', p_note
    ));

    return v_pedido;
end;
$$;

revoke all on function public.admin_set_order_status(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, text, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- 6) RPC: confirmar pagamento (ex.: Pix visto no WhatsApp)
--    Se o valor informado for diferente do total do pedido, exige nota.
-- --------------------------------------------------------------------------
create or replace function public.admin_confirm_payment(
    p_order_id uuid,
    p_method   text,
    p_amount   numeric,
    p_note     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pedido public.orders;
begin
    if not public.is_admin() then
        raise exception 'Acesso restrito.';
    end if;

    select * into v_pedido from public.orders where id = p_order_id for update;
    if not found then
        raise exception 'Pedido não encontrado.';
    end if;

    if v_pedido.status <> 'aguardando_pagamento' then
        raise exception 'Este pedido já não está aguardando pagamento.';
    end if;

    if p_amount <> v_pedido.total and (p_note is null or btrim(p_note) = '') then
        raise exception 'O valor informado (%) é diferente do total do pedido (%). Escreva uma justificativa.', p_amount, v_pedido.total;
    end if;

    insert into public.payments (order_id, method, amount, confirmed_by, proof_note)
    values (p_order_id, p_method, p_amount, auth.uid(), p_note);

    update public.orders set status = 'pago' where id = p_order_id
    returning * into v_pedido;

    insert into public.audit_log (admin_id, order_id, acao, detalhes)
    values (auth.uid(), p_order_id, 'confirmar_pagamento', jsonb_build_object(
        'metodo', p_method, 'valor', p_amount, 'nota', p_note
    ));

    return v_pedido;
end;
$$;

revoke all on function public.admin_confirm_payment(uuid, text, numeric, text) from public, anon;
grant execute on function public.admin_confirm_payment(uuid, text, numeric, text) to authenticated;

-- --------------------------------------------------------------------------
-- 7) RPC: listar pedidos com nome/telefone/e-mail do cliente (o e-mail
--    mora em auth.users, que o PostgREST não expõe direto pelo .from()).
--    Devolve vazio se quem chamar não for admin (falha fechada).
-- --------------------------------------------------------------------------
create or replace function public.admin_listar_pedidos()
returns table (
    id               uuid,
    numero           bigint,
    status           text,
    cupom            text,
    subtotal         numeric,
    desconto         numeric,
    total            numeric,
    codigo_rastreio  text,
    created_at       timestamptz,
    updated_at       timestamptz,
    cliente_nome     text,
    cliente_telefone text,
    cliente_email    text
)
language sql
security definer
set search_path = public
stable
as $$
    select
        o.id, o.numero, o.status, o.cupom, o.subtotal, o.desconto, o.total,
        o.codigo_rastreio, o.created_at, o.updated_at,
        p.nome, p.telefone, u.email
    from public.orders o
    left join public.profiles p on p.id = o.user_id
    left join auth.users u on u.id = o.user_id
    where public.is_admin()
    order by o.created_at desc;
$$;

revoke all on function public.admin_listar_pedidos() from public, anon;
grant execute on function public.admin_listar_pedidos() to authenticated;

-- --------------------------------------------------------------------------
-- 8) PRODUTOS: catálogo editável pelo painel.
--    A vitrine pública (até gente não logada) só vê os produtos "ativo".
--    O admin vê e edita tudo, inclusive os inativos (fora de estoque/linha).
-- --------------------------------------------------------------------------
create table if not exists public.produtos (
    id            text primary key,
    nome          text not null,
    estilo        text not null,
    -- categoria: usada só para o filtro da vitrine (checkboxes fixos no HTML).
    -- "estilo" é o texto livre mostrado na página; "categoria" é o valor curto.
    categoria     text not null default 'outro'
                  check (categoria in ('ipa', 'stout', 'pilsen', 'weiss', 'apa', 'sour', 'outro')),
    resumo        text,
    sobre         jsonb not null default '[]'::jsonb,
    preco         numeric(10, 2) not null check (preco >= 0),
    abv           text,
    ibu           text,
    volume        text,
    temperatura   text,
    copo          text,
    harmonizacao  text,
    fotos         jsonb not null default '[]'::jsonb,
    estoque       integer not null default 0 check (estoque >= 0),
    ativo         boolean not null default true,
    ordem         integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

alter table public.produtos enable row level security;

drop policy if exists "Vitrine publica le produtos ativos" on public.produtos;
create policy "Vitrine publica le produtos ativos"
    on public.produtos for select
    to anon, authenticated
    using (ativo = true);

-- Admin lê, cria, edita e apaga qualquer produto (inclusive inativos).
drop policy if exists "Admin gerencia produtos" on public.produtos;
create policy "Admin gerencia produtos"
    on public.produtos for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create or replace function public.atualizar_data_produto()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists ao_atualizar_produto on public.produtos;
create trigger ao_atualizar_produto
    before update on public.produtos
    for each row execute function public.atualizar_data_produto();

-- --------------------------------------------------------------------------
-- 9) SEED (opcional): copia os produtos que hoje estão fixos em
--    js/produtos.js para a tabela, pra você começar a editá-los pelo
--    painel em vez do arquivo. Rode só uma vez; "on conflict do nothing"
--    evita duplicar se rodar de novo.
-- --------------------------------------------------------------------------
insert into public.produtos (id, nome, estilo, categoria, resumo, sobre, preco, abv, ibu, volume, temperatura, copo, harmonizacao, fotos, estoque, ordem)
values
    ('hop-explosion-ipa', 'Hop Explosion IPA', 'India Pale Ale', 'ipa',
     'India Pale Ale com notas cítricas e amargor marcante.',
     '["Uma IPA para quem gosta de lúpulo de verdade: aroma cítrico logo ao abrir, amargor marcante e um final que convida ao próximo gole.","Ideal para apreciar bem gelada, com calma, e para acompanhar pratos com personalidade."]'::jsonb,
     28.90, '6.5%', '55', '473 ml', '6 a 8 °C', 'Tulipa ou caneca', 'Carnes grelhadas, queijos curados e comida picante',
     '[{"src":"assets/img/beer-ipa.jpg","alt":"Garrafa de cerveja IPA com rótulo verde"}]'::jsonb, 50, 1),

    ('midnight-stout', 'Midnight Stout', 'Dry Stout', 'stout',
     'Stout escura, de corpo médio e final seco.',
     '["Uma Dry Stout escura com notas de malte tostado, lembrando café e cacau, e um final seco que deixa vontade de continuar.","Boa companhia para noites frias e para sobremesas com chocolate."]'::jsonb,
     26.50, '5.0%', '35', '473 ml', '8 a 10 °C', 'Caneca ou tulipa', 'Chocolate, churrasco e sobremesas',
     '[{"src":"assets/img/beer-stout.jpg","alt":"Lata de cerveja Stout com rótulo escuro"}]'::jsonb, 50, 2),

    ('classic-pilsen', 'Classic Pilsen', 'Premium American Lager', 'pilsen',
     'Leve, refrescante e de final limpo.',
     '["Uma lager clara, leve e refrescante, com amargor suave e final limpo. A cerveja para o dia a dia, feita com cuidado artesanal.","Funciona em qualquer ocasião, do churrasco de domingo ao happy hour."]'::jsonb,
     22.00, '4.8%', '15', '600 ml', '3 a 5 °C', 'Copo pilsner ou americano', 'Petiscos, frituras e pratos leves',
     '[{"src":"assets/img/beer-pilsen.jpg","alt":"Garrafa de cerveja Pilsen cristalina"}]'::jsonb, 50, 3),

    ('bavarian-weiss', 'Bavarian Weiss', 'Hefeweizen', 'weiss',
     'Cerveja de trigo, turva e cremosa.',
     '["Uma Hefeweizen de trigo, turva e cremosa, com notas que lembram banana e cravo, característica do estilo bávaro.","Leve e aromática, combina com dias quentes e refeições simples."]'::jsonb,
     25.90, '5.2%', '12', '473 ml', '5 a 7 °C', 'Copo weizen', 'Saladas, frutos do mar e comida leve',
     '[{"src":"assets/img/beer-weiss.jpg","alt":"Lata de cerveja Weiss com rótulo amarelo"}]'::jsonb, 50, 4),

    ('sunset-apa', 'Sunset APA', 'American Pale Ale', 'apa',
     'Equilíbrio entre malte e lúpulo, com aroma cítrico.',
     '["Uma American Pale Ale equilibrada: malte na medida, lúpulo aromático e amargor moderado. Ótima porta de entrada para quem está começando nas artesanais.","Versátil à mesa e fácil de gostar."]'::jsonb,
     27.50, '5.5%', '40', '473 ml', '6 a 8 °C', 'Tulipa ou caneca', 'Hambúrguer, pizza e queijos',
     '[{"src":"assets/img/beer-apa.jpg","alt":"Garrafa de cerveja APA com rótulo laranja"}]'::jsonb, 50, 5),

    ('berry-sour', 'Berry Sour', 'Catharina Sour', 'sour',
     'Ácida, leve e refrescante, com frutas vermelhas.',
     '["Uma Catharina Sour com acidez refrescante e frutas vermelhas. Baixo amargor, baixo teor alcoólico e muito sabor.","Para quem quer experimentar algo diferente e leve."]'::jsonb,
     30.00, '4.2%', '8', '473 ml', '4 a 6 °C', 'Taça ou tulipa', 'Queijos cremosos, saladas e sobremesas de frutas',
     '[{"src":"assets/img/beer-sour.jpg","alt":"Lata de cerveja Sour com frutas vermelhas"}]'::jsonb, 50, 6)
on conflict (id) do nothing;
