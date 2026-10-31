# Minha Biblioteca — biblioteca pessoal virtual

Site de presente: uma biblioteca virtual para uma leitora registrar seus
livros. A tela inicial é uma "sala" com estantes em miniatura (automáticas e
criadas por ela); clicar numa estante faz ela crescer e virar a estante
grande, com lombadas (cor extraída da borda esquerda da capa). Página de cada
livro (status, progresso, datas, nota, resenha, trechos, playlist do
Spotify), ordenação com animação FLIP, modo "Personalizado" com arrastar e
soltar, lista de desejos com link para a Amazon UK e backup em JSON.

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
- Testes no preview usam os dados reais do navegador: prefira estantes e
  livros temporários criados para o teste. Se precisar mexer em algo dela
  (ordens, arrumação), guarde antes uma cópia que sobreviva a recarregar a
  página (ex.: `sessionStorage`) e restaure ao final.

## Tecnologia
- HTML, CSS e JavaScript puros, com módulos ES (`<script type="module">`).
  Sem bibliotecas e sem etapa de build.
- Site estático, publicável no GitHub Pages. Rotas com `#` (ex.: `#/livro/id`).
- Rodar localmente: `python3 servidor-local.py` (porta 8080, envia
  `Cache-Control: no-store` — o `http.server` comum deixava o navegador usar
  JS antigo do cache). Módulos não funcionam abrindo o arquivo com duplo
  clique.
- Dados: `localStorage` via `js/data/local-store.js`; a API de `db.js` é toda
  assíncrona para facilitar a troca por um `supabase-store.js`.

## Estrutura
- `index.html` — página única.
- `css/` — `base.css` (cores, fontes, componentes), `shelf.css`,
  `room.css` (sala, cabeçalho da estante aberta, escolher livros),
  `wishlist.css` (lista de desejos),
  `add-book.css` (cadastro e chips de categoria), `detail.css` (página do
  livro, confirmações, editor de foto).
- `js/main.js` — inicialização, telas e rotas: `#/` (sala), `#/estante/<id>`
  (estante aberta), `#/livro/<id>` (página do livro por cima da tela
  atual). "Voltar" do navegador funciona em todas.
- `js/data/` — `db.js` (fachada) e `local-store.js` (implementação).
- `js/services/` — Open Library, cor da lombada, Spotify, Amazon.
  - `openlibrary.js`: busca (PT ou EN) sem pedir a lista de ISBNs (pode ter
    milhares); mostra o título da edição que bateu com a busca.
    `getEditions(workKey, lang)` usa a Query API (`/query.json`), que filtra
    o idioma no servidor — a lista comum `/editions.json` vem misturada e
    quase não traz edições em português. Capa, páginas e ISBN vêm da edição
    escolhida. `suggestCategories()` traduz assuntos para categorias em PT.
    Velocidade: todo pedido passa por `getJson()` — respostas guardadas na
    memória (repetir busca/edições é instantâneo) e, se a Open Library não
    responder em 4 s, o mesmo pedido é feito de novo e vale o que chegar
    primeiro. O cadastro pede a busca em duas versões ao mesmo tempo:
    `quick: true` (sem a edição que bateu, ~1 s mais rápida) aparece
    primeiro e a completa atualiza os mesmos itens. Passar o mouse/focar um
    resultado já busca as edições (`prefetchEditions`).
- `js/ui/` — estante, ordenação, FLIP, arrastar, página do livro, cadastro,
  lista de desejos, backup, diálogos.
  - `spine-color.js`: cor da lombada = cor dominante (baldes de cor, não
    média) da faixa esquerda da capa (2%–8% da largura). Se a "capa" for
    foto do livro sobre fundo claro (cantos claros e iguais), acha a borda
    do livro e ignora o fundo. Fila de uma capa por vez. O servidor de capas
    falha às vezes (e a resposta de erro vem sem CORS): a capa volta para a
    fila após 3 s (tentando a versão `-M`) e após 8 s; carga > 15 s = falha. Ao mudar a regra,
    aumente `SPINE_COLOR_VERSION`: `spineColorSource` ("v<n>:<capa>")
    faz as cores antigas serem refeitas. A cor escolhida à mão fica em
    `spineColorCustom` e tem prioridade (`spineColor()` em `shelf.js`).
  - `shelf-defs.js`: quais estantes existem. Automáticas (`AUTO_SHELVES`):
    Lendo agora (capas de frente), Favoritos, Todos os livros, Quero ler,
    Lidos — as vazias somem da sala, menos "Todos os livros". As criadas por
    ela ficam em `settings.shelves` (db.js: `addShelf`, `renameShelf`,
    `deleteShelf`, `setShelfBooks`, `setBookShelves`); um livro pode estar
    em várias (como playlists) e `bookIds` guarda a ordem da arrumação.
  - `room.js`: a sala — miniaturas das estantes (plaquinha, prévia das
    lombadas ou mini capas, contagem) + cartão "Nova estante". As
    lombadinhas copiam a lombada grande em escala 0,3: volume, trama, o
    mesmo acabamento (`spineFinish()` em shelf.js), risquinhos de título e
    autor, pontinho dourado nos favoritos. Estante cheia (>16): os 3 últimos
    ficam deitados numa pilha; não cheia: o último fica inclinado. Hover na
    miniatura: os livros sobem em onda. `fitNiche()` ajusta telas estreitas
    (pilha vira livros em pé, tira livros/capas do fim até caber). Abrir uma
    estante: a miniatura cresce até a estante grande (`growFrom`, FLIP, em
    `main.js`); voltar: o inverso.
  - `reading-shelf.js`: estante "Lendo agora" com a CAPA de frente,
    barrinha de progresso e "32% · pág. 152"; o mais recente primeiro. Em
    telas estreitas as capas encolhem para caberem 2.
  - `sort.js`: critérios ("personalizado", "cor", "titulo", "autor",
    "data", "categoria", "nota"). Cor = arco-íris pela matiz da `spineColor()` em
    faixas de 15°, do claro ao escuro em cada faixa; brancos/cinzas/pretos no
    fim. Título ignora artigos iniciais; autor pelo sobrenome; data = término
    (ou início) mais recente primeiro. Cada estante guarda o seu critério
    (`settings.shelfSort`, `db.getShelfSort/setShelfSort`); a "Lendo agora"
    tem ordem automática e não mostra o seletor (`canSort`).
  - Filtro por nota (estante aberta, em `main.js`): botões 5★…1★ e "sem
    nota", vários ao mesmo tempo; mostra "7 de 39 livros". Guardado só na
    memória (`ratingFilters`, por estante) — ao recarregar, tudo volta a
    aparecer. Usa `flipReorder` para fechar/abrir os espaços.
  - `search.js`: busca na sala (título, autor, categorias, nomes das
    estantes; ignora acentos). Resultado abre a página do livro saindo da
    capinha (a lista só fecha 400 ms depois, senão a animação perde o ponto
    de partida). Sem resultado: "+ Adicionar este livro" abre o cadastro já
    buscando o texto (`openAddBook(query)`).
  - `flip.js`: `flipReorder(elements, change)` — anima a reorganização
    (First/Last/Invert/Play): o livro sobe, flutua e se encaixa, em onda,
    total ~1 s (PER_BOOK 620 ms + atraso escalonado). Só `transform`;
    fora da tela não anima; trocar no meio parte da posição atual (cancela
    as animações em andamento); livros que reaparecem surgem suavemente.
    Testado: 300 livros a ~58 fps.
  - `drag.js`: arrastar e soltar (pointer events). Mouse: vira arraste
    após 6 px; toque: segurar 350 ms (mexer antes = rolagem). Cópia
    ("fantasma") segue o ponteiro; o original vira a "vaga"; os outros
    deslizam (FLIP curto de 200 ms); rolagem automática perto das bordas;
    Esc cancela; o clique depois de soltar é ignorado. Usa posições sem a
    animação (`cacheLayout`) e ignora o ponteiro sobre a própria vaga para
    não tremer. Em `main.js`: `adoptCurrentOrder()` (arrastar em outra ordem
    vira "Personalizado" partindo da ordem da tela; nas automáticas só os
    lugares dos livros daquela estante são reordenados) e `saveMove()`
    (encaixa entre os mesmos vizinhos visíveis — funciona com filtro de
    nota). A estante não é redesenhada no meio de um arraste.
  - Lista de desejos: livros com `location: "desejos"` (não aparecem nas
    estantes). Na sala é um cartão próprio (papel com fita, `room.js`);
    abre como a "estante" especial `#/estante/desejos` (`WISHLIST` e
    `wishlistBooks()` em shelf-defs.js). `wishlist.js` desenha os cartões
    (reaproveitados, para o campo de preço não perder o foco): capa, link
    "Ver na Amazon UK" (`services/amazon.js`: título+autor, só um link —
    nunca consultar a Amazon; o ISBN da Open Library costuma ser de edição
    que a Amazon UK não vende, e a busca por ele voltava vazia), preço visto (£) + data (hoje ao
    preencher o preço), "Comprei!" (pergunta Físico/Kindle com
    `chooseDialog`, a capa voa até "← Sala" e o livro vira "quero ler" na
    estante) e "remover" (com confirmação). No cadastro: "Guardar em:
    Estante / Lista de desejos" (`openAddBook(query, { destination })`).
    A busca da sala também acha desejos.
  - `backup.js` (botão "Backup" no topo): exportar tudo
    (`backup-biblioteca-AAAA-MM-DD.json`, de `db.exportAll()`), importar
    backup (valida `app: "minha-biblioteca"`, mostra resumo, confirma) e
    importar do Goodreads ("Juntar" pula repetidos por ISBN ou
    título+autor; "Substituir" confirma). Antes de substituir, baixa
    sozinho `…-antes-de-substituir.json`. Importação busca capa/categorias
    na Open Library (`findBook()`: ISBN, depois título+autor; 4 por vez,
    com barra de progresso; ~90% acham capa). `db.addBooks()` grava vários
    livros de uma vez; `importAll`/`addBooks` só mudam a memória depois de
    salvar (erro de espaço = nada muda).
  - `services/goodreads.js`: lê a planilha oficial (`.csv`, com estantes e
    resenhas) ou a página da lista salva pelo navegador
    (`/review/list/<id>?print=true`, para a lista de um amigo; várias
    páginas, sem repetir). A página não traz estantes: status deduzido
    (começou sem terminar = lendo; leu ou deu nota = lido; senão quero
    ler). Tira subtítulo (": …") e série; "Sobrenome, Nome" vira "Nome
    Sobrenome"; Kindle/ebook = formato kindle. O feed RSS do Goodreads não
    funciona mais (404) e a lista pede login — não tentar buscar online.
  - `shelf-books-picker.js`: lista com caixinhas para escolher os livros de
    uma estante dela: busca sem acentos (título, autor, categoria), filtros
    por status, categoria e nota, "Só os marcados", e "Marcar/Desmarcar
    todos" que valem só para os livros visíveis no filtro.
  - `findPlace(id)` em `main.js` acha o livro na estante aberta (capa ou
    lombada); usado pelas animações de abrir/fechar e de chegada.
  - `book-detail.js`: página do livro (um `<dialog>` em tela cheia).
    Abre com o livro saindo da prateleira, girando (rotateY) e virando capa;
    fecha pelo caminho inverso. Rotas: `#/livro/<id>` (tratadas em
    `main.js`; "voltar" do navegador fecha). Tudo salva na hora. Animações
    usam `done()` (tempo máximo) e um pedido de fechar durante a abertura é
    guardado e executado depois — não remover essas proteções.
  - `quotes.js`: trechos favoritos na página do livro, num carrossel (um
    por vez; setas, bolinhas, arrastar com o dedo via pointer events, setas
    do teclado; do último volta ao primeiro; altura acompanha o trecho via
    ResizeObserver). Em ordem de página, editar no lugar, apagar sempre com
    `confirmDialog`; trecho novo faz o carrossel ir até ele. Quebras de linha
    são mantidas (`white-space: pre-line`). Botão "📷 Fotografar trecho":
    recorta a foto e lê o texto (`services/ocr.js`); confiança < 45 não
    preenche nada, < 75 preenche com aviso para conferir.
  - `services/ocr.js`: Tesseract.js 6.0.1 (jsDelivr), carregado só no
    primeiro uso, português + inglês, modo de bloco único (PSM 6). Antes de
    ler: amplia, tons de cinza, desfoque leve, iguala a iluminação (divide
    pelo "papel" estimado) e contraste pelos percentis 1%/99% — sem isso,
    fotos com sombra e granulado viram lixo. `cleanText()` junta linhas do
    mesmo parágrafo e palavras com hífen no fim da linha.
  - `photo-crop.js`: editor de recorte genérico (`pickAndCrop`), usado pela
    foto da lombada e pela foto de trecho.
  - `playlist.js` + `services/spotify.js`: cola link do Spotify (playlist,
    álbum, música; aceita `intl-pt`, `?si=`, `spotify:` e `embed/`), guarda
    o link "limpo" em `spotifyUrl` e mostra o player embutido. Links curtos
    (`spotify.link`) não dão para resolver: mostra como copiar o completo.
    O player é desligado ao fechar a página do livro (`playlist.stop()`).
  - `spine-photo.js`: usa `pickAndCrop`; gira sozinho se a lombada estiver
    deitada, reduz para 360px de
    altura em JPEG (~10–20 KB, data URL em `spinePhoto`).
  - `dialogs.js`: `confirmDialog()`, `alertDialog()`, `promptDialog()`
    (pede um texto, com validação) e `chooseDialog()` (várias respostas)
    no visual do site.
    Use sempre `confirmDialog({ danger: true })` antes de apagar dados.
  - `cover-image.js`: `setCoverImage(img, url, { onFail })` — use SEMPRE
    para mostrar capas. Tenta de novo após 1,5 s e 4 s (o servidor de capas
    falha por alguns segundos às vezes), esconde o ícone de imagem quebrada
    e pede no modo CORS (senão o navegador guarda uma cópia sem permissão
    de leitura e a extração da cor da lombada falha).
  - `fly-book.js`: ferramentas da animação de "livro voando" (`done()`
    com tempo máximo, `px`, `lerp`, faces de capa/lombada) e
    `flyIntoShelf()`: livro novo voa da janela de cadastro até a estante
    aberta e vira lombada. Na sala, uma CÓPIA voa para cada estante a que o
    livro pertence (`shelvesContaining()` em shelf-defs.js: automáticas que
    combinam + estantes dela), com 120 ms entre as cópias; cada miniatura
    brilha (`flyIntoCard`, que procura o alvo de novo no fim do voo porque a
    sala pode ter sido redesenhada). Numa estante aberta em que o livro não
    entra, ele voa até o botão "← Sala". Evento `livro:adicionado`, tratado
    em `main.js`. Livro cadastrado de dentro de uma estante dela entra
    também nessa estante (somada às escolhidas).
  - `add-book.js`: cadastro em 3 passos (buscar → edição → revisar).
    Status "Lido" mostra nota e "Terminei em" (hoje) e salva progresso 100%.
    Campo "Estantes" (chips) escolhe as estantes dela já no cadastro; nomes
    novos criam a estante ao guardar.
    `isSearchable()` (openlibrary.js) evita buscar só com palavras comuns
    ("the" dá 422, "of the" dá 500 na Open Library).
    ISBN e link da capa não aparecem para ela (o ISBN fica guardado no
    livro). Páginas só são digitáveis no cadastro manual.
  - `category-picker.js`: chips reutilizáveis — categorias (cadastro e
    página do livro) e estantes (seção "Estantes" na página do livro, que
    também cria estantes novas).
  - `favorite-star.js`: estrela que "estoura" com faíscas e `flyStar()`, a
    estrelinha que voa até um alvo.
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
  acabamentos fixos por livro (`data-estilo` 0–3: filetes, faixas escuras,
  filetes dourados, filete simples — **sem moldura em volta do título**, a
  dona não gostou). O texto é montado na horizontal e girado 90°; título
  centralizado, autor em maiúsculas no pé.
- **Regra: nada na lombada pode ser cortado** (sem "…"). `fitText()` em
  `js/ui/shelf.js` mede o texto (`measureText`), divide o título em até 3
  linhas equilibradas (cada linha vira um `<span>`) e escolhe a maior letra
  que cabe; o autor usa nome completo ou sobrenome e diminui a letra em vez
  de cortar.
- Hover na lombada: o livro sobe 14px, cresce 4,5% e a sombra aumenta
  ("puxar"). Usa as propriedades CSS `translate`/`scale`, deixando
  `transform` livre para as animações FLIP e de arrastar. (A versão com
  inclinação 3D pelo topo foi testada e descartada pela dona do projeto.)
- Fontes: Cormorant Garamond (títulos, lombadas, quotes) + Nunito Sans
  (interface).
- Cores definidas como variáveis em `:root` (`css/base.css` e `css/shelf.css`).

## Preview local
O macOS impede o servidor iniciado pelo preview de ler a pasta Documentos.
Por isso o servidor é ligado pelo terminal (`python3 servidor-local.py`
dentro da pasta) e o `.claude/launch.json` só se conecta a
`http://localhost:8080`.

## Formato de um livro
```
{ id, title, author, coverUrl, pages, isbn, categories: [], goodreadsId?,
  location: "estante" | "desejos",
  status: "quero ler" | "lendo" | "lido",
  format: "fisico" | "kindle",
  currentPage, progressLog: [{ date, page }], favorite,
  edition: { publisher, year, lang },
  startDate, endDate, rating, review,
  quotes: [{ id, text, page, createdAt }], spotifyUrl,
  spineColor, spineColorSource,     // cor automática (da capa)
  spineColorCustom,                 // cor escolhida à mão (prioridade)
  spinePhoto, spinePhotoAspect,     // foto da lombada (só livros físicos)
  wishPrice, wishPriceDate, createdAt, updatedAt }
```
Configurações (`settings`): `shelfSort` (critério por estante),
`customOrder` (lista de ids; arrumação das estantes automáticas), `categories` (criadas pela leitora), `shelves`
(estantes dela: `[{ id, name, bookIds, createdAt }]`).

Não existe fonte automática de fotos de lombada (Open Library e Google
Books só têm capas): por isso ela fotografa os próprios livros. Fotos
ocupam espaço no localStorage (~5 MB no total); se lotar, `local-store.js`
lança um erro claro e a página do livro mostra um aviso. No Supabase, as
fotos devem ir para o Storage.

`progressLog` ganha uma entrada a cada atualização de página; a página do
livro usa isso para mostrar % que falta, páginas que faltam e páginas lidas
desde a última atualização. Ao abrir o banco, `db.init()` completa livros
antigos com os campos novos (`withDefaults`). Excluir um livro também o tira
de todas as estantes. Apagar uma estante nunca apaga livros. Favoritos têm
estrelinha dourada na lombada em qualquer estante.

As etapas 7 (ordenação) e 8 (arrastar) funcionam dentro da estante aberta:
cada estante dela tem sua própria ordem (`bookIds`); as automáticas usam
`customOrder`.
