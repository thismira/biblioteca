# Minha Biblioteca

Uma estante virtual para guardar livros lidos, em leitura e desejados.

## Como abrir no computador

Os arquivos JavaScript usam módulos, que o navegador só carrega a partir de um
servidor. Dentro da pasta do projeto, rode:

```bash
python3 -m http.server 8080
```

e abra <http://localhost:8080>.

## Onde ficam os dados

Os livros ficam salvos no próprio navegador (localStorage). Use os botões de
**Backup** para exportar um arquivo `.json` de vez em quando.
