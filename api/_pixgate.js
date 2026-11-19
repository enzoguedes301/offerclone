// Helpers compartilhados pelas funções serverless.
// A Apikey vive só aqui no servidor, nunca no navegador.

const BASE = 'https://app.pixgateip.com/api';

// Preço fixado no servidor. O front NUNCA envia valor:
// se enviasse, o comprador editaria e pagaria R$ 0,01.
const PRECO_CENTAVOS = 3700;

function getApiKey() {
  const key = process.env.PIXGATE_API_KEY;
  if (!key) throw new Error('PIXGATE_API_KEY não configurada nas env vars da Vercel');
  return key;
}

async function pixgate(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Apikey': getApiKey(),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const texto = await res.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    dados = { _raw: texto };
  }

  if (!res.ok) {
    const err = new Error('PixGate respondeu ' + res.status);
    err.status = res.status;
    err.dados = dados;
    throw err;
  }
  return dados;
}

// --- validações: tudo que vem do navegador é hostil até prova em contrário ---

function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

// Validação real de CPF (dígitos verificadores), não só contagem de caracteres.
function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // 111.111.111-11 etc.

  for (const tam of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tam; i++) {
      soma += Number(d[i]) * (tam + 1 - i);
    }
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== Number(d[tam])) return false;
  }
  return true;
}

function emailValido(email) {
  const e = String(email || '').trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function limpaTexto(v, max) {
  return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

module.exports = {
  BASE,
  PRECO_CENTAVOS,
  pixgate,
  soDigitos,
  cpfValido,
  emailValido,
  limpaTexto,
};
