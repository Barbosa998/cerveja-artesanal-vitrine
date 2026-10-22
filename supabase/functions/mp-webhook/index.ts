// Edge Function: recebe o aviso do Mercado Pago quando um pagamento muda
// de status. Pública (o Mercado Pago chama direto, sem sessão de usuário),
// por isso a única proteção é validar a assinatura (x-signature) com o
// MP_WEBHOOK_SECRET — sem isso, qualquer um poderia mandar um POST fingindo
// "paguei" para um pedido alheio.
//
// Nunca confiamos no corpo da notificação para o status do pagamento: só
// usamos "data.id" como ponteiro e buscamos o pagamento de verdade na API
// do Mercado Pago (GET /v1/payments/{id}), como a documentação recomenda.
//
// Responde 200 rápido (o MP espera isso em até ~22s) e processa depois —
// aqui o processamento é rápido o bastante para responder só no final.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { getPayment, isPaymentApproved, verifyWebhookSignature } from '../_shared/mercadopago.ts';

Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
        const dataId = url.searchParams.get('data.id');
        const body = await req.json().catch(() => ({}));
        const type = body?.type || url.searchParams.get('type');

        // Só nos interessa notificação de pagamento.
        if (type !== 'payment') {
            return new Response('ok', { status: 200 });
        }

        const secret = Deno.env.get('MP_WEBHOOK_SECRET');
        if (!secret) {
            console.error('[mp-webhook] MP_WEBHOOK_SECRET não configurado.');
            return new Response('erro de configuração', { status: 500 });
        }

        const valid = await verifyWebhookSignature({
            xSignature: req.headers.get('x-signature'),
            xRequestId: req.headers.get('x-request-id'),
            dataId,
            secret,
        });
        if (!valid) {
            console.warn('[mp-webhook] assinatura inválida, ignorando notificação.');
            return new Response('assinatura inválida', { status: 401 });
        }

        const paymentId = dataId || body?.data?.id;
        if (!paymentId) return new Response('ok', { status: 200 });

        const accessToken = Deno.env.get('MP_ACCESS_TOKEN')!;
        const payment = await getPayment({ accessToken, paymentId: String(paymentId) });

        if (!isPaymentApproved(payment)) {
            return new Response('ok (ainda não aprovado)', { status: 200 });
        }

        const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const { data: order } = await serviceClient
            .from('orders')
            .select('id, total')
            .eq('mp_payment_id', String(payment.id))
            .maybeSingle();

        if (!order) {
            console.warn('[mp-webhook] nenhum pedido encontrado para mp_payment_id', payment.id);
            return new Response('ok (pedido não encontrado)', { status: 200 });
        }

        const { error } = await serviceClient.rpc('confirmar_pagamento_automatico', {
            p_order_id: order.id,
            p_mp_payment_id: String(payment.id),
            p_amount: Number(order.total),
        });
        if (error) throw error;

        return new Response('ok', { status: 200 });
    } catch (error) {
        console.error('[mp-webhook]', error);
        // Devolve 200 mesmo assim: um erro nosso não deve fazer o Mercado Pago
        // ficar retentando pra sempre uma notificação que já processamos
        // (ou que o check-pix-payment do front já cobriu).
        return new Response('ok (com erro interno, veja os logs)', { status: 200 });
    }
});
