// Edge Function: cria um pagamento Pix para um pedido já existente.
//
// Chamada pelo navegador (client.functions.invoke), autenticada com a
// sessão do cliente. O valor cobrado NUNCA vem do navegador: é sempre lido
// do pedido já salvo no banco (obter_pedido_para_pagamento), para ninguém
// conseguir pagar menos adulterando o front.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';
import { createPixPayment } from '../_shared/mercadopago.ts';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { order_id: orderId } = await req.json();
        if (!orderId) {
            return json({ error: 'order_id é obrigatório.' }, 400);
        }

        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

        // Cliente "como o usuário": respeita RLS e auth.uid(), não enxerga pedido de outra pessoa.
        const userClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: userError } = await userClient.auth.getUser();
        if (userError || !user) return json({ error: 'Sessão inválida.' }, 401);

        const { data: order, error: orderError } = await userClient.rpc('obter_pedido_para_pagamento', {
            p_order_id: orderId,
        });
        if (orderError || !order) {
            return json({ error: orderError?.message || 'Pedido não encontrado.' }, 404);
        }

        const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
        if (!accessToken) {
            return json({ error: 'Pagamento por Pix não está configurado (MP_ACCESS_TOKEN ausente).' }, 500);
        }

        const payment = await createPixPayment({
            accessToken,
            amount: Number(order.total),
            description: `Pedido #${order.numero} - Cervejaria Artesanal`,
            externalReference: order.id,
            payerEmail: user.email!,
            idempotencyKey: order.id, // mesmo pedido = mesma chave: nunca duplica a cobrança
        });

        // Guarda o id do pagamento no pedido (service role: ignora RLS, é uma escrita de servidor).
        const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        await serviceClient.from('orders').update({ mp_payment_id: String(payment.id) }).eq('id', order.id);

        return json({
            payment_id: payment.id,
            status: payment.status,
            qr_code: payment.qr_code,
            qr_code_base64: payment.qr_code_base64,
            ticket_url: payment.ticket_url,
        });
    } catch (error) {
        console.error('[create-pix-payment]', error);
        return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
    }
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
