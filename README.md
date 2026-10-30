# Minha Biblioteca

Uma estante virtual para guardar livros lidos, em leitura e desejados.

## Como abrir no computador

Os arquivos JavaScript usam módulos, que o navegador só carrega a partir de um
servidor. Dentro da pasta do projeto, rode:

```bash
python3 servidor-local.py
```

e abra <http://localhost:8080>. Esse servidor avisa o navegador para não
guardar cópias antigas, então cada mudança aparece ao recarregar a página.

## Onde ficam os dados

Os livros ficam salvos no próprio navegador (localStorage). Use os botões de
**Backup** para exportar um arquivo `.json` de vez em quando.
