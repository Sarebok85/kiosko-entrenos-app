// Kiosko de Run-AI: pinta data.json (lo genera kiosko-app/build.js). Solo lee.
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ICONO_DEPORTE = { running: '🏃', soccer: '⚽', strength_training: '🏋️', walking: '🚶',
                        hiking: '🥾', cycling: '🚴' };
const ICONO_TIPO = { calidad: '⚡', larga: '🏔️', facil: '🌿', descanso: '😴' };
const ICONO_COMIDA = { desayuno: '🍳', 'media manana': '🍎', comida: '🍽️', merienda: '🥪', cena: '🌙' };
const VUELTA_A_HOY_MS = 3 * 60e3;     // sin tocar la pantalla, vuelve al dashboard
const RECARGA_MS = 15 * 60e3;         // relee data.json: el agente publica los domingos

let DATA = null;
let EVENTOS = [];     // eventos.json: calendarios de iCloud, lo genera el workflow cada 30'
const COLORES_CAL = ['#2f6fdf', '#c2410c', '#7c3aed', '#0f766e', '#be185d'];
let vista = 'hoy';
const desfase = { semana: 0, mes: 0, nutricion: 0, comida: 0 };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// a mano: es-ES no agrupa los numeros de 4 cifras (2004 y no 2.004)
const fmt = v => v == null || isNaN(v) ? '—' : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fecha = f => new Date(f + 'T12:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const suma = (f, n) => { const d = fecha(f); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const lunesDe = f => suma(f, -((fecha(f).getUTCDay() + 6) % 7));
const nDia = f => fecha(f).getUTCDate();
const nombreDia = f => DIAS[fecha(f).getUTCDay()];
const plan = f => (DATA.dias || {})[f];
const hechas = f => (DATA.hechas || {})[f] || [];
const calendarios = () => [...new Set(EVENTOS.map(e => e.cal))];
const colorCal = c => COLORES_CAL[calendarios().indexOf(c) % COLORES_CAL.length];
// los de todo el dia primero; un evento de varios dias sale en todos ellos
const eventosDe = f => EVENTOS.filter(e => e.inicio.slice(0, 10) <= f && f <= e.fin.slice(0, 10))
  .sort((a, b) => (b.todo_el_dia - a.todo_el_dia) || a.inicio.localeCompare(b.inicio));
const horaEv = (e, f) => e.todo_el_dia ? 'día' : e.inicio.slice(0, 10) < f ? '↳' : e.inicio.slice(11, 16);
const eventoHtml = (e, f) => `<li class="evento" style="--c:${colorCal(e.cal)}">
  <span class="hora">${horaEv(e, f)}</span><span class="que">${esc(e.titulo)}</span>
  ${e.lugar ? `<span class="num">${esc(e.lugar.split('\n')[0])}</span>` : ''}</li>`;
const icoTipo = t => ICONO_TIPO[t] || '•';
const icoDeporte = t => ICONO_DEPORTE[t] || '🏅';

// "Título: ingredientes... (P 36 · CH 61 · G 9)" -> sus tres piezas
function receta(txt) {
  if (!txt) return null;
  const mac = txt.match(/\((P \d+ · CH \d+ · G \d+)\)\s*$/);
  const cuerpo = (mac ? txt.slice(0, mac.index) : txt).trim();
  const dp = cuerpo.indexOf(':');
  return { titulo: dp > 0 ? cuerpo.slice(0, dp) : cuerpo, detalle: dp > 0 ? cuerpo.slice(dp + 1).trim() : '',
           macros: mac ? mac[1] : '' };
}
const notaDe = meta => (String(meta).match(/\*(.+?)\*/) || [, ''])[1];

function sesionHtml(s) {
  return `<li class="sesion"><span class="hora">${esc(s.hora || '—')}</span>
    <span class="ico">${icoDeporte(s.tipo)}</span>
    <span class="que">${esc(s.que)}</span>
    <span class="num">${s.min}′ · ≈${fmt(s.kcal)} kcal</span></li>`;
}
function hechaHtml(a) {
  const km = a.km ? `${a.km.toFixed(1).replace('.', ',')} km · ` : '';
  return `<li class="sesion hecha"><span class="hora">${esc(a.hora)}</span>
    <span class="ico">✓</span><span class="que">${esc(a.nombre)}</span>
    <span class="num">${km}${fmt(a.min)}′ · ${fmt(a.kcal)} kcal</span></li>`;
}

// ---------------------------------------------------------------- HOY
function pintaHoy() {
  const f = hoy(), p = plan(f), h = hechas(f);
  const d = fecha(f);
  let html = `<header class="hero">
      <div><div class="eyebrow">${nombreDia(f)}</div>
      <h1 class="serif">${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}</h1></div>
      ${p ? `<div class="tipo tipo-${p.tipo}">${icoTipo(p.tipo)} ${esc(p.tipo)}</div>` : ''}
    </header>`;
  if (!p) {
    $('#view-hoy').innerHTML = html + `<div class="card vacio"><p class="serif grande">Sin plan para hoy.</p>
      <p>Lanza <code>/kiosko</code> el domingo para publicar la semana.</p></div>`;
    return;
  }
  const entreno = p.sesiones.reduce((t, s) => t + (s.kcal || 0), 0);
  const m = p.macros || {};
  html += `<div class="grid-hoy">
    <div class="col">
      ${eventosDe(f).length ? `<div class="card"><div class="label">Agenda</div>
        <ul class="sesiones">${eventosDe(f).map(e => eventoHtml(e, f)).join('')}</ul></div>` : ''}
      <div class="card">
        <div class="label">Entreno</div>
        ${p.sesiones.length || h.length
          ? `<ul class="sesiones">${p.sesiones.map(sesionHtml).join('')}${h.map(hechaHtml).join('')}</ul>`
          : '<p class="serif grande">Descanso 😴</p>'}
      </div>
      <div class="card gasto">
        <div class="label">Gasto estimado del día</div>
        <div class="kpi"><span class="serif enorme">${fmt(p.mantenimiento)}</span> <span class="ud">kcal</span></div>
        <div class="fila3">
          <div><div class="label">entreno</div><b>≈${fmt(entreno)}</b></div>
          <div><div class="label">a comer</div><b>${fmt(p.objetivo)}</b></div>
          <div><div class="label">déficit</div><b>${fmt(p.deficit)}</b></div>
        </div>
        <div class="macros">
          <span class="pill p">P ${fmt(m.p)} g</span><span class="pill ch">CH ${fmt(m.ch)} g</span><span class="pill g">G ${fmt(m.g)} g</span>
        </div>
      </div>
      ${p.avisos.map(a => `<div class="aviso">⚠ ${esc(a)}</div>`).join('')}
    </div>
    <div class="card comidas">${comidasHtml(f)}</div>
  </div>`;
  $('#view-hoy').innerHTML = html;
}

// la tarjeta de comidas del dashboard se mueve de lunes a domingo de esta semana; arranca en hoy
function comidasHtml(hoyF) {
  const i0 = (fecha(hoyF).getUTCDay() + 6) % 7;
  desfase.comida = Math.max(-i0, Math.min(6 - i0, desfase.comida));
  const f = suma(hoyF, desfase.comida), p = plan(f);
  const nav = (n, txt, off) => `<button class="nav mini ${n ? '' : 'txt'}" data-mover="comida:${n}" ${off ? 'disabled' : ''}>${txt}</button>`;
  return `<div class="cab-comidas"><div class="label">${desfase.comida ? `Qué se come el ${nombreDia(f)} ${nDia(f)}` : 'Qué se come hoy'}</div>
      ${nav(-1, '‹', !(i0 + desfase.comida))}${desfase.comida ? nav(0, 'hoy') : ''}${nav(1, '›', i0 + desfase.comida === 6)}</div>
    ${!p?.comidas.length ? '<p class="serif grande tenue">Sin plan de comidas.</p>' : p.comidas.map(c => {
        const r = receta(c.elegida), nota = notaDe(c.meta);
        return `<div class="comida">
          <div class="ico-grande">${ICONO_COMIDA[sinTildes(c.nombre)] || '🍴'}</div>
          <div class="cuerpo">
            <div class="cab-comida"><b>${esc(c.nombre)}</b><span class="num">${fmt(c.kcal)} kcal</span></div>
            ${r ? `<div class="titulo serif">${esc(r.titulo)}</div><div class="detalle">${esc(r.detalle)}</div>`
                : `<div class="titulo serif tenue">Sin elegir (${c.opciones} opciones)</div>`}
            ${nota ? `<div class="nota">${esc(nota)}</div>` : ''}
          </div></div>`;
      }).join('')}`;
}

function cabecera(clave, titulo) {
  return `<header class="cab"><button class="nav" data-mover="${clave}:-1">‹</button>
    <h2 class="serif">${titulo}</h2><button class="nav" data-mover="${clave}:1">›</button>
    ${desfase[clave] ? `<button class="nav txt" data-mover="${clave}:0">hoy</button>` : ''}</header>`;
}
const rotuloSemana = l => `${nDia(l)} ${MESES[fecha(l).getUTCMonth()].slice(0, 3)} – ` +
  `${nDia(suma(l, 6))} ${MESES[fecha(suma(l, 6)).getUTCMonth()].slice(0, 3)}`;

// ---------------------------------------------------------------- SEMANA
function pintaSemana() {
  const l = suma(lunesDe(hoy()), 7 * desfase.semana);
  const cols = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const f = suma(l, i), p = plan(f), h = hechas(f);
    return `<div class="dia ${f === hoy() ? 'es-hoy' : ''} ${f < hoy() ? 'pasado' : ''}">
      <div class="dia-cab"><span class="eyebrow">${nombreDia(f).slice(0, 3)}</span>
        <span class="serif dnum">${nDia(f)}</span>${p ? `<span class="tipo-mini">${icoTipo(p.tipo)}</span>` : ''}</div>
      <ul class="sesiones mini">
        ${eventosDe(f).map(e => eventoHtml(e, f)).join('')}
        ${(p ? p.sesiones : []).map(s => `<li><span class="ico">${icoDeporte(s.tipo)}</span>
          <span class="que">${esc(s.que)}</span><span class="num">${s.hora ? esc(s.hora) + ' · ' : ''}${s.min}′ · ≈${fmt(s.kcal)}</span></li>`).join('')}
        ${h.map(a => `<li class="hecha"><span class="ico">✓</span><span class="que">${esc(a.nombre)}</span>
          <span class="num">${a.km ? a.km.toFixed(1).replace('.', ',') + ' km · ' : ''}${fmt(a.min)}′ · ${fmt(a.kcal)}</span></li>`).join('')}
        ${!p?.sesiones.length && !h.length ? `<li class="tenue">${p ? 'Descanso' : 'Sin plan'}</li>` : ''}
      </ul>
      ${p ? `<div class="pie"><span class="label">gasto</span> ${fmt(p.mantenimiento)}<br><span class="label">comer</span> <b>${fmt(p.objetivo)}</b></div>` : ''}
    </div>`;
  }).join('');
  $('#view-semana').innerHTML = cabecera('semana', rotuloSemana(l)) + `<div class="semana">${cols}</div>`;
}

// ---------------------------------------------------------------- MES
function pintaMes() {
  const h0 = fecha(hoy());
  const d = new Date(Date.UTC(h0.getUTCFullYear(), h0.getUTCMonth() + desfase.mes, 1, 12));
  const primero = iso(d);
  const ultimo = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
  let celdas = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(x => `<div class="mcab">${x}</div>`).join('');
  for (let f = lunesDe(primero); f <= ultimo || fecha(f).getUTCDay() !== 1; f = suma(f, 1)) {
    const fuera = f < primero || f > ultimo, p = plan(f), h = hechas(f);
    celdas += `<div class="mcelda ${fuera ? 'fuera' : ''} ${f === hoy() ? 'es-hoy' : ''}">
      <div class="mnum">${nDia(f)} ${p ? icoTipo(p.tipo) : ''}</div>
      ${eventosDe(f).map(e => `<div class="chip ev" style="--c:${colorCal(e.cal)}">${e.todo_el_dia ? '' : horaEv(e, f) + ' '}${esc(e.titulo)}</div>`).join('')}
      ${h.length ? h.map(a => `<div class="chip hecha">${icoDeporte(a.tipo)} ${esc(a.nombre)}
          <small>${a.km ? a.km.toFixed(1).replace('.', ',') + ' km · ' : ''}${fmt(a.min)}′</small></div>`).join('')
        : (p ? p.sesiones : []).map(s => `<div class="chip">${icoDeporte(s.tipo)} ${esc(s.que)}</div>`).join('')}
    </div>`;
  }
  $('#view-mes').innerHTML = cabecera('mes', `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`) +
    `<div class="mes">${celdas}</div>
     <div class="leyenda"><span class="chip">planificado</span><span class="chip hecha">registrado en el reloj</span>
       ${calendarios().map(c => `<span class="chip ev" style="--c:${colorCal(c)}">${esc(c)}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- NUTRICION
function pintaNutricion() {
  const l = suma(lunesDe(hoy()), 7 * desfase.nutricion);
  const fs = [0, 1, 2, 3, 4, 5, 6].map(i => suma(l, i));
  const nombres = [];
  fs.forEach(f => (plan(f)?.comidas || []).forEach(c => nombres.includes(c.nombre) || nombres.push(c.nombre)));
  let html = `<div class="ncab"></div>` + fs.map(f => `<div class="ncab ${f === hoy() ? 'es-hoy' : ''}">
      <span class="eyebrow">${nombreDia(f).slice(0, 3)} ${nDia(f)}</span>
      <b>${plan(f) ? fmt(plan(f).objetivo) + ' kcal' : '—'}</b></div>`).join('');
  nombres.forEach(n => {
    html += `<div class="nfila">${ICONO_COMIDA[sinTildes(n)] || '🍴'}<br>${esc(n)}</div>`;
    fs.forEach(f => {
      const c = (plan(f)?.comidas || []).find(x => x.nombre === n), r = c && receta(c.elegida);
      html += `<div class="ncelda ${f === hoy() ? 'es-hoy' : ''}">${c
        ? (r ? `<span>${esc(r.titulo)}</span>` : '<span class="tenue">sin elegir</span>') + `<small>${fmt(c.kcal)} kcal</small>`
        : ''}</div>`;
    });
  });
  if (!nombres.length) html += `<div class="ncelda vacia">Sin plan de comidas para esta semana.</div>`;
  $('#view-nutricion').innerHTML = cabecera('nutricion', 'Comidas · ' + rotuloSemana(l)) + `<div class="nutri">${html}</div>`;
}

// ---------------------------------------------------------------- REVISION
// markdown justo para las revisiones: parrafos, listas, tablas, negrita y `codigo`
function md(txt) {
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const lineas = [];
  for (const l of txt.split('\n')) {
    // una linea sangrada continua la anterior (las listas parten asi sus frases largas)
    if (/^\s+\S/.test(l) && lineas.length && lineas[lineas.length - 1]) lineas[lineas.length - 1] += ' ' + l.trim();
    else lineas.push(l.trim());
  }
  const tipo = l => !l ? '' : l.startsWith('|') ? 'table' : l.startsWith('- ') ? 'ul' : /^\d+\.\s/.test(l) ? 'ol' : 'p';
  let html = '';
  for (let i = 0; i < lineas.length;) {
    const k = tipo(lineas[i]);
    let j = i;
    while (j < lineas.length && tipo(lineas[j]) === k) j++;
    const g = lineas.slice(i, j);
    i = j;
    if (k === 'p') html += `<p>${inl(g.join(' '))}</p>`;
    else if (k === 'ul' || k === 'ol') html += `<${k}>${g.map(l => `<li>${inl(l.replace(/^(- |\d+\.\s)/, ''))}</li>`).join('')}</${k}>`;
    else if (k === 'table') html += '<table>' + g.filter(l => !/^\|[\s|:-]+\|$/.test(l)).map((l, n) =>
      '<tr>' + l.replace(/^\||\|$/g, '').split('|').map(c => n ? `<td>${inl(c.trim())}</td>` : `<th>${inl(c.trim())}</th>`).join('') + '</tr>').join('') + '</table>';
  }
  return html;
}

function pintaRevision() {
  const r = DATA.revision;
  $('#view-revision').innerHTML = !r ? '<div class="card vacio"><p class="serif grande">Aún no hay revisión.</p></div>'
    : `<header class="cab"><h2 class="serif">${esc(r.titulo.replace(/^Revisión\s*/, 'Revisión · '))}</h2></header>
       <div class="revision">${r.secciones.map(s => `<article class="card">
         <h3>${esc(s.titulo)}</h3>${md(s.md)}</article>`).join('')}</div>`;
}

// ---------------------------------------------------------------- MARCO
const PINTA = { hoy: pintaHoy, semana: pintaSemana, mes: pintaMes, nutricion: pintaNutricion, revision: pintaRevision };

function ir(v) {
  vista = PINTA[v] ? v : 'hoy';
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('activa', s.id === 'view-' + vista));
  document.querySelectorAll('.rail-item').forEach(b => b.classList.toggle('activa', b.dataset.go === vista));
  if (location.hash !== '#' + vista) history.replaceState(null, '', '#' + vista);
  pinta();
}
function pinta() {
  if (!DATA) return;
  try { PINTA[vista](); } catch (e) {
    console.error(e);
    $('#view-' + vista).innerHTML = `<div class="aviso">No he podido pintar esta vista: ${esc(e.message)}</div>`;
  }
}

async function carga() {
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DATA = await r.json();
    // opcional: sin calendarios (404 o el workflow sin secret) el kiosko sigue igual
    const ev = await fetch('eventos.json?t=' + Date.now(), { cache: 'no-store' }).catch(() => null);
    if (ev && ev.ok) EVENTOS = (await ev.json()).eventos || [];
    const g = new Date(DATA.generado);
    $('#estado').textContent = `datos del ${g.getDate()}/${g.getMonth() + 1} ${g.toTimeString().slice(0, 5)}`;
    $('#estado').classList.remove('mal');
  } catch (e) {
    // sin red se queda con lo ultimo que tenia: la pared no se queda en blanco
    $('#estado').textContent = 'sin conexión · ' + e.message;
    $('#estado').classList.add('mal');
  }
  pinta();
}

let ultimoDia = hoy(), temporizador = null;
function reloj() {
  const d = new Date();
  $('#reloj').innerHTML = `<b>${d.toTimeString().slice(0, 5)}</b>`;
  if (hoy() !== ultimoDia) { ultimoDia = hoy(); pinta(); }     // a medianoche cambia "hoy"
}
function actividad() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { Object.keys(desfase).forEach(k => desfase[k] = 0); ir('hoy'); }, VUELTA_A_HOY_MS);
}

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'), mv = e.target.closest('[data-mover]');
  if (go) ir(go.dataset.go);
  if (mv) {
    const [k, n] = mv.dataset.mover.split(':');
    desfase[k] = +n ? desfase[k] + +n : 0;
    pinta();
  }
});
// deslizar la tarjeta de comidas: izquierda = dia siguiente, derecha = anterior
let x0 = null;
document.addEventListener('pointerdown', e => { x0 = e.target.closest('.comidas') ? e.clientX : null; });
document.addEventListener('pointerup', e => {
  const dx = x0 == null ? 0 : e.clientX - x0;
  x0 = null;
  if (Math.abs(dx) > 60) { desfase.comida -= Math.sign(dx); pinta(); }
});
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, actividad));
reloj();
setInterval(reloj, 10e3);
setInterval(carga, RECARGA_MS);
ir(location.hash.slice(1) || 'hoy');
carga();
actividad();
