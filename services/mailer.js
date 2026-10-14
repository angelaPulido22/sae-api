const nodemailer = require('nodemailer');
const { Notificacion } = require('../models');
const { ahora, siguienteId } = require('../utils/helpers');

const haySMTP = !!process.env.SMTP_HOST;
const transporter = haySMTP
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    })
  : nodemailer.createTransport({ jsonTransport: true }); // modo simulado

/**
 * Envía un correo y SIEMPRE deja registro en "notificaciones_correo".
 * Si el envío falla, estado_envio = "Fallido" (permite reintentar).
 */
async function enviarYRegistrar({ tipo, solicitud_id = null, caso_id = null, encargada_id = null,
                                   correo_destino, asunto, contenido_resumen, html, text }) {
  let estado_envio = 'Enviado';
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'Atención al Estudiante <no-reply@uni.edu.co>',
      to: correo_destino, subject: asunto, text, html
    });
    if (!haySMTP) console.log(`\n[CORREO SIMULADO] Para: ${correo_destino}\nAsunto: ${asunto}\n${text}\n`);
  } catch (err) {
    console.error('Error enviando correo:', err.message);
    estado_envio = 'Fallido';
  }
  const { fecha, hora } = ahora();
  const notificacion = await Notificacion.create({
    notificacion_id: await siguienteId(Notificacion, 'notificacion_id', 'N'),
    tipo, solicitud_id, caso_id, destinatario: 'estudiante', correo_destino, encargada_id,
    asunto, contenido_resumen, fecha_envio: fecha, hora_envio: hora, estado_envio
  });
  return notificacion;
}

module.exports = { enviarYRegistrar };
