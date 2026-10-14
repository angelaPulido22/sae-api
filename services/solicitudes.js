const { Solicitud, Caso } = require('../models');
const { PRIORIDAD_POR_TIPO } = require('../utils/config');
const { ahora, isoLocalADate, siguienteId } = require('../utils/helpers');
const { encargadaConMenorCarga } = require('./casos');

/** HU-16 / HU-04: marca como Expirada toda solicitud Pendiente con token vencido */
async function expirarVencidas() {
  const r = await Solicitud.updateMany(
    { estado_verificacion: 'Pendiente', token_expira: { $lt: ahora().iso } },
    { $set: { estado_verificacion: 'Expirada' } }
  );
  return r.modifiedCount;
}

/** Crea el caso oficial a partir de una solicitud ya confirmada (HU-03) */
async function crearCasoDesdeSolicitud(sol) {
  const { fecha, hora } = ahora();
  const encargada_id = await encargadaConMenorCarga();
  for (let intento = 0; intento < 3; intento++) {
    try {
      return await Caso.create({
        caso_id: await siguienteId(Caso, 'caso_id', 'C'),
        codigo_estudiante: sol.codigo_estudiante,
        encargada_id,
        tipo_caso: sol.tipo_caso,
        motivo: sol.motivo,
        descripcion: sol.descripcion,
        fecha, hora,
        prioridad: PRIORIDAD_POR_TIPO[sol.tipo_caso] || 'Media',
        solicitud_id: sol.solicitud_id,
        estado_actual: 'Pendiente',
        historial_estado: [{ estado: 'Pendiente', fecha, hora, encargada_id }],
        observaciones: [],
        documentos_adjuntos: (sol.documentos_adjuntos || []).map((d) => ({
          nombre_archivo: d.nombre_archivo, fecha_subida: fecha, hora_subida: hora, subido_por: 'estudiante'
        }))
      });
    } catch (e) {
      if (e.code !== 11000) throw e; // colisión de caso_id: reintentar
    }
  }
  throw new Error('No se pudo generar el caso');
}

/**
 * HU-03: valida token (existe, no usado, no expirado), confirma la solicitud,
 * crea el caso y enlaza caso_id de vuelta.
 */
async function confirmarToken(token) {
  const sol = await Solicitud.findOne({ token_confirmacion: token });
  if (!sol) return { ok: false, codigo: 404, mensaje: 'El enlace de confirmación no es válido.' };
  if (sol.estado_verificacion === 'Confirmada')
    return { ok: false, codigo: 409, mensaje: 'Esta solicitud ya fue confirmada anteriormente.' };

  if (sol.estado_verificacion === 'Expirada' || isoLocalADate(sol.token_expira) < new Date()) {
    await Solicitud.updateOne({ _id: sol._id, estado_verificacion: 'Pendiente' }, { $set: { estado_verificacion: 'Expirada' } });
    return { ok: false, codigo: 410, mensaje: 'El enlace expiró. Puedes radicar nuevamente tu solicitud.' };
  }

  // "Reclamo" atómico: evita doble confirmación si se hace clic dos veces a la vez
  const reclamada = await Solicitud.findOneAndUpdate(
    { _id: sol._id, estado_verificacion: 'Pendiente' },
    { $set: { estado_verificacion: 'Confirmada', fecha_confirmacion: ahora().iso } },
    { new: true }
  );
  if (!reclamada) return { ok: false, codigo: 409, mensaje: 'Esta solicitud ya fue confirmada anteriormente.' };

  try {
    const caso = await crearCasoDesdeSolicitud(reclamada);
    await Solicitud.updateOne({ _id: sol._id }, { $set: { caso_id: caso.caso_id } });
    return { ok: true, codigo: 200, mensaje: 'Tu solicitud fue confirmada y ya es un caso oficial.', caso_id: caso.caso_id };
  } catch (err) {
    // revertir para que el estudiante pueda reintentar
    await Solicitud.updateOne({ _id: sol._id }, { $set: { estado_verificacion: 'Pendiente', fecha_confirmacion: null } });
    throw err;
  }
}

module.exports = { expirarVencidas, confirmarToken };
