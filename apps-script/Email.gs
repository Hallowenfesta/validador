/**
 * E-mail de confirmação com os ingressos.
 *
 * Atenção à cota do MailApp: contas Gmail comuns mandam ~100 e-mails por
 * dia; Google Workspace, ~1500. Pra uma festa de 30 pessoas sobra.
 */

/**
 * @param {Object} pedido
 * @param {Array<{codigo: string}>} ingressos
 */
function enviarIngressosPorEmail_(pedido, ingressos) {
  const linkIngressos = CONFIG.URL_SITE + 'ingresso/?pedido=' +
    encodeURIComponent(pedido.orderNsu) + '&token=' + encodeURIComponent(pedido.token);

  // Estilos inline porque Gmail, Outlook e afins ignoram <style> e CSS externo.
  // Visual no mesmo padrão da página /ingresso/: um "passe" por ingresso.
  const fonte = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
  const primeiroNome = pedido.nome.split(' ')[0];

  const passes = ingressos.map(function (ingresso, i) {
    return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
        'style="margin:0 0 20px;border-radius:20px;overflow:hidden;background:#1c1822;border:1px solid #2c2534">' +
        '<tr><td style="padding:16px 22px;background:#ff6a1a;color:#1d0e04;font-family:' + fonte + '">' +
          '<span style="font-size:17px;font-weight:700">' + escaparHtml_(CONFIG.EVENTO.NOME) + '</span>' +
          '<span style="float:right;font-size:12px;font-weight:600;letter-spacing:1px;opacity:.75;line-height:24px">' +
            (i + 1) + ' DE ' + ingressos.length + '</span>' +
        '</td></tr>' +
        '<tr><td style="padding:16px 22px 0;font-family:' + fonte + '">' +
          '<div style="font-size:11px;font-weight:600;letter-spacing:1px;color:#8a8392">TITULAR</div>' +
          '<div style="font-size:17px;font-weight:600;color:#f5f2ee">' + escaparHtml_(pedido.nome) + '</div>' +
        '</td></tr>' +
        '<tr><td style="padding:22px;text-align:center;font-family:' + fonte + '">' +
          '<div style="display:inline-block;padding:12px;background:#ffffff;border-radius:14px">' +
            '<img src="' + escaparHtml_(urlQrCode_(ingresso.codigo, 440)) + '" width="220" height="220" ' +
              'alt="QR Code do ingresso" style="display:block">' +
          '</div>' +
          '<div style="margin-top:14px;font-family:Menlo,Consolas,monospace;font-size:24px;font-weight:600;' +
            'letter-spacing:6px;color:#f5f2ee">' + escaparHtml_(ingresso.codigo) + '</div>' +
        '</td></tr>' +
      '</table>'
    );
  }).join('');

  const html =
    '<div style="margin:0;padding:32px 16px;background:#0b090e;font-family:' + fonte + '">' +
      '<div style="max-width:440px;margin:0 auto">' +
        '<p style="margin:0 0 6px;text-align:center;font-size:12px;font-weight:600;letter-spacing:2px;color:#ff6a1a">' +
          'SEUS INGRESSOS</p>' +
        '<h1 style="margin:0 0 8px;text-align:center;font-size:30px;font-weight:700;letter-spacing:-0.5px;color:#f5f2ee">' +
          escaparHtml_(CONFIG.EVENTO.NOME) + '</h1>' +
        '<p style="margin:0 0 28px;text-align:center;font-size:16px;color:#a79fb0">' +
          'Tudo certo, ' + escaparHtml_(primeiroNome) + '. Seu pagamento foi confirmado.</p>' +
        passes +
        '<p style="margin:8px 0 24px;text-align:center">' +
          '<a href="' + escaparHtml_(linkIngressos) + '" style="display:inline-block;padding:14px 26px;' +
            'border-radius:13px;background:#ff6a1a;color:#1d0e04;font-weight:600;font-size:16px;text-decoration:none">' +
            'Ver meus ingressos</a>' +
        '</p>' +
        '<p style="margin:0 0 6px;text-align:center;font-size:13px;line-height:1.5;color:#8a8392">' +
          'Mostre o QR Code na entrada. Cada ingresso vale para uma pessoa e funciona uma única vez. ' +
          'Não compartilhe este e-mail: quem tiver o código entra no seu lugar.</p>' +
        '<p style="margin:0;text-align:center;font-size:12px;color:#5f5866">Pedido ' +
          escaparHtml_(pedido.orderNsu) + '</p>' +
      '</div>' +
    '</div>';

  // Versão em texto puro pra clientes de e-mail que bloqueiam HTML/imagens.
  const texto =
    CONFIG.EVENTO.NOME + '\n\n' +
    'Pagamento confirmado. Seus códigos:\n' +
    ingressos.map(function (i) { return '  ' + i.codigo; }).join('\n') + '\n\n' +
    'Ver ingressos: ' + linkIngressos;

  MailApp.sendEmail({
    to: pedido.email,
    subject: 'Seus ingressos - ' + CONFIG.EVENTO.NOME,
    body: texto,
    htmlBody: html,
    name: CONFIG.REMETENTE_EMAIL,
  });
}
