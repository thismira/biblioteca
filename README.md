# M’s Library

Uma biblioteca virtual: estantes com as lombadas dos livros, página de cada
livro (status, progresso, nota, resenha, trechos, playlist), ordenação com
animação, arrumação personalizada, lista de desejos e backup.

E um **escritório** (botão "Go to workspace") para ela escrever as próprias
histórias: cadernos na mesa, capítulos, editor no jeito do Google Docs,
personagens (capa, álbum, traits, quotes, playlist, frases das músicas),
worldbuilding, playlist e best quotes de cada história.

Site estático (HTML, CSS e JavaScript puros), sem build e sem servidor
próprio — funciona no GitHub Pages.

## Como abrir no computador

Os arquivos JavaScript usam módulos, que o navegador só carrega a partir de um
servidor. Dentro da pasta do projeto, rode:

```bash
python3 servidor-local.py
```

e abra <http://localhost:8080>. Esse servidor avisa o navegador para não
guardar cópias antigas, então cada mudança aparece ao recarregar a página.
No celular (mesmo Wi-Fi), use `http://<IP do Mac>:8080`.

## Onde ficam os dados

Tudo fica na nuvem (**Supabase**), na conta dela, com login por e-mail e
senha: aparece igual em qualquer aparelho em que ela entrar. Nada de dados
dela fica no GitHub.

- Livros e configurações: tabelas `books` e `settings` (`supabase/schema.sql`).
- Escritório: tabelas `stories` e `chapters` e as fotos no Storage (pasta
  privada `escritorio`) — `supabase/schema-escritorio.sql`.

Em **Conta e backup**:

- **Exportar backup** baixa um arquivo `.json` com os livros, as estantes e as
  histórias (com o texto de todos os capítulos; as fotos ficam na nuvem).
- **Importar backup** restaura esse arquivo (pede confirmação e baixa antes
  uma cópia do que existe). Histórias que não existem mais voltam; as que
  existem não são tocadas.
- **Importar do Goodreads** lê a planilha `.csv` do Goodreads ou as páginas
  da lista de livros salvas pelo navegador.

Guarde um backup de vez em quando, como segurança extra.

## Escritório (as histórias dela)

- **Trazer do Google Docs** (na mesa): no Google Docs, *Arquivo → Fazer
  download → Microsoft Word (.docx)*; depois escolha o arquivo. Ele é lido no
  próprio navegador (não é enviado a lugar nenhum) e aparece uma prévia para
  escolher o que entra e como dividir em histórias e capítulos.
- **Editor**: salva sozinho; sem internet, guarda o texto no aparelho e envia
  quando a conexão volta. Se outro aparelho salvar o mesmo capítulo ao mesmo
  tempo, nada é perdido: a versão de um deles vira um capítulo "(cópia deste
  aparelho)".
- **Baixar história**: na página da história, gera um arquivo Word com todos
  os capítulos.

## Publicar no GitHub Pages

O jeito mais simples, sem terminal, é com o app **GitHub Desktop**:

1. Crie uma conta em <https://github.com> (grátis) e instale o
   [GitHub Desktop](https://desktop.github.com). Entre com a conta no app.
2. No GitHub Desktop: **File → Add Local Repository…** e escolha esta pasta
   (`Mylibrary`).
3. Clique em **Publish repository**. Escolha um nome (ex.: `biblioteca`) e
   **desmarque "Keep this code private"** — o GitHub Pages grátis precisa de
   repositório público. (Só o código fica público; os livros dela não estão
   nos arquivos, ficam no navegador.)
4. No site do GitHub, abra o repositório → **Settings → Pages**. Em
   "Build and deployment", escolha **Deploy from a branch**, branch
   **main**, pasta **/ (root)**, e clique em **Save**.
5. Em 1–2 minutos o endereço aparece no topo dessa página, algo como
   `https://<seu-usuario>.github.io/biblioteca/`.

Para atualizar o site depois de uma mudança: no GitHub Desktop, **Push
origin**. O GitHub Pages republica sozinho em 1–2 minutos.

Observação: os commits mostram o nome e o e-mail configurados no Git. Se não
quiser o e-mail público, use o e-mail "noreply" do GitHub (Settings → Emails
no site do GitHub).

### Primeiro acesso dela

1. No celular, abra o endereço do site e entre com o e-mail e a senha da
   conta dela (criada no painel do Supabase).
2. Dica: no Safari, **Compartilhar → Adicionar à Tela de Início** deixa o
   site com ícone, como um app.
