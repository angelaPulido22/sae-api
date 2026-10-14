// importa las herramientas necesarias para manejar rutas, autenticación y modelos de datos
const router = require('express').Router();
const crypto = require('crypto');
const { Solicitud, Estudiante } = require('../models');
const { TIPOS_CASO, TOKEN_VIGENCIA_HORAS } = require('../utils/config');
// funciones auxiliares para manejar fechas, generar IDs y escapar caracteres especiales
const {
   wrap,
    ahora,
     isoLocalMasHoras, 
     isoLocalADate, 
     siguienteId, 
     esc 
    } = require('../utils/helpers');
const { enviarYRegistrar } = require('../services/mailer');
const {
   confirmarToken, 
   expirarVencidas
   } = require('../services/solicitudes');

   // funcion que determina la direccion principal para el enlace de confirmacion en el correo electronico, si no se encuentra la variable de entorno BASE_URL, se usa localhost con el puerto 3000
const baseUrl = () => 
  process.env.BASE_URL || 
`http://localhost:${process.env.PORT || 3000}`;


// funcion que envia un correo de confirmacion al estudiante con un enlace unico para confirmar la solicitud, el enlace expira despues de un tiempo determinado
// recibe dos parametros: sol (objeto de la solicitud) y estudiante (objeto del estudiante)
async function enviarCorreoConfirmacion(sol, estudiante) {
  //construye el enlace 
  const enlace = 
  `${baseUrl()}/api/solicitudes/confirmar/${sol.token_confirmacion}`;
  
  const resumen = `Enlace de confirmación para: ${sol.descripcion}`;

  return enviarYRegistrar({
    //datos del correo
    tipo: 'confirmacion_solicitud',
     solicitud_id: sol.solicitud_id, 
     correo_destino: estudiante.email,
    asunto: `Confirma tu solicitud de ${sol.tipo_caso}`,
     contenido_resumen: resumen,

     //contenido del correo en texto plano y en HTML
    text: `Hola ${estudiante.nombre}, recibimos tu solicitud de ${sol.tipo_caso}.
    \nConfírmala en las próximas ${TOKEN_VIGENCIA_HORAS} horas:\n${enlace}`,
    html: `<p>Hola <b>${esc(estudiante.nombre)}</b>,</p><p>Recibimos tu solicitud de <b>${esc(sol.tipo_caso)}</b>.</p>
           <p>Confírmala en las próximas ${TOKEN_VIGENCIA_HORAS} horas:</p><p><a href="${enlace}">Confirmar mi solicitud</a></p>`
  });
}

// HU-01 + HU-02 + HU-15: radicar solicitud remota
// rutas para registrar solicitudes, Esta ruta recibe una petición POST para registrar una solicitud nueva.
router.post('/', wrap(async (req, res) => {
  // obtiene los datos de la solicitud del cuerpo de la petición
  const { codigo_estudiante,
     tipo_caso, 
     motivo,
      descripcion,
       documentos_adjuntos
       } = req.body;

       // valida que los campos obligatorios estén presentes y no estén vacíos, si falta alguno, devuelve un error 400 (solicitud incorrecta)
  if (!codigo_estudiante ||
     !motivo?.trim() ||
      !descripcion?.trim()
    )
    return res.status(400).json({
       error: 'codigo_estudiante, motivo y descripcion son obligatorios' 
      });
  
      // comprueba que el tipo de caso sea uno de los permitidos, si no lo es, devuelve un error 400 (solicitud incorrecta)
      if (!TIPOS_CASO.includes(tipo_caso))
    return res.status(400).json({
   error: `tipo_caso inválido. Opciones: ${TIPOS_CASO.join(', ')}` 
  });

  // comprobar si el estudiante existe en la base de datos, si no lo hace, devuelve un error 404 (no encontrado)
  const estudiante = await Estudiante.findOne({
     codigo: codigo_estudiante
     });
  
     if (!estudiante) 
      return res.status(404).json({
     error: 'Estudiante no encontrado' 
    });

    // fecha y hora del registro de la solicitud, se usa la función ahora() para obtener la fecha y hora actual en formato local
  const { fecha, hora } = ahora();
  let sol;

  // crear solicitud y genera su identificador único, si hay un error de duplicado (código 11000), intenta de nuevo hasta 3 veces, si no se puede crear la solicitud, devuelve un error 500 (error interno del servidor)
  for (let i = 0; i < 3 && !sol; i++) {
    try {
      sol = await Solicitud.create({
        // función auxiliar genera el identificador de la solicitud
        solicitud_id: await siguienteId(
          Solicitud, 
          'solicitud_id', 
          'S'
        ),
        codigo_estudiante,
         tipo_caso, 
         motivo: motivo.trim(),
          descripcion: descripcion.trim(),
        fecha_solicitud: fecha, 
        hora_solicitud: hora,
        // despues se establecen los datos de confirmacion
        estado_verificacion: 'Pendiente',
        // genera un token aleatorio de 16 bytes en hexadecimal para usarlo como token de confirmación
        token_confirmacion: crypto.randomBytes(16).toString('hex'),
        // vencimiento del token
        token_expira: isoLocalMasHoras(TOKEN_VIGENCIA_HORAS),
        fecha_confirmacion: null, caso_id: null,
        // guarda los documentos adjuntos
        documentos_adjuntos: (documentos_adjuntos || []).filter(Boolean).map((n) => ({ nombre_archivo: String(n) }))
      });
    } catch (e) { if (e.code !== 11000) throw e; }
  }
  // comprobar si la solicitud se creó correctamente, si no, devuelve un error 500 (error interno del servidor)
  if (!sol)
     return res.status(500).json({ 
    error: 'No se pudo registrar la solicitud'
   });

  const notif = await enviarCorreoConfirmacion(sol, estudiante);
  res.status(201).json({
    solicitud_id: sol.solicitud_id,
     estado_verificacion: sol.estado_verificacion,
      token_expira: sol.token_expira, 
      correo_enviado_a: estudiante.email, 
      estado_envio: notif.estado_envio,
      mensaje: notif.estado_envio === 'Enviado'
      ? 'Solicitud registrada. Revisa tu correo institucional para confirmarla.'
      : 'Solicitud registrada, pero el correo falló. Puedes reintentar el envío.'
  });
}));

// HU-02: reintentar envío cuando quedó "Fallido"
// define la ruta para reenviar el correo de confirmación de una solicitud pendiente
router.post('/:solicitud_id/reenviar', wrap(async (req, res) => {
  const sol = await Solicitud.findOne({ solicitud_id: req.params.solicitud_id });
  if (!sol) return
   res.status(404).json({
     error: 'Solicitud no encontrada'
     });
  if (
    sol.estado_verificacion !== 'Pendiente' ||
     isoLocalADate(sol.token_expira) < new Date()
    )
    return res.status(409).json({
       error: 'La solicitud ya no está pendiente de confirmación' 
      });
  
      const estudiante = await Estudiante.findOne({ 
        codigo: sol.codigo_estudiante 
      });
  
      const notif = await enviarCorreoConfirmacion(sol, estudiante);
  
      res.json({ estado_envio: notif.estado_envio });
}));

// HU-03: enlace del correo. Responde JSON con el resultado (200 ok, 404 inválido, 409 ya usado, 410 expirado)
// Permite que el estudiante confirme su solicitud abriendo el enlace que recibió por correo electrónico
router.get('/confirmar/:token', wrap(async (req, res) => {
  const r = await confirmarToken(req.params.token);

  res.status(r.codigo).json({ 
    ok: r.ok,
     mensaje: r.mensaje, 
     ...(r.caso_id && { caso_id: r.caso_id })
     });
}));

// Consulta del estudiante (no expone el token)
// Permite consultar las solicitudes que tiene registradas un estudiante determinado
router.get('/estudiante/:codigo', wrap(async (req, res) => {
  await expirarVencidas();

  const lista = await Solicitud.find({
     codigo_estudiante: req.params.codigo
     })
    .select('-token_confirmacion')
    .sort({ solicitud_id: -1 })
    .lean();
  
    res.json(lista);
}));

module.exports = router;
