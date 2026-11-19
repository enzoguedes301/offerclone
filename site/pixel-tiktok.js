// TikTok Pixel — o funil é uma página só (quiz em <template>), então
// os eventos são disparados por marco do funil, não por troca de URL.

(function () {
  'use strict';

  var PIXEL_ID = 'DBQ8HLJC77UBQ4PDUHUG';
  var VALOR = 37.00;
  var MOEDA = 'BRL';

  // ?demo=1 e ?teste=1 não devem sujar os dados da campanha.
  var EH_TESTE = /[?&](demo|teste)=1(&|$)/.test(location.search);

  // --- snippet oficial do TikTok ---
  !function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = w[t] = w[t] || [];
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off',
      'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
    ttq.setAndDefer = function (o, m) {
      o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (id) {
      var o = ttq._i[id] || [];
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(o, ttq.methods[i]);
      return o;
    };
    ttq.load = function (id, cfg) {
      var url = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._i[id]._u = url;
      ttq._t = ttq._t || {}; ttq._t[id] = +new Date();
      ttq._o = ttq._o || {}; ttq._o[id] = cfg || {};
      var s = d.createElement('script');
      s.type = 'text/javascript'; s.async = true; s.src = url + '?sdkid=' + id + '&lib=' + t;
      var e = d.getElementsByTagName('script')[0];
      e.parentNode.insertBefore(s, e);
    };
    ttq.load(PIXEL_ID);
    ttq.page();
  }(window, document, 'ttq');

  function track(evento, dados) {
    if (EH_TESTE) {
      console.log('[pixel-teste] ' + evento, dados || '');
      return;
    }
    try {
      var props = {};
      var eventId;
      for (var k in dados) {
        if (!Object.prototype.hasOwnProperty.call(dados, k)) continue;
        // event_id vai fora das propriedades: é o que o TikTok usa para
        // deduplicar com o evento equivalente da Events API.
        if (k === 'event_id') eventId = dados[k];
        else props[k] = dados[k];
      }
      if (eventId) window.ttq.track(evento, props, { event_id: eventId });
      else window.ttq.track(evento, props);
    } catch (e) { /* bloqueador de anúncio */ }
  }

  // Exposto para o checkout.js disparar Purchase na confirmação real.
  window.pixelTikTok = { track: track };

  // --- marcos do funil ---

  var jaDisparou = {};
  function umaVez(chave, fn) {
    if (jaDisparou[chave]) return;
    jaDisparou[chave] = true;
    fn();
  }

  // Início do quiz: primeira resposta do usuário.
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;

    if (e.target.closest('.quiz-option, .hero-choice-option')) {
      umaVez('inicio', function () {
        track('ClickButton', { content_name: 'Inicio do quiz' });
      });
    }

    // Clique no botão de compra: chegou na oferta e demonstrou intenção.
    if (e.target.closest('.go-to-checkout')) {
      track('InitiateCheckout', {
        content_name: 'Devocional Santa Rita',
        content_type: 'product',
        value: VALOR,
        currency: MOEDA,
      });
    }
  }, true);

  // Chegou na página de vendas (último step, onde o preço aparece).
  // O quiz injeta os steps no DOM, por isso observamos as mudanças.
  if (window.MutationObserver) {
    var obs = new MutationObserver(function () {
      if (document.querySelector('.go-to-checkout')) {
        umaVez('oferta', function () {
          track('ViewContent', {
            content_name: 'Devocional Santa Rita',
            content_type: 'product',
            value: VALOR,
            currency: MOEDA,
          });
        });
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
})();
