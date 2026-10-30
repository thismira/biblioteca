# Minha Biblioteca — biblioteca pessoal virtual

Site de presente: uma estante virtual para uma leitora registrar seus livros.
Estante com lombadas (cor extraída da borda esquerda da capa), página de cada
livro (status, progresso, datas, nota, resenha, quotes, playlist do Spotify),
ordenação com animação FLIP, modo "Personalizado" com arrastar e soltar,
prateleira "Lendo agora", lista de desejos com link para a Amazon UK e backup
em JSON.

## Regras de trabalho (obrigatórias)
- **Responder sempre em português.**
- **Explicar cada decisão em linguagem simples antes de executar.** O dono do
  projeto é iniciante.
- **Nunca apagar dados de livros sem pedir confirmação** — isso inclui limpar o
  localStorage, sobrescrever dados ao importar backup ou rodar scripts de teste
  que substituam a biblioteca.
- Acessar dados **somente** por `js/data/db.js`. Nenhum outro arquivo usa
  `localStorage` diretamente (para depois trocarmos pelo Supabase).
- Desktop primeiro, mas não usar soluções que impeçam a versão para celular
  (pointer events em vez de eventos de mouse, layouts que se redistribuem).
- Um commit a cada funcionalidade que funcionar, testada no preview.

## Tecnologia
- HTML, CSS e JavaScript puros, com módulos ES (`<script type="module">`).
  Sem bibliotecas e sem etapa de build.
- Site estático, publicável no GitHub Pages. Rotas com `#` (ex.: `#/livro/id`).
- Rodar localmente: `python3 -m http.server 8080` (módulos não funcionam
  abrindo o arquivo com duplo clique). Configurado em `.claude/launch.json`.
- Dados: `localStorage` via `js/data/local-store.js`; a API de `db.js` é toda
  assíncrona para facilitar a troca por um `supabase-store.js`.

## Estrutura
- `index.html` — página única.
- `css/` — `base.css` (cores, fontes, componentes), `shelf.css`, `detail.css`,
  `wishlist.css`.
- `js/main.js` — inicialização e rotas.
- `js/data/` — `db.js` (fachada) e `local-store.js` (implementação).
- `js/services/` — Open Library, cor da lombada, Spotify, Amazon.
- `js/ui/` — estante, ordenação, FLIP, arrastar, página do livro, cadastro,
  lista de desejos, backup, diálogos.
- `js/utils/` — funções de cor e utilidades.

## Visual
- Paleta: fundo `#FDF1F1`, painéis `#F5DADF`, destaques `#FFD1DC`, texto
  `#4A2C35`, botões `#9E4A65`. Estante pintada creme/rosa.
- Fontes: Cormorant Garamond (títulos, lombadas, quotes) + Nunito Sans
  (interface).
- Cores definidas como variáveis em `:root` no `css/base.css`.

## Formato de um livro
```
{ id, title, author, coverUrl, pages, isbn, categories: [],
  location: "estante" | "desejos",
  status: "quero ler" | "lendo" | "lido",
  currentPage, startDate, endDate, rating, review,
  quotes: [{ id, text, page }], spotifyUrl,
  spineColor, spineColorManual,
  wishPrice, wishPriceDate, createdAt, updatedAt }
```
Configurações (`settings`): `sortBy`, `customOrder` (lista de ids),
`categories` (criadas pela leitora).
