/**
 * Configuração do site: WhatsApp dos pedidos e área do cliente (Supabase).
 *
 * Como preencher (passo a passo no README):
 *   1. Crie um projeto grátis em https://supabase.com
 *   2. Em "Project Settings" > "API", copie a "Project URL" e a chave "anon public"
 *   3. Cole os dois valores abaixo.
 *
 * A chave "anon public" PODE ficar no site: ela é pública por natureza e quem
 * protege os dados são as regras (RLS) criadas pelo arquivo supabase/schema.sql.
 * NUNCA coloque aqui a chave "service_role".
 *
 * Enquanto os campos estiverem vazios, o botão "Entrar" some do site e o
 * carrinho continua enviando o pedido direto pelo WhatsApp, como antes.
 */
window.VITRINE_CONFIG = {
    whatsappNumber: '5544998934310',
    supabaseUrl: 'https://eogapdxewnahxppcmpaf.supabase.co/',
    supabaseAnonKey: 'sb_publishable_DPezE7ZQEHXvR24_SenWyA_zwiGQFx1'
};