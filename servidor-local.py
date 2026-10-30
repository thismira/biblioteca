# Servidor para testar o site no computador.
# É o servidor simples do Python, mas avisa o navegador para NÃO guardar
# cópias antigas dos arquivos (assim cada mudança aparece ao recarregar).
#
# Uso, dentro da pasta do projeto:  python3 servidor-local.py
# Depois abra http://localhost:8080

import http.server
import os

PORT = 8080


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler) as server:
        print(f"Servindo em http://localhost:{PORT} (Ctrl+C para parar)")
        server.serve_forever()
