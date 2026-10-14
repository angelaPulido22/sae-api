const router = require('express').Router();
const { Caso, Estudiante } = require('../models');
const { ESTADOS_CASO, TIPOS_CASO, PRIORIDADES, PRIORIDAD_POR_TIPO } = require('../utils/config');
const { wrap, ahora, siguienteId } = require('../utils/helpers');
const { autenticar, rol } = require('../middleware/auth');
const { enriquecer } = require('../services/casos');
const { enviarYRegistrar } = require('../services/mailer');

router.use(autenticar);

/** Carga el caso y valida que pertenezca a la encargada autenticada */
async function casoPropio(req, res) {
  const caso = await Caso.findOne({ caso_id: req.params.caso_id });
  if (!caso) { res.status(404).json({ error: 'Caso no encontrado' }); return null; }
  if (caso.encargada_id !== req.usuario.encargada_id) {
    res.status(403).json({ error: 'Este caso está asignado a otra encargada' }); return null;
  }
  return caso;
}

// HU-06: casos de la encargada autenticada (el admin puede ver todos o filtrar por encargada_id)
router.get('/', rol('Encargada', 'Administrador'), wrap(async (req, res) => {
  const { tipo_caso, prioridad, estado_actual, encargada_id } = req.query;
  const filtro = {};
  if (req.usuario.rol === 'Encargada') filtro.encargada_id = req.usuario.encargada_id;
  else if (encargada_id) filtro.encargada_id = encargada_id;
  if (tipo_caso) filtro.tipo_caso = tipo_caso;
  if (prioridad) filtro.prioridad = prioridad;
  if (estado_actual) filtro.estado_actual = estado_actual;
  const casos = await Caso.find(filtro).sort({ fecha: -1, caso_id: -1 }).lean();
  res.json(await enriquecer(casos));
}));

// Caso presencial: la encargada lo crea directamente (sin solicitud ni correo) y queda asignado a ella
router.post('/', rol('Encargada'), wrap(async (req, res) => {
  const { codigo_estudiante, tipo_caso, motivo, descripcion, prioridad, documentos_adjuntos } = req.body;
  if (!codigo_estudiante || !motivo?.trim() || !descripcion?.trim())
    return res.status(400).json({ error: 'codigo_estudiante, motivo y descripcion son obligatorios' });
  if (!TIPOS_CASO.includes(tipo_caso))
    return res.status(400).json({ error: `tipo_caso inválido. Opciones: ${TIPOS_CASO.join(', ')}` });
  if (prioridad && !PRIORIDADES.includes(prioridad))
    return res.status(400).json({ error: `prioridad inválida. Opciones: ${PRIORIDADES.join(', ')}` });
  if (!(await Estudiante.exists({ codigo: codigo_estudiante })))
    return res.status(404).json({ error: 'Estudiante no encontrado' });

  const { fecha, hora } = ahora();
  const encargada_id = req.usuario.encargada_id;
  for (let i = 0; i < 3; i++) {
    try {
      const caso = await Caso.create({
        caso_id: await siguienteId(Caso, 'caso_id', 'C'),
        codigo_estudiante, encargada_id, tipo_caso,
        motivo: motivo.trim(), descripcion: descripcion.trim(), fecha, hora,
        prioridad: prioridad || PRIORIDAD_POR_TIPO[tipo_caso] || 'Media',
        solicitud_id: null, estado_actual: 'Pendiente',
        historial_estado: [{ estado: 'Pendiente', fecha, hora, encargada_id }],
        observaciones: [],
        documentos_adjuntos: (documentos_adjuntos || []).filter(Boolean).map((n) => ({
          nombre_archivo: String(n), fecha_subida: fecha, hora_subida: hora, subido_por: encargada_id }))
      });
      return res.status(201).json(caso);
    } catch (e) { if (e.code !== 11000) throw e; }
  }
  res.status(500).json({ error: 'No se pudo generar el caso' });
}));

// HU-11: historial completo de un estudiante (declarada antes de /:caso_id)
router.get('/estudiante/:codigo', rol('Encargada', 'Administrador'), wrap(async (req, res) => {
  const estudiante = await Estudiante.findOne({ codigo: req.params.codigo }).lean();
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' });
  const casos = await Caso.find({ codigo_estudiante: req.params.codigo }).sort({ fecha: -1 }).lean();
  res.json({ estudiante, total_casos: casos.length, casos: await enriquecer(casos) });
}));

router.get('/:caso_id', rol('Encargada', 'Administrador'), wrap(async (req, res) => {
  const caso = await Caso.findOne({ caso_id: req.params.caso_id }).lean();
  if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
  res.json((await enriquecer([caso]))[0]);
}));

// HU-07: nueva observación (fecha/hora automáticas, solo se agrega)
router.post('/:caso_id/observaciones', rol('Encargada'), wrap(async (req, res) => {
  const caso = await casoPropio(req, res); if (!caso) return;
  const texto = req.body.texto?.trim();
  if (!texto) return res.status(400).json({ error: 'texto es obligatorio' });
  const { fecha, hora } = ahora();
  const obs = { texto, fecha, hora, encargada_id: req.usuario.encargada_id };
  await Caso.updateOne({ caso_id: caso.caso_id }, { $push: { observaciones: obs } });
  res.status(201).json(obs);
}));

// HU-08: adjuntar documento (registra nombre, fecha, hora y quién lo subió)
router.post('/:caso_id/documentos', rol('Encargada'), wrap(async (req, res) => {
  const caso = await casoPropio(req, res); if (!caso) return;
  const nombre = req.body.nombre_archivo?.trim();
  if (!nombre) return res.status(400).json({ error: 'nombre_archivo es obligatorio' });
  const { fecha, hora } = ahora();
  const doc = { nombre_archivo: nombre, fecha_subida: fecha, hora_subida: hora, subido_por: req.usuario.encargada_id };
  await Caso.updateOne({ caso_id: caso.caso_id }, { $push: { documentos_adjuntos: doc } });
  res.status(201).json(doc);
}));

// HU-09: cambio de estado (historial acumulativo + estado_actual)
router.patch('/:caso_id/estado', rol('Encargada'), wrap(async (req, res) => {
  const caso = await casoPropio(req, res); if (!caso) return;
  const { estado } = req.body;
  if (!ESTADOS_CASO.includes(estado)) return res.status(400).json({ error: `estado inválido. Opciones: ${ESTADOS_CASO.join(', ')}` });
  if (estado === caso.estado_actual) return res.status(400).json({ error: `El caso ya está en estado "${estado}"` });
  const { fecha, hora } = ahora();
  const entrada = { estado, fecha, hora, encargada_id: req.usuario.encargada_id };
  await Caso.updateOne({ caso_id: caso.caso_id }, { $set: { estado_actual: estado }, $push: { historial_estado: entrada } });
  res.json({ caso_id: caso.caso_id, estado_actual: estado, entrada });
}));

// HU-05 + HU-10: enviar por correo una observación elegida (por índice) al estudiante
router.post('/:caso_id/observaciones/:indice/enviar', rol('Encargada'), wrap(async (req, res) => {
  const caso = await casoPropio(req, res); if (!caso) return;
  const obs = caso.observaciones[Number(req.params.indice)];
  if (!obs) return res.status(404).json({ error: 'Observación no encontrada' });
  const estudiante = await Estudiante.findOne({ codigo: caso.codigo_estudiante });
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' });

  const notif = await enviarYRegistrar({
    tipo: 'avance_caso', caso_id: caso.caso_id, encargada_id: req.usuario.encargada_id,
    correo_destino: estudiante.email,
    asunto: `Avance de tu caso ${caso.caso_id} (${caso.tipo_caso})`,
    contenido_resumen: obs.texto,
    text: `Hola ${estudiante.nombre},\n\nAvance de tu caso ${caso.caso_id} (${caso.tipo_caso}), registrado el ${obs.fecha} a las ${obs.hora}:\n\n${obs.texto}\n\nAtención al Estudiante`
  });
  res.status(notif.estado_envio === 'Enviado' ? 201 : 502).json(notif);
}));

module.exports = router;
