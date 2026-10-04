/**
 * Servidor estático mínimo, imitando o GitHub Pages:
 * serve os arquivos do repositório e resolve "pasta/" para "pasta/index.html".
 *
 * Uso direto: `npm run servir` e abra http://localhost:8080
 * (as páginas vão falar com o Apps Script de verdade configurado em config.js).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * @param {number} [porta] 0 = qualquer porta livre
 * @return {Promise<{url: string, fechar: () => Promise<void>}>}
 */
export function iniciarServidor(porta = 0) {
  const servidor = http.createServer((req, res) => {
    const caminhoUrl = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let arquivo = path.normalize(path.join(RAIZ, caminhoUrl));

    // Bloqueia "../" pra fora do repositório.
    if (!arquivo.startsWith(path.normalize(RAIZ))) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(arquivo) && fs.statSync(arquivo).isDirectory()) {
      arquivo = path.join(arquivo, 'index.html');
    }
    if (!fs.existsSync(arquivo) || /node_modules|\.git/.test(arquivo)) {
      res.writeHead(404).end('404');
      return;
    }

    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
    fs.createReadStream(arquivo).pipe(res);
  });

  return new Promise((resolve) => {
    servidor.listen(porta, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${servidor.address().port}/`,
        fechar: () => new Promise((r) => servidor.close(() => r())),
      });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  iniciarServidor(8080).then(({ url }) => console.log('Servindo em ' + url));
}
