// TikTok Events API (server-side).
// Roda no servidor, então não é afetado por bloqueador de anúncio nem
// por restrições de cookie do navegador. O CompletePayment daqui sai
// com a confirmação real do gateway, não com a tela do cliente.

const crypto = require('crypto');

const PIXEL_ID = 'DBQ8HLJC77UBQ4PDUHUG';
const ENDPOINT = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

// O TikTok exige e-mail/telefone com hash SHA-256, nunca em texto puro.
function hash(valor) {
  if (!valor) return undefined;
  return crypto.createHash('sha256').update(String(valor).trim().toLowerCase()).digest('hex');
}

// Telefone precisa ir em E.164 (+55...) antes do hash.
function hashTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return undefined;
  return hash(d.startsWith('55') ? '+' + d : '+55' + d);
}

async function enviarEvento(evento, dados = {}) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) {
    console.warn('[tiktok] TIKTOK_ACCESS_TOKEN ausente — evento não enviado:', evento);
    return;
  }

  const payload = {
    event_source: 'web',
    event_source_id: PIXEL_ID,
    data: [{
      event: evento,
      event_time: Math.floor(Date.now() / 1000),
      // Deduplica com o pixel do navegador: mesmo id = mesma conversão.
      event_id: dados.event_id,
      user: {
        email: hash(dados.email),
        phone: hashTelefone(dados.telefone),
        ip: dados.ip,
        user_agent: dados.user_agent,
        ttclid: dados.ttclid,
        ttp: dados.ttp,
      },
      properties: {
        content_type: 'product',
        content_name: 'Devocional Santa Rita',
        currency: 'BRL',
        value: dados.valor,
      },
      page: dados.url ? { url: dados.url } : undefined,
    }],
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const corpo = await res.json().catch(() => ({}));

    // code 0 = sucesso na API do TikTok.
    if (!res.ok || (corpo && corpo.code !== 0)) {
      console.error('[tiktok] falha ao enviar', evento, corpo);
    } else {
      console.log('[tiktok] evento enviado:', evento);
    }
  } catch (e) {
    // Rastreamento nunca pode derrubar o fluxo de pagamento.
    console.error('[tiktok] erro de rede:', e.message);
  }
}

module.exports = { enviarEvento, PIXEL_ID };
