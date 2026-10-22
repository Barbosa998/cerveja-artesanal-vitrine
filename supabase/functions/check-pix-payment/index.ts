// Edge Function: verifica direto no Mercado Pago se um Pix já foi pago.
//
// Existe como reforço do webhook (mp-webhook): no modo de teste do
// Mercado Pago, a notificação pode demorar, não chegar, ou (conforme a
// própria documentação) simplesmente não ser enviada para alguns tipos de
// pagamento de teste. O front chama esta função periodicamente enquanto
// mostra o QR Code, para a confirmação não depender só do webhook.
//
// Mesma regra de segurança do create-pix-payment: só confirma o pagamento
// de um pedido que pertence a quem está chamando.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';
import { getPayment, isPaymentApproved } from '../_shared/mercadopago.ts';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { order_id: orderId } = await req.json();
        if (!orderId) return json({ error: 'order_id é obrigatório.' }, 400);

        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

        const userClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        );

        // Só pedido do próprio usuário (RLS) — não usa a função
        // obter_pedido_para_pagamento aqui porque ela recusa pedidos que já
        // não estão aguardando pagamento, e aqui isso é uma resposta válida
        // ("já foi pago"), não um erro.
        const { data: order, error: orderError } = await userClient
            .from('orders')
            .select('id, status, total, mp_payment_id')
            .eq('id', orderId)
            .maybeSingle();

        if (orderError || !order) return json({ error: 'Pedido não encontrado.' }, 404);

        if (order.status !== 'aguardando_pagamento') {
            return json({ status: order.status }); // já pago (ou cancelado): nada a verificar
        }

        if (!order.mp_payment_id) {
            return json({ status: order.status }); // ainda não gerou o Pix
        }

        const accessToken = Deno.env.get('MP_ACCESS_TOKEN')!;
        const payment = await getPayment({ accessToken, paymentId: order.mp_payment_id });

        if (!isPaymentApproved(payment)) {
            return json({ status: order.status, mp_status: payment.status });
        }

        const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        const { data: updated, error } = await serviceClient.rpc('confirmar_pagamento_automatico', {
            p_order_id: order.id,
            p_mp_payment_id: order.mp_payment_id,
            p_amount: Number(order.total),
        });
        if (error) throw error;

        return json({ status: updated.status });
    } catch (error) {
        console.error('[check-pix-payment]', error);
        return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
    }
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
