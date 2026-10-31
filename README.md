# M’s Library

Uma biblioteca virtual: estantes com as lombadas dos livros, página de cada
livro (status, progresso, nota, resenha, trechos, playlist), ordenação com
animação, arrumação personalizada, lista de desejos e backup.

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

Os livros ficam salvos **no navegador de quem usa o site** (localStorage) —
não no GitHub. Cada navegador/aparelho tem a sua própria biblioteca.

- **Backup → Exportar backup** baixa um arquivo `.json` com tudo.
- **Backup → Importar backup** restaura esse arquivo (pede confirmação e
  baixa antes uma cópia do que existe).
- **Backup → Importar do Goodreads** lê a planilha `.csv` do Goodreads ou as
  páginas da lista de livros salvas pelo navegador.

Para levar a biblioteca para outro aparelho: exporte num, importe no outro.
Guarde um backup de vez em quando — limpar os dados do navegador apaga os
livros.

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

1. Aqui no computador: **Backup → Exportar backup**.
2. Mande o arquivo `.json` para o celular dela (AirDrop, WhatsApp, e-mail…).
3. No celular, abra o endereço do site → **Backup → Importar backup** e
   escolha o arquivo.
4. Dica: no Safari, **Compartilhar → Adicionar à Tela de Início** deixa o
   site com ícone, como um app.
