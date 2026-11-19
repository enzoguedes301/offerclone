// Checkout Pix (PixGate) — substitui o antigo redirect para gateway externo.
// Fluxo: formulário -> POST /api/criar-pix -> QR/copia-e-cola -> polling /api/status-pix
//
// Os botões vêm de dentro de <template> e entram no DOM depois do quiz,
// por isso o clique é delegado no document.

(function () {
  'use strict';

  var PRECO_LABEL = 'R$ 37,00';
  var modal = null;
  var pollTimer = null;
  var expiraTimer = null;

  // ---------- utilidades ----------

  function soDigitos(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function mascaraCPF(v) {
    var d = soDigitos(v).slice(0, 11);
    if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if (d.length > 3) return d.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    return d;
  }

  function mascaraTelefone(v) {
    var d = soDigitos(v).slice(0, 11);
    if (d.length > 10) return d.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3');
    if (d.length > 6) return d.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');
    if (d.length > 2) return d.replace(/(\d{2})(\d{1,5})/, '($1) $2');
    if (d.length > 0) return '(' + d;
    return d;
  }

  // Mesma validação de dígitos verificadores do servidor, para avisar
  // o comprador antes de gastar uma chamada à API.
  function cpfValido(cpf) {
    var d = soDigitos(cpf);
    if (d.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(d)) return false;
    var tamanhos = [9, 10];
    for (var t = 0; t < tamanhos.length; t++) {
      var tam = tamanhos[t];
      var soma = 0;
      for (var i = 0; i < tam; i++) soma += Number(d[i]) * (tam + 1 - i);
      var dv = (soma * 10) % 11;
      if (dv === 10) dv = 0;
      if (dv !== Number(d[tam])) return false;
    }
    return true;
  }

  function emailValido(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
  }

  // ---------- modal ----------

  function fecharModal() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (expiraTimer) { clearInterval(expiraTimer); expiraTimer = null; }
    if (modal) { modal.remove(); modal = null; }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') fecharModal();
  }

  function abrirModal() {
    fecharModal();

    modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Finalizar compra');
    modal.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-start;' +
      'justify-content:center;overflow-y:auto;padding:16px;' +
      'background:rgba(60,36,36,0.55);font-family:Poppins,system-ui,sans-serif;';

    modal.addEventListener('click', function (e) {
      if (e.target === modal) fecharModal();
    });

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);

    mostrarFormulario();
  }

  function caixa(conteudo) {
    modal.innerHTML =
      '<div style="width:100%;max-width:420px;margin:auto;background:#fff;border:1px solid #E8DFD6;' +
      'border-radius:14px;padding:22px 20px;box-shadow:0 8px 30px rgba(60,36,36,0.25);">' +
      conteudo +
      '</div>';
  }

  // ---------- etapa 1: formulário ----------

  function mostrarFormulario(valores, erroGeral) {
    var v = valores || {};
    caixa(
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">' +
        '<h2 style="font-size:19px;font-weight:700;color:#A82430;line-height:1.3;margin:0;">Finalizar com Pix</h2>' +
        '<button type="button" data-fechar aria-label="Fechar" style="border:0;background:transparent;font-size:26px;' +
        'line-height:1;color:#7A6560;cursor:pointer;padding:0 4px;">&times;</button>' +
      '</div>' +
      '<p style="font-size:14px;color:#7A6560;margin:6px 0 0;">Devocional Santa Rita · <strong style="color:#849C48;">' + PRECO_LABEL + '</strong></p>' +
      (erroGeral
        ? '<p role="alert" style="margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#FDF0F1;' +
          'border:1px solid #E8A0A6;color:#A82430;font-size:14px;">' + erroGeral + '</p>'
        : '') +
      '<form novalidate style="display:flex;flex-direction:column;gap:12px;margin-top:16px;">' +
        campo('nome', 'Nome completo', 'text', 'Maria da Silva', v.nome) +
        campo('cpf', 'CPF', 'tel', '000.000.000-00', v.cpf) +
        campo('email', 'E-mail', 'email', 'voce@email.com', v.email) +
        campo('telefone', 'WhatsApp com DDD', 'tel', '(11) 90000-0000', v.telefone) +
        '<button type="submit" class="botao-3d-verde" style="margin-top:6px;">GERAR PIX DE ' + PRECO_LABEL + '</button>' +
      '</form>' +
      '<p style="font-size:12px;color:#9CA3AF;text-align:center;margin:12px 0 0;">Pagamento único · 30 dias de garantia</p>'
    );

    modal.querySelector('[data-fechar]').addEventListener('click', fecharModal);

    var form = modal.querySelector('form');

    // Máscaras conforme digita.
    var inpCpf = form.querySelector('[name=cpf]');
    inpCpf.addEventListener('input', function () { inpCpf.value = mascaraCPF(inpCpf.value); });
    var inpTel = form.querySelector('[name=telefone]');
    inpTel.addEventListener('input', function () { inpTel.value = mascaraTelefone(inpTel.value); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      enviarFormulario(form);
    });

    form.querySelector('[name=nome]').focus();
  }

  function campo(nome, label, tipo, placeholder, valor) {
    return (
      '<label style="display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#3C2424;">' +
        label +
        '<input name="' + nome + '" type="' + tipo + '" placeholder="' + placeholder + '" ' +
        'value="' + (valor ? String(valor).replace(/"/g, '&quot;') : '') + '" ' +
        'autocomplete="' + (nome === 'telefone' ? 'tel' : nome === 'nome' ? 'name' : nome) + '" ' +
        'style="width:100%;padding:13px 14px;border:1px solid #E8DFD6;border-radius:12px;background:#fff;' +
        'font-family:inherit;font-size:15px;font-weight:400;color:#3C2424;box-sizing:border-box;">' +
        '<span data-erro="' + nome + '" style="display:none;font-size:12px;font-weight:500;color:#A82430;"></span>' +
      '</label>'
    );
  }

  function mostrarErroCampo(form, nome, msg) {
    var span = form.querySelector('[data-erro="' + nome + '"]');
    if (!span) return;
    span.textContent = msg;
    span.style.display = msg ? 'block' : 'none';
    var input = form.querySelector('[name="' + nome + '"]');
    if (input) input.style.borderColor = msg ? '#E8A0A6' : '#E8DFD6';
  }

  function enviarFormulario(form) {
    var dados = {
      nome: form.querySelector('[name=nome]').value.trim(),
      cpf: soDigitos(form.querySelector('[name=cpf]').value),
      email: form.querySelector('[name=email]').value.trim(),
      telefone: soDigitos(form.querySelector('[name=telefone]').value),
    };

    ['nome', 'cpf', 'email', 'telefone'].forEach(function (k) { mostrarErroCampo(form, k, ''); });

    var ok = true;
    if (dados.nome.length < 5 || dados.nome.indexOf(' ') === -1) {
      mostrarErroCampo(form, 'nome', 'Informe seu nome completo'); ok = false;
    }
    if (!cpfValido(dados.cpf)) { mostrarErroCampo(form, 'cpf', 'CPF inválido'); ok = false; }
    if (!emailValido(dados.email)) { mostrarErroCampo(form, 'email', 'E-mail inválido'); ok = false; }
    if (dados.telefone.length < 10 || dados.telefone.length > 11) {
      mostrarErroCampo(form, 'telefone', 'Telefone com DDD'); ok = false;
    }
    if (!ok) return;

    var botao = form.querySelector('button[type=submit]');
    botao.disabled = true;
    botao.textContent = 'GERANDO PIX...';

    fetch('/api/criar-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    })
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, body: j }; });
      })
      .then(function (res) {
        if (!res.ok) {
          var campos = res.body && res.body.campos;
          if (campos) {
            mostrarFormulario(dados);
            var f = modal.querySelector('form');
            Object.keys(campos).forEach(function (k) { mostrarErroCampo(f, k, campos[k]); });
            return;
          }
          mostrarFormulario(dados, (res.body && res.body.erro) || 'Não foi possível gerar o Pix.');
          return;
        }
        mostrarPagamento(res.body);
      })
      .catch(function () {
        mostrarFormulario(dados, 'Falha de conexão. Verifique sua internet e tente de novo.');
      });
  }

  // ---------- etapa 2: pagamento ----------

  function mostrarPagamento(cobranca) {
    var codigo = cobranca.pix;

    caixa(
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">' +
        '<h2 style="font-size:19px;font-weight:700;color:#A82430;line-height:1.3;margin:0;">Pague com Pix para liberar</h2>' +
        '<button type="button" data-fechar aria-label="Fechar" style="border:0;background:transparent;font-size:26px;' +
        'line-height:1;color:#7A6560;cursor:pointer;padding:0 4px;">&times;</button>' +
      '</div>' +
      '<p style="font-size:14px;color:#7A6560;margin:6px 0 0;">Abra o app do seu banco, escolha <strong>Pix</strong> e escaneie o código.</p>' +
      '<div data-qr style="display:flex;justify-content:center;margin:16px 0;min-height:200px;align-items:center;">' +
        '<span style="font-size:13px;color:#9CA3AF;">Gerando QR Code...</span>' +
      '</div>' +
      '<p style="font-size:13px;font-weight:600;color:#3C2424;margin:0 0 6px;">Ou use o Pix copia e cola:</p>' +
      '<textarea readonly data-codigo rows="3" style="width:100%;padding:11px 12px;border:1px solid #E8DFD6;' +
      'border-radius:10px;background:#FBF7F2;font-family:ui-monospace,monospace;font-size:11px;color:#3C2424;' +
      'resize:none;box-sizing:border-box;">' + codigo + '</textarea>' +
      '<button type="button" data-copiar class="botao-3d" style="margin-top:10px;">COPIAR CÓDIGO PIX</button>' +
      '<div data-status style="margin-top:16px;padding:12px;border-radius:10px;background:#FBF7F2;' +
      'border:1px solid #E8DFD6;text-align:center;">' +
        '<p style="font-size:14px;font-weight:600;color:#7A6560;margin:0;">⏳ Aguardando pagamento...</p>' +
        '<p data-expira style="font-size:12px;color:#9CA3AF;margin:4px 0 0;"></p>' +
      '</div>'
    );

    modal.querySelector('[data-fechar]').addEventListener('click', function () {
      if (confirm('Fechar agora? Seu Pix de ' + PRECO_LABEL + ' ainda não foi confirmado.')) fecharModal();
    });

    gerarQRCode(codigo, modal.querySelector('[data-qr]'));

    var btnCopiar = modal.querySelector('[data-copiar]');
    btnCopiar.addEventListener('click', function () {
      copiar(codigo, modal.querySelector('[data-codigo]'));
      btnCopiar.textContent = '✓ CÓDIGO COPIADO!';
      setTimeout(function () { btnCopiar.textContent = 'COPIAR CÓDIGO PIX'; }, 2200);
    });

    iniciarContagem(30 * 60);
    iniciarPolling(cobranca.id);
  }

  // O QR é gerado por imagem externa; se falhar, o copia-e-cola acima
  // continua funcionando, então nunca bloqueia a compra.
  function gerarQRCode(codigo, alvo) {
    var img = new Image();
    img.width = 200;
    img.height = 200;
    img.alt = 'QR Code do Pix';
    img.style.cssText = 'width:200px;height:200px;border:1px solid #E8DFD6;border-radius:10px;background:#fff;';
    img.onload = function () { alvo.innerHTML = ''; alvo.appendChild(img); };
    img.onerror = function () {
      alvo.innerHTML =
        '<p style="font-size:13px;color:#7A6560;text-align:center;margin:0;">' +
        'Não foi possível exibir o QR Code.<br>Use o <strong>copia e cola</strong> abaixo. 👇</p>';
    };
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=' +
      encodeURIComponent(codigo);
  }

  function copiar(texto, textarea) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).catch(function () { selecionar(textarea); });
    } else {
      selecionar(textarea);
    }
  }

  function selecionar(textarea) {
    if (!textarea) return;
    textarea.focus();
    textarea.select();
    try { document.execCommand('copy'); } catch (e) { /* o usuário copia manualmente */ }
  }

  function iniciarContagem(segundos) {
    var restante = segundos;
    var alvo = modal.querySelector('[data-expira]');
    function tick() {
      if (!alvo || !alvo.isConnected) return;
      var m = Math.floor(restante / 60);
      var s = restante % 60;
      alvo.textContent = 'Este código expira em ' + m + ':' + (s < 10 ? '0' : '') + s;
      if (restante <= 0) {
        clearInterval(expiraTimer);
        alvo.textContent = 'Código expirado. Feche e gere um novo.';
      }
      restante--;
    }
    tick();
    expiraTimer = setInterval(tick, 1000);
  }

  function iniciarPolling(id) {
    var tentativas = 0;
    pollTimer = setInterval(function () {
      tentativas++;
      // ~30 min a cada 5s; depois disso o Pix já expirou.
      if (tentativas > 360) { clearInterval(pollTimer); pollTimer = null; return; }

      fetch('/api/status-pix?id=' + encodeURIComponent(id))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (t) {
          if (t && t.pago) {
            clearInterval(pollTimer); pollTimer = null;
            if (expiraTimer) { clearInterval(expiraTimer); expiraTimer = null; }
            mostrarConfirmado();
          }
        })
        .catch(function () { /* rede instável: a próxima tentativa resolve */ });
    }, 5000);
  }

  // ---------- etapa 3: confirmado ----------

  function mostrarConfirmado() {
    caixa(
      '<div style="text-align:center;">' +
        '<p style="font-size:44px;line-height:1;margin:0 0 10px;">🌹</p>' +
        '<h2 style="font-size:22px;font-weight:700;color:#849C48;line-height:1.25;margin:0;">Pagamento confirmado!</h2>' +
        '<p style="font-size:15px;color:#3C2424;line-height:1.5;margin:14px 0 0;">' +
          'Recebemos seu Pix de <strong>' + PRECO_LABEL + '</strong>. Seu devocional será enviado para o ' +
          '<strong>e-mail e WhatsApp</strong> que você informou.' +
        '</p>' +
        '<p style="font-size:14px;color:#7A6560;line-height:1.5;margin:12px 0 0;">' +
          'Fique de olho na caixa de entrada (e no spam). Se precisar de ajuda, responda o e-mail da confirmação.' +
        '</p>' +
        '<button type="button" data-fechar class="botao-3d-verde" style="margin-top:18px;">ENTENDI, OBRIGADA!</button>' +
      '</div>'
    );
    modal.querySelector('[data-fechar]').addEventListener('click', fecharModal);
  }

  // ---------- gatilho ----------

  // Clique delegado: os botões nascem dentro de <template> e só entram
  // no DOM depois do quiz.
  document.addEventListener('click', function (e) {
    var alvo = e.target.closest && e.target.closest('.go-to-checkout');
    if (!alvo) return;
    e.preventDefault();
    abrirModal();
  }, true);
})();
