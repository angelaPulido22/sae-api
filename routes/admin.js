const router = require('express').Router();
const { Caso, Encargada, Solicitud } = require('../models');
const { TIPOS_CASO } = require('../utils/config');
const { wrap, ahora, fechaHoraADate } = require('../utils/helpers');
const { autenticar, rol } = require('../middleware/auth');
const { cargaEncargadas, enriquecer } = require('../services/casos');
const { expirarVencidas } = require('../services/solicitudes');

router.use(autenticar, rol('Administrador'));

// HU-12: casos activos por encargada (se consulta antes de asignar)
router.get('/carga', wrap(async (req, res) => res.json(await cargaEncargadas())));

// HU-12: reasignar un caso (queda en historial_asignacion)
router.patch('/casos/:caso_id/asignar', wrap(async (req, res) => {
  const { encargada_id } = req.body;
  
  const nueva = await Encargada.findOne({ encargada_id, rol: 'Encargada' });
  if (!nueva) return res.status(400).json({ error: 'encargada_id no corresponde a una encargada válida' });
  const caso = await Caso.findOne({ caso_id: req.params.caso_id });
  if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
  if (caso.encargada_id === encargada_id) return res.status(400).json({ error: 'El caso ya está asignado a esa encargada' });
  const { fecha, hora } = ahora();
  await Caso.updateOne({ caso_id: caso.caso_id }, {
    $set: { encargada_id },
    $push: { historial_asignacion: { encargada_anterior: caso.encargada_id, encargada_nueva: encargada_id, fecha, hora, asignado_por: req.usuario.encargada_id } }
  });
  res.json({ caso_id: caso.caso_id, encargada_anterior: caso.encargada_id, encargada_nueva: encargada_id });
}));

// HU-13: panel de pendientes por prioridad y tiempo de espera
router.get('/panel-pendientes', wrap(async (req, res) => {
  const casos = await enriquecer(await Caso.find({ estado_actual: 'Pendiente' }).lean());
  const ahoraMs = Date.now();
  const lista = casos.map((c) => {
    const horas = Math.max(0, (ahoraMs - fechaHoraADate(c.fecha, c.hora).getTime()) / 3600e3);
    return { caso_id: c.caso_id, codigo_estudiante: c.codigo_estudiante, estudiante: c.estudiante?.nombre,
             tipo_caso: c.tipo_caso, prioridad: c.prioridad, encargada_id: c.encargada_id,
             fecha: c.fecha, hora: c.hora, espera_horas: Math.round(horas), espera_dias: Math.floor(horas / 24) };
  }).sort((a, b) => b.espera_horas - a.espera_horas); // mayor espera primero dentro de cada prioridad
  const grupos = { Alta: [], Media: [], Baja: [] };
  lista.forEach((c) => (grupos[c.prioridad] || grupos.Media).push(c));
  res.json({ total: lista.length, ...grupos });
}));

// HU-14: reporte de solicitudes expiradas (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&tipo_caso=)
router.get('/reporte-expiradas', wrap(async (req, res) => {
  await expirarVencidas();
  const { desde, hasta, tipo_caso } = req.query;
  if (tipo_caso && !TIPOS_CASO.includes(tipo_caso)) return res.status(400).json({ error: 'tipo_caso inválido' });
  const filtro = {};
  if (desde || hasta) filtro.fecha_solicitud = { ...(desde && { $gte: desde }), ...(hasta && { $lte: hasta }) };
  if (tipo_caso) filtro.tipo_caso = tipo_caso;

  const [expiradas, total] = await Promise.all([
    Solicitud.find({ ...filtro, estado_verificacion: 'Expirada' }).select('-token_confirmacion').sort({ fecha_solicitud: -1 }).lean(),
    Solicitud.countDocuments(filtro)
  ]);
  const contar = (fn) => expiradas.reduce((acc, s) => { const k = fn(s); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  res.json({
    total_solicitudes: total, total_expiradas: expiradas.length,
    porcentaje_expiradas: total ? Math.round((expiradas.length / total) * 1000) / 10 : 0,
    por_tipo: contar((s) => s.tipo_caso),
    por_mes: contar((s) => s.fecha_solicitud.slice(0, 7)),
    solicitudes: expiradas
  });
}));

module.exports = router;
