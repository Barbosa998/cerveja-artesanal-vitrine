// Cabeçalhos CORS compartilhados pelas Edge Functions chamadas direto do
// navegador (create-pix-payment, check-pix-payment). mp-webhook não precisa
// (quem chama é o servidor do Mercado Pago, não um navegador).
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
