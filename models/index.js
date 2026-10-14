const mongoose = require('mongoose');
const { Schema } = mongoose;
const { TIPOS_CASO, ESTADOS_CASO, PRIORIDADES } = require('../utils/config');

const Estudiante = mongoose.model('Estudiante', new Schema({
  codigo: { type: String, required: true, unique: true },
  nombre: String, documento: String, carrera: String, semestre: Number, telefono: String,
  email: { type: String, required: true }
}, { collection: 'estudiantes', versionKey: false }));

const Encargada = mongoose.model('Encargada', new Schema({
  encargada_id: { type: String, required: true, unique: true },
  nombre: String,
  rol: { type: String, enum: ['Encargada', 'Administrador'] },
  telefono: String, email: String,
  password_hash: { type: String, select: false }   // bcrypt; nunca se devuelve por defecto
}, { collection: 'encargadas', versionKey: false }));

const Solicitud = mongoose.model('Solicitud', new Schema({
  solicitud_id: { type: String, required: true, unique: true },
  codigo_estudiante: { type: String, required: true, index: true },
  tipo_caso: { type: String, enum: TIPOS_CASO, required: true },
  motivo: { type: String, required: true },
  descripcion: { type: String, required: true },
  fecha_solicitud: String,
  hora_solicitud: String,
  estado_verificacion: { type: String, enum: ['Pendiente', 'Confirmada', 'Expirada'], default: 'Pendiente', index: true },
  token_confirmacion: { type: String, required: true, unique: true },   // HU-15: índice único
  token_expira: String,                                                  // ISO local, p. ej. 2026-08-20T15:20:00
  fecha_confirmacion: { type: String, default: null },
  caso_id: { type: String, default: null },
  documentos_adjuntos: [{ _id: false, nombre_archivo: String }]         // soportes subidos con la solicitud
}, { collection: 'solicitudes', versionKey: false }));

const Caso = mongoose.model('Caso', new Schema({
  caso_id: { type: String, required: true, unique: true },
  codigo_estudiante: { type: String, required: true, index: true },
  encargada_id: { type: String, required: true, index: true },
  tipo_caso: { type: String, enum: TIPOS_CASO, required: true },
  motivo: String,
  descripcion: String,
  fecha: String,
  hora: String,
  prioridad: { type: String, enum: PRIORIDADES, default: 'Media' },
  solicitud_id: { type: String, default: null },
  estado_actual: { type: String, enum: ESTADOS_CASO, default: 'Pendiente' },
  historial_estado: [{ _id: false, estado: String, fecha: String, hora: String, encargada_id: String }],
  observaciones: [{ _id: false, texto: String, fecha: String, hora: String, encargada_id: String }],
  documentos_adjuntos: [{ _id: false, nombre_archivo: String, fecha_subida: String, hora_subida: String, subido_por: String }],
  // HU-12: trazabilidad de reasignaciones
  historial_asignacion: [{ _id: false, encargada_anterior: String, encargada_nueva: String, fecha: String, hora: String, asignado_por: String }]
}, { collection: 'casos', versionKey: false }));

const Notificacion = mongoose.model('Notificacion', new Schema({
  notificacion_id: { type: String, required: true, unique: true },
  tipo: { type: String, enum: ['confirmacion_solicitud', 'avance_caso'] },
  solicitud_id: { type: String, default: null },
  caso_id: { type: String, default: null },
  destinatario: { type: String, default: 'estudiante' },
  correo_destino: String,
  encargada_id: { type: String, default: null },
  asunto: String,
  contenido_resumen: String,
  fecha_envio: String,
  hora_envio: String,
  estado_envio: { type: String, enum: ['Enviado', 'Fallido'] }
}, { collection: 'notificaciones_correo', versionKey: false }));

module.exports = { Estudiante, Encargada, Solicitud, Caso, Notificacion };
