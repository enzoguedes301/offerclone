// GET /api/status-pix?id=<transaction_id>
// O front chama isso em intervalos para saber se o Pix caiu.
// É a ÚNICA fonte de verdade sobre pagamento (o webhook não é confiável:
// a API do PixGate não assina os callbacks).

const { pixgate, limpaTexto } = require('./_pixgate');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  const id = limpaTexto(req.query && req.query.id, 100);
  // Aceita só o formato de id que o gateway emite, evitando montar
  // caminhos arbitrários na URL do upstream.
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return res.status(400).json({ erro: 'id inválido' });
  }

  try {
    const t = await pixgate('/stats/' + encodeURIComponent(id));

    // Resposta mínima: o front só precisa saber se pagou.
    return res.status(200).json({
      id: t.id,
      status: t.status,
      pago: Boolean(t.paid),
      pendente: Boolean(t.pending),
      pago_em: t.paid_at || null,
    });
  } catch (e) {
    if (e.status === 404) {
      return res.status(404).json({ erro: 'Transação não encontrada' });
    }
    console.error('[status-pix] falha:', e.message, e.dados || '');
    return res.status(502).json({ erro: 'Não foi possível consultar o status' });
  }
};
