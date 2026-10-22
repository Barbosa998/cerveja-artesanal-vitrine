// Ponte com a API do Mercado Pago (Payments API). Contrato confirmado na
// documentação oficial antes de codar:
//   https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/integration-configuration/integrate-pix
//   https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/additional-content/your-integrations/notifications/webhooks
//
// MP_ACCESS_TOKEN é um secret da Edge Function (nunca chega ao navegador).

const MP_API = 'https://api.mercadopago.com';

export interface PixPaymentResult {
    id: number;
    status: string; // 'pending' | 'approved' | 'rejected' | 'cancelled' | ...
    status_detail: string;
    qr_code: string;
    qr_code_base64: string;
    ticket_url: string;
}

/**
 * Cria um pagamento Pix. `idempotencyKey` deve ser estável por pedido (ex.:
 * o id do pedido) para que tentar de novo com o mesmo pedido nunca gere um
 * segundo cobrança Pix.
 */
export async function createPixPayment(params: {
    accessToken: string;
    amount: number;
    description: string;
    externalReference: string;
    payerEmail: string;
    idempotencyKey: string;
}): Promise<PixPaymentResult> {
    const response = await fetch(`${MP_API}/v1/payments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${params.accessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': params.idempotencyKey,
        },
        body: JSON.stringify({
            transaction_amount: params.amount,
            description: params.description,
            payment_method_id: 'pix',
            external_reference: params.externalReference,
            payer: { email: params.payerEmail },
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        const message = data?.message || data?.error || 'Falha ao criar o pagamento Pix.';
        throw new Error(`Mercado Pago: ${message}`);
    }

    const qr = data?.point_of_interaction?.transaction_data;
    if (!qr?.qr_code) {
        throw new Error('Mercado Pago não devolveu o QR Code do Pix.');
    }

    return {
        id: data.id,
        status: data.status,
        status_detail: data.status_detail,
        qr_code: qr.qr_code,
        qr_code_base64: qr.qr_code_base64,
        ticket_url: qr.ticket_url,
    };
}

/** Busca o pagamento pelo id — nunca confiamos no corpo do webhook, só no id dele. */
export async function getPayment(params: { accessToken: string; paymentId: string }): Promise<PixPaymentResult> {
    const response = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(params.paymentId)}`, {
        headers: { Authorization: `Bearer ${params.accessToken}` },
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Mercado Pago: não foi possível consultar o pagamento ${params.paymentId}.`);
    }

    const qr = data?.point_of_interaction?.transaction_data;
    return {
        id: data.id,
        status: data.status,
        status_detail: data.status_detail,
        qr_code: qr?.qr_code || '',
        qr_code_base64: qr?.qr_code_base64 || '',
        ticket_url: qr?.ticket_url || '',
    };
}

/** Um pagamento "pago de verdade" no Pix: aprovado e creditado. */
export function isPaymentApproved(payment: Pick<PixPaymentResult, 'status'>): boolean {
    return payment.status === 'approved';
}

/**
 * Valida a assinatura do webhook (x-signature / x-request-id), exatamente
 * como a documentação manda: monta o "manifest", calcula HMAC-SHA256 com o
 * secret da aplicação e compara com o valor "v1" do cabeçalho.
 */
export async function verifyWebhookSignature(params: {
    xSignature: string | null;
    xRequestId: string | null;
    dataId: string | null;
    secret: string;
}): Promise<boolean> {
    if (!params.xSignature) return false;

    const parts = Object.fromEntries(
        params.xSignature.split(',').map((part) => {
            const [key, value] = part.split('=');
            return [key?.trim(), value?.trim()];
        })
    );
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return false;

    const dataIdLower = params.dataId ? params.dataId.toLowerCase() : '';
    let manifest = '';
    if (dataIdLower) manifest += `id:${dataIdLower};`;
    if (params.xRequestId) manifest += `request-id:${params.xRequestId};`;
    manifest += `ts:${ts};`;

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(params.secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
    const computed = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    return computed === v1;
}
