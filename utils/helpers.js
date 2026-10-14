// Colombia es UTC-5 todo el año (sin horario de verano)
const OFFSET_H = 5;

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Fecha/hora actual en Colombia con los formatos de la BD: "2026-08-19", "03:20 PM", "2026-08-19T15:20:00" */
function ahora(date = new Date()) {
  const local = new Date(date.getTime() - OFFSET_H * 3600e3);
  const iso = local.toISOString();
  let h = local.getUTCHours();
  const m = String(local.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { fecha: iso.slice(0, 10), hora: `${String(h).padStart(2, '0')}:${m} ${ampm}`, iso: iso.slice(0, 19) };
}

/** ISO local (sin zona) a N horas desde ahora, p. ej. para token_expira */
function isoLocalMasHoras(horas) {
  return ahora(new Date(Date.now() + horas * 3600e3)).iso;
}

/** "2026-08-19T15:20:00" (hora Colombia) -> Date */
function isoLocalADate(iso) {
  return new Date(`${iso}-0${OFFSET_H}:00`);
}

/** fecha "2026-08-19" + hora "03:20 PM" -> Date */
function fechaHoraADate(fecha, hora) {
  let hh = 0, mm = 0;
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(hora || '');
  if (m) { hh = Number(m[1]) % 12; mm = Number(m[2]); if (m[3].toUpperCase() === 'PM') hh += 12; }
  return new Date(`${fecha}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-0${OFFSET_H}:00`);
}

/** Genera IDs correlativos: C011, S005, N007... */
async function siguienteId(Model, campo, prefijo) {
  const ult = await Model.findOne().sort({ [campo]: -1 })
    .collation({ locale: 'en', numericOrdering: true }).select(campo).lean();
  const n = ult ? parseInt(ult[campo].slice(prefijo.length), 10) + 1 : 1;
  return prefijo + String(n).padStart(3, '0');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { wrap, ahora, isoLocalMasHoras, isoLocalADate, fechaHoraADate, siguienteId, esc };
