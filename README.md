# Noite do Horror: ingressos

Venda de ingressos com pagamento pela InfinitePay, entrega por QR Code e
validação na portaria. Não tem servidor: o site fica no GitHub Pages e o
backend é um Google Apps Script que usa uma planilha como banco de dados.

> Primeira vez aqui? Leia o **[RELATORIO-DE-ENTREGA.md](RELATORIO-DE-ENTREGA.md)**:
> o que mudou, por quê, e o passo a passo completo pra publicar.

| Página | Endereço | Pra quem |
|---|---|---|
| Vendas | `/vendas/` | público |
| Meus ingressos | `/ingresso/` | comprador (a InfinitePay manda pra cá depois do pagamento) |
| Portaria | `/` | equipe da entrada (pede a chave da portaria) |

## Como funciona

```
 Comprador                  GitHub Pages            Apps Script                InfinitePay
     │  abre /vendas/            │                        │                          │
     │──────────────────────────►│  GET (preço, vagas)    │                          │
     │                           │───────────────────────►│                          │
     │  preenche e envia         │  POST criar_pedido     │                          │
     │──────────────────────────►│───────────────────────►│  POST /links             │
     │                           │                        │─────────────────────────►│
     │◄──────────── redireciona pro checkout ─────────────┤◄──── url do checkout ────│
     │                                                    │                          │
     │  paga (Pix/cartão) ───────────────────────────────────────────────────────────►│
     │                                                    │◄──── webhook ────────────│
     │◄─────────── volta pra /ingresso/?order_nsu=... ───────────────────────────────│
     │  POST confirmar_pagamento ────────────────────────►│  POST /payment_check     │
     │                                                    │─────────────────────────►│
     │                                                    │◄──── paid: true ─────────│
     │◄──────── ingressos (QR) na tela + e-mail ──────────│  grava na planilha       │
```

Pontos que valem saber:

- **O webhook da InfinitePay não é assinado.** Qualquer pessoa que descubra a
  URL do Apps Script consegue mandar um "paguei". Por isso o sistema nunca
  acredita no webhook: ele só serve de gatilho, e a confirmação vem de uma
  consulta ao `payment_check` da InfinitePay. A versão anterior aceitava o
  webhook como prova de pagamento.
- **Webhook e retorno do cliente fazem a mesma coisa.** O que chegar primeiro
  emite os ingressos; o outro só lê. Se o webhook falhar, o cliente ainda
  recebe o ingresso ao voltar pro site, e vice-versa.
- **Lotação controlada no backend.** Pedidos aguardando pagamento seguram a
  vaga por 30 minutos, pra não vender mais do que existe.
- **A portaria pede uma chave.** Sem ela, qualquer um com a URL podia marcar
  ingressos dos outros como "utilizado".
- **Tudo que é gravado na planilha é forçado como texto**, então um "nome"
  como `=IMPORTXML(...)` não vira fórmula.

## Estrutura

```
apps-script/          backend (copiar pro editor do Apps Script)
  Config.gs           preço, capacidade, links: o que muda por evento
  Http.gs             doGet/doPost e roteamento
  Pedidos.gs          criação e confirmação de pedidos
  Ingressos.gs        emissão e validação na portaria
  Pagamentos.gs       integração com a InfinitePay
  Email.gs            e-mail com os ingressos
  Planilha.gs         colunas e leitura/gravação na planilha
  Validacoes.gs       CPF, telefone, e-mail
  Util.gs             utilitários (trava, aleatoriedade segura...)
  Setup.gs            funções pra rodar à mão (configurar, trocar chave...)
  appsscript.json     manifesto (fuso, permissões, acesso do Web App)
assets/
  css/                estilos (base + um por página)
  js/                 config.js (URL do backend), api.js, formatacao.js, icones.js e um por página
index.html            portaria
vendas/index.html     vendas
ingresso/index.html   meus ingressos
tests/
  backend/            testes do Apps Script rodando num simulador do Google
  frontend/           testes das máscaras/validações do site
  e2e/                testes no navegador (Chromium) com o sistema inteiro
scripts/              geram os prints das telas e o PDF do relatório
docs/imagens/         prints usados no relatório
```

## Planilha

A aba **`listagem`** continua com as mesmas colunas de antes (A a H) e ganhou
três no fim. A aba **`pedidos`** é nova. As duas são criadas/completadas pelo
`configurarSistema()`; nada que já existe é apagado.

`listagem` (um ingresso por linha):

| id | nome | código | qr code | status | telefone | cpf | email | pedido | emitido em | utilizado em |
|---|---|---|---|---|---|---|---|---|---|---|

- `status`: `Pendente` (ainda não entrou), `Utilizado` ou `Cancelado`.
- Pra **cancelar** um ingresso, escreva `Cancelado` no status. Ele deixa de
  entrar e a vaga volta pra venda.
- Pra **cortesia**, crie uma linha à mão com nome, código (qualquer texto
  único) e status `Pendente`. A portaria aceita, e ela conta na lotação.

`pedidos` (uma compra por linha): order_nsu, situação, dados do comprador,
valor em centavos, dados da transação e quando o e-mail foi enviado.

## Publicando (passo a passo)

### 1. Backend (Apps Script)

1. Abra o projeto do Apps Script que já recebe as vendas (o da URL
   `AKfycbykpw...`).
2. Apague o código antigo e crie um arquivo pra cada `.gs` da pasta
   `apps-script/`, com o mesmo nome e conteúdo. A ordem dos arquivos não importa.
3. Em *Configurações do projeto*, marque "Mostrar o arquivo de manifesto
   appsscript.json" e cole o conteúdo do `appsscript.json`.
4. Confira o `Config.gs`, principalmente **`PRECO_CENTAVOS`** (está em `100`,
   R$ 1,00, preço de teste) e **`CAPACIDADE`**.
5. Selecione a função **`configurarSistema`** e clique em *Executar*. Na
   primeira vez o Google pede autorização (planilha, chamadas externas, envio
   de e-mail). No log aparece a **chave da portaria**: anote e passe só pra
   equipe da entrada.
6. *Implantar > Gerenciar implantações* > lápis na implantação atual >
   *Versão: Nova versão* > *Implantar*. Editando a implantação existente, a URL
   continua a mesma. Se criar uma implantação nova, a URL muda e é preciso
   atualizar `URL_WEBHOOK` no `Config.gs` e `URL_API` em `assets/js/config.js`.

> Alterou qualquer `.gs`? Repita o passo 6. O Apps Script só usa o código
> novo depois de publicar uma nova versão.

O validador antigo usava **outro** projeto de Apps Script (URL
`AKfycby15Iu1...`). Ele não é mais usado: a validação agora está neste
mesmo backend.

### 2. Site (GitHub Pages)

Faça push na branch publicada. Se a URL do Apps Script mudou, atualize
`assets/js/config.js` antes.

### 3. Teste de verdade, antes de divulgar

1. Compre 1 ingresso com o preço de teste e pague.
2. Confira: voltou pra página com o QR, chegou o e-mail, apareceu a linha na
   `listagem` e o pedido ficou `PAGO`.
3. Valide o QR na portaria (verde) e de novo (amarelo, "já utilizado").
4. Coloque o status de volta em `Pendente` ou apague a linha.
5. Ajuste o `PRECO_CENTAVOS` pro valor real e publique nova versão (passo 6).

## No dia do evento

- Abra a portaria no celular, digite a chave uma vez (o aparelho lembra) e
  toque em *Ativar câmera*. Precisa ser `https` (o GitHub Pages já é).
- Verde: entra. Amarelo: esse QR já entrou (mostra o horário). Vermelho:
  código inexistente ou cancelado.
- Vários celulares podem validar ao mesmo tempo; o mesmo QR nunca passa duas vezes.
- Se a chave vazar: rode `gerarNovaChavePortaria()` no Apps Script. Quem
  estiver logado é mandado de volta pra tela de chave.
- Sem câmera ou QR danificado: digite o código de 8 letras embaixo do QR.

### Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Cliente pagou e não recebeu nada | Procure o pedido na aba `pedidos`. Se estiver `AGUARDANDO_PAGAMENTO`, peça o link que ele recebeu ao voltar do checkout ou o comprovante e confira na InfinitePay. Os detalhes de cada chamada ficam em *Execuções*, no Apps Script. |
| E-mail não chegou | Coluna "e-mail enviado em" vazia = falhou (geralmente cota). Rode `reenviarEmailDoPedido()` depois de colocar o order_nsu nela. |
| "Erro interno" no site | Veja *Execuções* no Apps Script: a mensagem real fica no log, não na tela. |
| Site mostra "Sem conexão com o servidor" | URL em `assets/js/config.js` errada ou implantação sem acesso "Qualquer pessoa". |

## Desenvolvimento

**Requisitos:** só o Node.js 20 ou mais novo. Não tem Python no projeto,
então não existe `requirements.txt`; as dependências (só de desenvolvimento)
ficam no `package.json` e são instaladas com `npm install`. Pra publicar o
sistema não é preciso instalar nada.

```bash
npm install
npx playwright install chromium   # só na primeira vez, pros testes de navegador

npm test            # backend + validações do site (~1 s)
npm run test:e2e    # navegador de verdade, fluxo completo (~20 s)
npm run servir      # abre o site em http://localhost:8080 usando o backend real
npm run telas       # refaz os prints de docs/imagens/
npm run relatorio   # gera o RELATORIO-DE-ENTREGA.pdf a partir do .md (precisa de internet)
```

O que os testes cobrem:

- **Backend** (`tests/backend/`): os arquivos `.gs` de verdade, carregados
  num simulador de planilha/UrlFetch/Lock/Mail que imita o Google, inclusive
  o comportamento de fórmula e conversão de número das células. Inclui os
  cenários de ataque: webhook forjado, valor adulterado, chave errada,
  injeção de fórmula, ver ingresso alheio com o order_nsu.
- **Frontend** (`tests/frontend/`): máscaras simulando digitação e uma
  checagem de que as validações do site e do backend dão o mesmo resultado.
- **Ponta a ponta** (`tests/e2e/`): as páginas abertas no Chromium em tamanho
  de celular. As chamadas ao Apps Script são respondidas pelo próprio código
  `.gs` rodando no simulador; só a InfinitePay e o Google são de mentira.

O GitHub Actions (`.github/workflows/testes.yml`) roda tudo a cada push.

O que **não** dá pra testar localmente: a câmera lendo QR e as chamadas
reais à InfinitePay e ao Gmail. Por isso o teste com pagamento real antes de
divulgar.

## Limites conhecidos

- **Apps Script sempre responde HTTP 200**, mesmo em erro. A InfinitePay
  re-tenta webhooks quando recebe 400; como não dá pra mandar 400, um webhook
  recusado não é re-tentado. Na prática isso não prejudica ninguém, porque o
  cliente também confirma ao voltar pro site.
- **Cota de e-mail**: ~100/dia em conta Gmail comum, ~1500 no Workspace.
- **Planilha como banco**: confortável até alguns milhares de linhas. Pra uma
  festa, sobra.
- **QR Code na planilha e no e-mail** é gerado pelo quickchart.io (serviço
  externo, recebe o código). Na página `/ingresso/` o QR é gerado no próprio
  navegador.
- **LGPD**: a planilha guarda CPF, telefone e e-mail. Compartilhe só com
  quem precisa e apague depois do evento.
