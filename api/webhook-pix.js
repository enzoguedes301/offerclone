// POST /api/webhook-pix
// Endpoint que o PixGate chama quando o status muda (campo `postback`).
//
// IMPORTANTE: a documentação do PixGate não define assinatura/HMAC nos
// callbacks. Qualquer pessoa que descubra esta URL pode enviar um
// "transaction.paid" falso. Por isso o corpo do POST é tratado apenas
// como um AVISO: a confirmação real vem de uma consulta nossa a
// /api/stats/:id, que fala direto com o gateway autenticado.

const { pixgate, limpaTexto } = require('./_pixgate');
const { enviarEvento } = require('./_tiktok');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  // A doc recomenda responder 200 antes de processar, para não causar
  // timeout e retentativas desnecessárias do gateway.
  res.status(200).json({ recebido: true });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = limpaTexto(body.transaction_id, 100);

    console.log('[webhook-pix] aviso recebido', {
      event: body.event,
      transaction_id: id,
      status_informado: body.status,
    });

    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      console.warn('[webhook-pix] transaction_id ausente ou inválido — ignorado');
      return;
    }

    // Reconfirma na fonte autenticada antes de considerar pago.
    const t = await pixgate('/stats/' + encodeURIComponent(id));

    if (t && t.paid) {
      // Entrega é manual: isto fica registrado nos logs da Vercel para
      // você cruzar com o painel do PixGate e enviar o devocional.
      console.log('[webhook-pix] ✅ PAGAMENTO CONFIRMADO — enviar produto', {
        id: t.id,
        valor: t.value,
        pago_em: t.paid_at,
        pagador: body.payer || null,
        end2end: body.end2end || null,
      });

      // Conversão confirmada pelo gateway: avisa o TikTok pelo servidor.
      // event_id = id da transação, para deduplicar com o pixel do navegador.
      await enviarEvento('CompletePayment', {
        event_id: t.id,
        valor: t.value,
      });
    } else {
      console.log('[webhook-pix] não confirmado pelo gateway', {
        id,
        status_real: t && t.status,
      });
    }
  } catch (e) {
    console.error('[webhook-pix] erro ao processar:', e.message, e.dados || '');
  }
};
