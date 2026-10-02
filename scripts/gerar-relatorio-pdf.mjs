/**
 * Gera o RELATORIO-DE-ENTREGA.pdf a partir do RELATORIO-DE-ENTREGA.md.
 *
 * O Markdown continua sendo a fonte (é o que aparece bonito no GitHub);
 * este script só monta um HTML com layout de impressão (capa, diagramas,
 * código colorido, prints) e imprime em PDF pelo Chromium do Playwright.
 *
 * Uso:  npm run relatorio
 * Precisa de internet: o Mermaid (diagramas) e o highlight.js (cores do
 * código) são carregados de CDN no momento da geração.
 */

import { Marked } from 'marked';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const ENTRADA = path.join(RAIZ, 'RELATORIO-DE-ENTREGA.md');
const SAIDA = path.join(RAIZ, 'RELATORIO-DE-ENTREGA.pdf');

const escapar = (t) => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Mesmo algoritmo de âncora do GitHub ("2.1 Webhook: grátis" -> "21-webhook-grátis"),
 * pra que os links do sumário funcionem igual no GitHub e no PDF.
 */
const ancora = (texto) => texto
  .toLowerCase()
  .replace(/<[^>]+>/g, '')
  .replace(/[^\p{L}\p{N}\s_-]/gu, '')
  .trim()
  .replace(/\s/g, '-');

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth, text }) {
      return `<h${depth} id="${ancora(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    code({ text, lang }) {
      if (lang === 'mermaid') return `<pre class="mermaid">${escapar(text)}</pre>\n`;
      const classe = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${classe}>${escapar(text)}</code></pre>\n`;
    },
    link({ href, tokens }) {
      const conteudo = this.parser.parseInline(tokens);
      // Links pra arquivos do repositório não servem no PDF: vira texto.
      if (!/^(https?:|#|mailto:)/.test(href)) return `<span class="arquivo">${conteudo}</span>`;
      return `<a href="${escapar(href)}">${conteudo}</a>`;
    },
  },
});

let markdown = fs.readFileSync(ENTRADA, 'utf8');

// O título do Markdown vira a capa; o restante entra no corpo.
const titulo = markdown.match(/^# (.+)$/m)[1];
markdown = markdown.replace(/^# .+$/m, '');

const corpo = marked.parse(markdown);
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const [tituloPrincipal, tituloSecundario] = titulo.split(':').map((t) => t.trim());

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<base href="${pathToFileURL(RAIZ).href}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
<style>
  @page { size: A4; margin: 20mm 18mm 22mm; }
  @page :first { margin: 0; }

  :root {
    --laranja: #ff6a1a;
    --laranja-escuro: #d9530c;
    --texto: #1d1d1f;
    --texto-2: #515154;
    --texto-3: #86868b;
    --linha: #e5e5ea;
    --fundo-suave: #f5f5f7;
  }

  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    font-family: -apple-system, 'Inter', 'Segoe UI', sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    color: var(--texto);
    letter-spacing: -0.005em;
  }

  /* ---------- Capa ---------- */
  .capa {
    height: 297mm;
    padding: 34mm 22mm 24mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #f5f2ee;
    background:
      radial-gradient(120% 70% at 50% -10%, rgba(255, 106, 26, 0.35), transparent 60%),
      radial-gradient(80% 50% at 100% 100%, rgba(120, 60, 160, 0.22), transparent 70%),
      #0b090e;
    page-break-after: always;
  }
  .capa .sobretitulo {
    color: var(--laranja);
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .capa h1 {
    margin: 14px 0 10px;
    font-size: 40pt;
    line-height: 1.04;
    font-weight: 800;
    letter-spacing: -0.035em;
  }
  .capa .subtitulo { margin: 0; font-size: 15pt; color: rgba(245, 242, 238, 0.7); }
  .capa .telas {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
    margin: 26px 0;
  }
  /* Os prints são de página inteira (bem altos): recorta mostrando o topo. */
  .capa .telas img {
    width: 30%;
    height: 118mm;
    object-fit: cover;
    object-position: top;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.8);
  }
  .capa .telas img:nth-child(2) { width: 33%; height: 130mm; transform: translateY(-10px); }
  .capa .rodape {
    display: flex;
    justify-content: space-between;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(245, 242, 238, 0.55);
    font-size: 9.5pt;
  }

  /* ---------- Tipografia ---------- */
  h2 {
    page-break-before: always;
    margin: 0 0 18px;
    padding-bottom: 10px;
    font-size: 21pt;
    font-weight: 700;
    letter-spacing: -0.025em;
    border-bottom: 3px solid var(--laranja);
  }
  h3 {
    margin: 26px 0 8px;
    font-size: 13.5pt;
    font-weight: 650;
    letter-spacing: -0.015em;
    page-break-after: avoid;
  }
  h4 { margin: 18px 0 6px; font-size: 11pt; page-break-after: avoid; }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 12px; padding-left: 22px; }
  li { margin-bottom: 4px; }
  li > input[type="checkbox"] { margin-right: 6px; }
  strong { font-weight: 650; }
  a { color: var(--laranja-escuro); text-decoration: none; }
  hr { display: none; }

  /* Sumário e Resumo dividem a página 2: o resumo começa logo abaixo. */
  h2#sumário { page-break-before: avoid; }
  /* Id começando com número não vale como seletor #id; por isso o [id=...]. */
  h2[id='1-resumo-em-uma-página'] { page-break-before: avoid; margin-top: 30px; }

  blockquote {
    margin: 12px 0;
    padding: 10px 14px;
    border-left: 3px solid var(--laranja);
    border-radius: 0 8px 8px 0;
    background: #fff4ec;
    color: var(--texto-2);
    page-break-inside: avoid;
  }
  blockquote p:last-child { margin: 0; }

  /* ---------- Código ---------- */
  code, .arquivo {
    font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace;
    font-size: 0.86em;
  }
  :not(pre) > code, .arquivo {
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--fundo-suave);
    color: #a33f06;
  }
  pre {
    margin: 10px 0 14px;
    padding: 12px 14px;
    border: 1px solid var(--linha);
    border-radius: 10px;
    background: #fafafa;
    font-size: 8.3pt;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    page-break-inside: avoid;
  }
  pre code.hljs { padding: 0; background: transparent; }

  /* ---------- Tabelas ---------- */
  table {
    width: 100%;
    margin: 10px 0 16px;
    border-collapse: collapse;
    font-size: 9.2pt;
  }
  th {
    padding: 7px 9px;
    text-align: left;
    font-weight: 650;
    background: var(--fundo-suave);
    border-bottom: 2px solid var(--linha);
  }
  td { padding: 6px 9px; border-bottom: 1px solid var(--linha); vertical-align: top; }
  tr { page-break-inside: avoid; }

  /* ---------- Galeria de prints ---------- */
  /* No Markdown a galeria é uma tabela de 2 colunas (é o que o GitHub
     aceita); no PDF ela vira uma grade de 3, pra caber mais por página. */
  /* inline-block: cada print é um bloco indivisível, nunca é cortado ao meio
     na quebra de página (com grid o Chromium às vezes fatia a imagem). */
  table.galeria, table.galeria tbody { display: block; }
  table.galeria tr { display: contents; }
  table.galeria tbody { text-align: center; font-size: 0; }
  table.galeria td {
    display: inline-block;
    width: 31%;
    margin: 0 1% 14px;
    padding: 0;
    border: none;
    vertical-align: top;
    text-align: center;
    break-inside: avoid;
  }
  table.galeria td:empty { display: none; }
  table.galeria img {
    width: 100%;
    height: 98mm;
    object-fit: cover;
    object-position: top;
    border-radius: 12px;
    border: 1px solid var(--linha);
  }
  /* A galeria abre página nova, junto com o título. */
  h3#as-telas { break-before: page; }
  table.galeria sub { display: block; margin-top: 6px; font-size: 8.5pt; color: var(--texto-2); }

  /* ---------- Diagramas ---------- */
  pre.mermaid {
    display: flex;
    justify-content: center;
    padding: 16px;
    background: #fff;
    white-space: normal;
  }
  pre.mermaid svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
  <section class="capa">
    <div class="sobretitulo">Relatório de entrega</div>
    <h1>${escapar(capitalizar(tituloSecundario || tituloPrincipal))}</h1>
    <p class="subtitulo">O que mudou, por que mudou e como colocar no ar.</p>
    <div class="telas">
      <img src="docs/imagens/01-vendas.png" alt="">
      <img src="docs/imagens/03-ingressos.png" alt="">
      <img src="docs/imagens/06-resultado-valido.png" alt="">
    </div>
    <div class="rodape">
      <span>Venda e validação de ingressos · Apps Script + InfinitePay</span>
      <span>${escapar(hoje)}</span>
    </div>
  </section>
  ${corpo}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
  <script>
    hljs.highlightAll();
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      fontFamily: 'Inter, sans-serif',
      themeVariables: {
        primaryColor: '#fff1e8',
        primaryBorderColor: '#ff6a1a',
        primaryTextColor: '#1d1d1f',
        lineColor: '#86868b',
        secondaryColor: '#f5f5f7',
        tertiaryColor: '#ffffff',
        actorBkg: '#fff1e8',
        actorBorder: '#ff6a1a',
        noteBkgColor: '#f5f5f7',
      },
    });
    // Espera as fontes: o Mermaid mede o texto pra dimensionar as caixas,
    // e se medir com a fonte reserva os rótulos saem cortados.
    document.fonts.ready
      .then(() => mermaid.run())
      .then(() => { window.pronto = true; });
  </script>
</body>
</html>`;

// O HTML vai pra pasta temporária; o <base> aponta pras imagens do repositório.
const arquivoHtml = path.join(os.tmpdir(), 'relatorio-ingressos.html');
fs.writeFileSync(arquivoHtml, html);

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage();
  await pagina.goto(pathToFileURL(arquivoHtml).href, { waitUntil: 'networkidle' });
  await pagina.waitForFunction(() => window.pronto === true, null, { timeout: 30000 });
  await pagina.evaluate(() => document.fonts.ready);

  await pagina.pdf({
    path: SAIDA,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%;padding:0 18mm;font-family:Inter,sans-serif;font-size:7.5pt;color:#86868b;
                  display:flex;justify-content:space-between">
        <span>Noite do Horror · Relatório de entrega</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
  });
  console.log('PDF gerado: ' + SAIDA);
} finally {
  await navegador.close();
}
