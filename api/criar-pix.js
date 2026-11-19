// POST /api/criar-pix
// Recebe os dados do comprador, cria a cobrança no PixGate e devolve
// apenas o copia-e-cola + id. A Apikey nunca sai do servidor.

const {
  PRECO_CENTAVOS,
  pixgate,
  soDigitos,
  cpfValido,
  emailValido,
  limpaTexto,
} = require('./_pixgate');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const nome = limpaTexto(body.nome, 80);
    const cpf = soDigitos(body.cpf);
    const email = limpaTexto(body.email, 254).toLowerCase();
    const telefone = soDigitos(body.telefone);

    const erros = {};
    // Nome completo: exige pelo menos duas palavras.
    if (nome.length < 5 || !nome.includes(' ')) erros.nome = 'Informe seu nome completo';
    if (!cpfValido(cpf)) erros.cpf = 'CPF inválido';
    if (!emailValido(email)) erros.email = 'E-mail inválido';
    if (telefone.length < 10 || telefone.length > 11) erros.telefone = 'Telefone com DDD';

    if (Object.keys(erros).length) {
      return res.status(400).json({ erro: 'Dados inválidos', campos: erros });
    }

    // O postback é montado a partir do próprio host da requisição,
    // então funciona em preview e em produção sem configuração extra.
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const postback = host ? `https://${host}/api/webhook-pix` : undefined;

    const cobranca = await pixgate('/v1/cashin', {
      method: 'POST',
      body: JSON.stringify({
        nome,
        cpf,
        email,
        telefone,
        valor: PRECO_CENTAVOS / 100, // a API espera reais
        descricao: 'Devocional Santa Rita - 40 encontros + bonus',
        device: 'web',
        ...(postback ? { postback } : {}),
      }),
    });

    if (!cobranca || !cobranca.pix || !cobranca.id) {
      console.error('[criar-pix] resposta inesperada do PixGate:', cobranca);
      return res.status(502).json({ erro: 'Não foi possível gerar o Pix. Tente novamente.' });
    }

    // Log para você cruzar com o painel na hora de enviar o produto.
    console.log('[criar-pix] cobrança criada', {
      id: cobranca.id,
      nome,
      email,
      telefone,
      valor: cobranca.value,
    });

    // Devolve só o necessário para a tela de pagamento.
    return res.status(200).json({
      id: cobranca.id,
      pix: cobranca.pix,
      valor: cobranca.value,
      status: cobranca.status,
    });
  } catch (e) {
    console.error('[criar-pix] falha:', e.message, e.dados || '');
    return res.status(502).json({ erro: 'Falha ao comunicar com o gateway. Tente novamente.' });
  }
};
