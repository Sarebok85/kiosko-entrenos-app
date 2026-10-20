// Lo que le falta al navegador del Kindle Touch (WebKit de 2011, ES5) para correr kindle.js,
// que es app.js pasado a ES5 por el workflow. Solo lo que app.js usa: si se usa algo nuevo alli, va aqui.
(function () {
  var estado = function (txt) { var e = document.getElementById('estado'); if (e) e.innerHTML = txt; };
  // sin consola en el Kindle: los errores a la vista
  window.onerror = function (msg, url, linea) { estado('error: ' + msg + ' (' + linea + ')'); };
  if (!window.console) window.console = { error: function () {}, log: function () {} };

  if (!window.Promise) {
    // shortcut: Promise minima (then/catch/resolve/reject), basta para el async/await de carga()
    var P = function (fn) {
      var st = 0, val, cola = [], self = this;
      var fin = function (s, v) {
        if (st) return;
        if (s === 1 && v && typeof v.then === 'function') { v.then(function (x) { fin(1, x); }, function (x) { fin(2, x); }); return; }
        st = s; val = v;
        setTimeout(function () { for (var i = 0; i < cola.length; i++) cola[i](); }, 0);
      };
      this.then = function (ok, mal) {
        return new P(function (res, rej) {
          var paso = function () {
            var f = st === 1 ? ok : mal;
            if (typeof f !== 'function') return (st === 1 ? res : rej)(val);
            try { res(f(val)); } catch (e) { rej(e); }
          };
          st ? setTimeout(paso, 0) : cola.push(paso);
        });
      };
      this['catch'] = function (mal) { return self.then(null, mal); };
      try { fn(function (v) { fin(1, v); }, function (v) { fin(2, v); }); } catch (e) { fin(2, e); }
    };
    P.resolve = function (v) { return new P(function (r) { r(v); }); };
    P.reject = function (v) { return new P(function (_, r) { r(v); }); };
    window.Promise = P;
  }

  if (!window.fetch) window.fetch = function (url) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.onreadystatechange = function () {
        if (x.readyState !== 4) return;
        if (!x.status) return rej(new Error('sin red'));
        var t = x.responseText;
        res({ ok: x.status >= 200 && x.status < 300, status: x.status,
              json: function () { return Promise.resolve(JSON.parse(t)); } });
      };
      x.send();
    });
  };

  // sin normalize no se quitan tildes: "media mañana" se queda sin icono, nada mas
  if (!String.prototype.normalize) String.prototype.normalize = function () { return String(this); };
  if (!String.prototype.startsWith) String.prototype.startsWith = function (s) { return this.indexOf(s) === 0; };
  if (!Array.prototype.includes) Array.prototype.includes = function (v) { return this.indexOf(v) !== -1; };
  if (!Array.prototype.find) Array.prototype.find = function (f) {
    for (var i = 0; i < this.length; i++) if (f(this[i], i, this)) return this[i];
  };
  if (!Math.sign) Math.sign = function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; };
  if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;
  var EP = Element.prototype;
  if (!EP.matches) EP.matches = EP.webkitMatchesSelector;
  if (!EP.closest) EP.closest = function (s) {
    for (var e = this; e && e.nodeType === 1; e = e.parentNode) if (e.matches(s)) return e;
    return null;
  };
  if (!('dataset' in document.documentElement)) Object.defineProperty(EP, 'dataset', { get: function () {
    var d = {}, a = this.attributes;
    for (var i = 0; i < a.length; i++) if (a[i].name.indexOf('data-') === 0)
      d[a[i].name.slice(5).replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] = a[i].value;
    return d;
  } });
  if (!history.replaceState) history.replaceState = function () {};
  // classList.toggle(clase, force): este WebKit ignora force y alterna, y ir() de app.js lo usa para mostrar la vista
  var prueba = document.createElement('i');
  prueba.classList.toggle('a', false);
  if (prueba.classList.contains('a')) {
    var alterna = DOMTokenList.prototype.toggle;
    DOMTokenList.prototype.toggle = function (c, force) {
      if (force === undefined) return alterna.call(this, c);
      force ? this.add(c) : this.remove(c);
      return !!force;
    };
  }

  // la pagina va girada -90deg (kindle.css) y este WebKit manda el toque al elemento que habria ahi sin girar:
  // se tira ese click y se lanza otro sobre el boton que de verdad esta bajo el dedo (por offsets, que no giran)
  var propio = false, ultimo = 0;
  // shortcut: traza temporal; el console.log de WebLaunch no se guarda, pero cada URL pedida sale en
  // /var/log/messages del Kindle (s_requestStartingHandler). Quitar al cerrar
  var baliza = function (txt) { new Image().src = 'log?' + encodeURIComponent(txt) + '&' + (+new Date()); };
  baliza('KIOSKO carga win=' + window.innerWidth + 'x' + window.innerHeight);
  ['touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      var p = e.changedTouches ? e.changedTouches[0] : e;
      baliza('KIOSKO ev ' + t + ' ' + p.clientX + ',' + p.clientY + ' propio=' + propio);
    }, true);
  });
  window.addEventListener('scroll', function () { baliza('KIOSKO scroll ' + window.scrollX + ',' + window.scrollY); }, true);
  var enStage = function (x, y) { return { x: 800 - y, y: x }; };   // pantalla 600x800 -> stage 800x600
  var caja = function (el) {
    var x = 0, y = 0, e = el;
    for (; e && !/\bstage\b/.test(e.className); e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  };
  var bajoDedo = function (p) {
    var mejor = null, area = 1e9, els = document.querySelectorAll('[data-go], [data-mover]');
    for (var i = 0; i < els.length; i++) {
      var c = caja(els[i]);
      if (!c.w || els[i].disabled || p.x < c.x || p.x > c.x + c.w || p.y < c.y || p.y > c.y + c.h) continue;
      if (c.w * c.h < area) { area = c.w * c.h; mejor = els[i]; }
    }
    return mejor;
  };
  var toque = function (e) {
    if (propio) return;
    e.preventDefault(); e.stopPropagation();
    var t = e.changedTouches ? e.changedTouches[0] : e;
    var p = enStage(t.clientX, t.clientY), el = bajoDedo(p);
    // shortcut: traza temporal para depurar los toques en el Kindle (sale en /var/log/messages); quitar al cerrar
    var traza = 'KIOSKO ' + e.type + ' cli=' + t.clientX + ',' + t.clientY + ' pag=' + t.pageX + ',' + t.pageY +
      ' stage=' + p.x + ',' + p.y + ' el=' + (el ? el.getAttribute('data-go') || el.getAttribute('data-mover') : '-') +
      ' win=' + window.innerWidth + 'x' + window.innerHeight + ' scroll=' + window.scrollX + ',' + window.scrollY;
    baliza(traza); estado(traza.slice(7));
    if (new Date() - ultimo < 500) return;      // touchend y su click: un solo toque
    ultimo = new Date();
    if (!el) return;
    var c = document.createEvent('MouseEvents');
    c.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
    propio = true; el.dispatchEvent(c); propio = false;
    setTimeout(function () {
      var v = document.querySelectorAll('.view.activa'), txt = [];
      for (var i = 0; i < v.length; i++) txt.push(v[i].id + ':' + v[i].innerHTML.length);
      baliza('KIOSKO vistas ' + txt.join(' ') + ' estado=' + document.getElementById('estado').innerHTML.slice(0, 80));
    }, 800);
  };
  document.addEventListener('touchend', toque, true);
  document.addEventListener('click', toque, true);
  // al tocar, WebKit enfoca el boton y desplaza hasta donde estaria sin girar (fuera de pantalla): todo en blanco.
  // sin foco y con todo el desplazamiento a cero, la pagina se queda donde esta
  var aCero = function () {
    window.scrollTo(0, 0);
    var els = document.querySelectorAll('html, body, .stage, .views, .view, .rail');
    for (var i = 0; i < els.length; i++) { els[i].scrollTop = 0; els[i].scrollLeft = 0; }
  };
  document.addEventListener('mousedown', function (e) { e.preventDefault(); }, true);
  window.addEventListener('scroll', aCero, true);
  ['touchstart', 'touchend', 'click'].forEach(function (t) {
    document.addEventListener(t, function () { aCero(); setTimeout(aCero, 50); setTimeout(aCero, 300); }, true);
  });

  // tinta electronica: un destello negro cada 15' borra el rastro de las pantallas anteriores
  setInterval(function () {
    var n = document.createElement('div');
    n.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99';
    document.body.appendChild(n);
    setTimeout(function () { document.body.removeChild(n); }, 400);
  }, 15 * 60e3);
})();
