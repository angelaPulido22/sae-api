const { Caso, Encargada, Estudiante } = require('../models');

/** Casos activos (no resueltos) por encargada, incluyendo las que tienen 0 */
async function cargaEncargadas() {
  const [encargadas, cargas] = await Promise.all([
    Encargada.find({ rol: 'Encargada' }).sort({ encargada_id: 1 }).lean(),
    Caso.aggregate([{ $match: { estado_actual: { $ne: 'Resuelta' } } }, { $group: { _id: '$encargada_id', n: { $sum: 1 } } }])
  ]);
  const mapa = Object.fromEntries(cargas.map((c) => [c._id, c.n]));
  return encargadas.map((e) => ({ encargada_id: e.encargada_id, nombre: e.nombre, casos_activos: mapa[e.encargada_id] || 0 }));
}

/** Asignación automática: la encargada con menos casos activos */
async function encargadaConMenorCarga() {
  const carga = await cargaEncargadas();
  if (!carga.length) throw new Error('No hay encargadas registradas');
  return carga.sort((a, b) => a.casos_activos - b.casos_activos)[0].encargada_id;
}

/** Agrega datos del estudiante y el origen (remota/presencial) a una lista de casos */
async function enriquecer(casos) {
  const codigos = [...new Set(casos.map((c) => c.codigo_estudiante))];
  const ests = await Estudiante.find({ codigo: { $in: codigos } }).lean();
  const mapa = Object.fromEntries(ests.map((e) => [e.codigo, e]));
  return casos.map((c) => ({
    ...c,
    estudiante: mapa[c.codigo_estudiante]
      ? { nombre: mapa[c.codigo_estudiante].nombre, carrera: mapa[c.codigo_estudiante].carrera, email: mapa[c.codigo_estudiante].email }
      : null,
    origen: c.solicitud_id ? 'Solicitud remota' : 'Presencial'
  }));
}

module.exports = { cargaEncargadas, encargadaConMenorCarga, enriquecer };
