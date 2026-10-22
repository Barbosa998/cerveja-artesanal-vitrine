# Auditoria de acessibilidade e SEO (Lighthouse)

Medido localmente com [Lighthouse](https://developer.chrome.com/docs/lighthouse) (`npx lighthouse`, Chrome headless), servindo o site com `python -m http.server`. Os relatórios completos não ficam no repositório (são pesados e geram diff só de ruído); este arquivo guarda os números e o que foi corrigido.

## Resultado (depois das correções)

| Página | Performance | Acessibilidade | Boas práticas | SEO |
|---|---|---|---|---|
| `index.html` | 81 | **100** | **100** | **100** |
| `produto.html` | 69 | **100** | **100** | **100** |
| `conta.html` | 87 | **100** | **100** | 55\* |

\* `conta.html` é a única página com nota de SEO baixa — **de propósito**. Ela tem `<meta name="robots" content="noindex">` porque é uma área logada (pedidos, dados pessoais) e não deve aparecer no Google. O Lighthouse penaliza qualquer `noindex` como "bloqueada da indexação", mesmo quando é a decisão certa. `admin.html` tem o mesmo `noindex` pelo mesmo motivo (não foi medido à parte, mas vale a mesma observação).

## O que mudou

### Antes de qualquer correção (`index.html`)
Performance 81 · Acessibilidade 100 · Boas práticas 96 · SEO 100.

A acessibilidade e o SEO já estavam perfeitos. O que puxava "Boas práticas" para baixo eram três recursos referenciados no HTML que nunca existiram no repositório, gerando erro 404 no console (e um deles, imagem quebrada na vitrine):

- `assets/img/favicon.ico` e `assets/img/apple-touch-icon.png` — removidos de todas as páginas; ficou só o `<link rel="icon" href="assets/img/icon.svg">`, que já existia e funciona (criado a partir do mesmo emblema do `logo-placeholder.svg`, só recortado em quadrado).
- `assets/img/beer-apa.jpg` (foto da "Sunset APA") — nunca existiu. Copiei a foto da Stout como placeholder temporário (ver `TODO` em `js/produtos.js`) só para não ficar com ícone de imagem quebrada; precisa ser trocada pela foto de verdade.

Resultado: Boas práticas 96 → **100**.

### CLS (Cumulative Layout Shift) em `produto.html`
Não era um problema de acessibilidade/SEO em si, mas apareceu na auditoria e é consequência direta de um refactor anterior desta sessão (vitrine dinâmica a partir do Supabase): a página ficava com `#produto-root` vazio até a resposta do catálogo chegar, e quando o conteúdo entrava de uma vez, o rodapé "pulava" — CLS de 0,52 (score 0,15/1).

Correção em `js/produto.js`: a página agora pinta **imediatamente** com os dados que já estão disponíveis de forma síncrona (a reserva estática de `js/produtos.js`, carregada antes de qualquer coisa). Quando a resposta do Supabase chega, só repinta se os dados forem **diferentes** da reserva (ex.: preço/estoque editados no painel do admin depois do primeiro commit da reserva) — no caso comum, em que são iguais, não repinta de novo.

Resultado: CLS 0,52 → **0** (score 0,15 → 1,0); Performance 49 → 69; a categoria experimental "agentic-browsing" 57 → 100.

`index.html` já tinha CLS perfeito (0) mesmo com o mesmo padrão assíncrono — o conteúdo entre a vitrine e o rodapé (benefícios, newsletter) absorve a mudança sem deslocar nada visível na dobra inicial — por isso não mexi lá, pra não arriscar duplicar os listeners dos filtros à toa.

## Verificado manualmente (o Lighthouse não automatiza)

O Lighthouse marca alguns itens de acessibilidade como "manual" — não dá pra confirmar só com a pontuação. Testei os dois mais relevantes aqui, no modal de verificação de idade (`#age-gate`):

- **Focus trap**: com o modal aberto, `Tab` cicla só entre os dois botões (“Não” / “Sim, sou maior de 18”) — nunca escapa para o cabeçalho ou o resto da página. É o comportamento nativo de `<dialog>.showModal()`, não precisou de código extra.
- **Esc não fecha**: confirmado que `Escape` não fecha o modal (o `cancel` event já tinha `preventDefault()` no código).

## O que fica para depois (fora do escopo desta rodada)

- **Performance** (81/69/87): minificar CSS/JS, cache de assets, carregamento das fontes do Google — é a "Etapa 7" já prevista no roadmap do README, feita separada porque exige decidir sobre build/minificação (o site hoje não tem build nenhum).
- `beer-apa.jpg` continua sendo um placeholder (foto da Stout) até a foto de verdade da Sunset APA.
