module.exports = {
  TIPOS_CASO: ['Reingreso', 'Homologación', 'Cancelación', 'Suficiencia', 'Preparatorio', 'Trabajo de grado'],
  ESTADOS_CASO: ['Pendiente', 'En proceso', 'Resuelta'],
  PRIORIDADES: ['Alta', 'Media', 'Baja'],
  // Prioridad inicial al convertir una solicitud en caso (ajustable)
  PRIORIDAD_POR_TIPO: {
    'Reingreso': 'Alta',
    'Trabajo de grado': 'Alta',
    'Cancelación': 'Media',
    'Homologación': 'Media',
    'Preparatorio': 'Media',
    'Suficiencia': 'Baja'
  },
  TOKEN_VIGENCIA_HORAS: 24
};
