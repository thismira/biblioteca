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
- `css/` — `base.css` (cores, fontes, componentes), `shelf.css`,
  `add-book.css` (cadastro e chips de categoria), `detail.css`, `wishlist.css`.
- `js/main.js` — inicialização e rotas.
- `js/data/` — `db.js` (fachada) e `local-store.js` (implementação).
- `js/services/` — Open Library, cor da lombada, Spotify, Amazon.
  - `openlibrary.js`: busca (PT ou EN) sem pedir a lista de ISBNs (pode ter
    milhares); mostra o título da edição que bateu com a busca.
    `getEditions(workKey, lang)` usa a Query API (`/query.json`), que filtra
    o idioma no servidor — a lista comum `/editions.json` vem misturada e
    quase não traz edições em português. Capa, páginas e ISBN vêm da edição
    escolhida. `suggestCategories()` traduz assuntos para categorias em PT.
- `js/ui/` — estante, ordenação, FLIP, arrastar, página do livro, cadastro,
  lista de desejos, backup, diálogos.
  - `add-book.js`: cadastro em 3 passos (buscar → edição → revisar).
    ISBN e link da capa não aparecem para ela (o ISBN fica guardado para o
    link da Amazon). Páginas só são digitáveis no cadastro manual.
  - `category-picker.js`: chips de categoria reutilizável (cadastro e
    página do livro).
  - `favorite-star.js`: estrela que "estoura" com faíscas e `flyStar()`, a
    estrelinha que voa até a prateleira de favoritos (evento
    `livro:favoritado`, tratado em `main.js`).
  - Atenção em formulários: use `form.elements.title`, não `form.title`
    (que é o atributo title do próprio formulário).
- `js/utils/` — funções de cor e utilidades.

## Visual
- Título do site: **M’s Library**, centralizado, com ornamento em SVG.
- Paleta: fundo `#FDF1F1` com papel de parede (listras e florzinhas em SVG),
  painéis `#F5DADF`, destaques `#FFD1DC`, texto `#4A2C35`, botões `#9E4A65`.
- Estante: móvel de madeira pintada em rosa antigo (`--tinta`, `--nicho`),
  com cornija, laterais, tábuas, rodapé com pés e veios suaves (SVG
  `feTurbulence` em `--veio-h`/`--veio-v`). Interior mais escuro para
  dar contraste aos livros.
- Lombadas realistas: volume em degradê, trama de tecido e granulado; 4
  acabamentos fixos por livro (`data-estilo` 0–3). O texto é montado na
  horizontal e girado 90°; título centralizado, autor em maiúsculas no pé.
  O tamanho da letra é calculado medindo o texto (`measureText`) em
  `js/ui/shelf.js`.
- Fontes: Cormorant Garamond (títulos, lombadas, quotes) + Nunito Sans
  (interface).
- Cores definidas como variáveis em `:root` (`css/base.css` e `css/shelf.css`).

## Preview local
O macOS impede o servidor iniciado pelo preview de ler a pasta Documentos.
Por isso o servidor é ligado pelo terminal (`python3 -m http.server 8080`
dentro da pasta) e o `.claude/launch.json` só se conecta a
`http://localhost:8080`.

## Formato de um livro
```
{ id, title, author, coverUrl, pages, isbn, categories: [],
  location: "estante" | "desejos",
  status: "quero ler" | "lendo" | "lido",
  currentPage, progressLog: [{ date, page }], favorite,
  edition: { publisher, year, lang },
  startDate, endDate, rating, review,
  quotes: [{ id, text, page }], spotifyUrl,
  spineColor, spineColorManual,
  wishPrice, wishPriceDate, createdAt, updatedAt }
```
Configurações (`settings`): `sortBy`, `customOrder` (lista de ids),
`categories` (criadas pela leitora).

`progressLog` ganha uma entrada a cada atualização de página; a página do
livro (etapa 4) usa isso para mostrar % que falta, páginas que faltam e
páginas lidas desde a última atualização. Favoritos aparecem numa estante
própria (plaquinha dourada) e com estrelinha na lombada também na estante
principal.
