// iniciar sesios y consultar la sesion 
const router = require('express').Router(); // rutas independientes para las API
const bcrypt = require('bcryptjs'); // compara contraseñas encriptadas
const { Encargada } = require('../models');
const { wrap } = require('../utils/helpers'); // comprueba el token  y busca el usuario en la base de datos
const { autenticar, firmarToken } = require('../middleware/auth');

// Bloqueo simple por intentos fallidos (en memoria): 5 fallos => 15 min
const intentos = new Map();
const MAX_INTENTOS = 5, BLOQUEO_MS = 15 * 60e3;
// prepara el texto, escapa los caracteres especiales para usarlo en una expresión regular
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// funcion que recibe un usuario y crea un objeto con los datos públicos del usuario (sin la contraseña)
const publico = (u) => ({
   encargada_id: u.encargada_id,
    nombre: u.nombre, 
    rol: u.rol, 
    email: u.email }
  );

// ruta de inicio de inicio de sesion 
router.post('/login', wrap(async (req, res) => {
  // recibe usuario
  const entrada = String(req.body.usuario || '').trim();
  // recibe contraseña (extraen)
  const password = String(req.body.password || '');
  if (!entrada || !password) return res.status(400).json({ error: 'Ingresa tu usuario y contraseña' });

  const clave = `${req.ip}|${entrada.toLowerCase()}`;
  // comprueba si el usuario ha superado el límite de intentos fallidos y si es así, devuelve un error 429 (demasiadas solicitudes)
  let reg = intentos.get(clave);
  if (reg?.hasta && reg.hasta <= Date.now()) {
     intentos.delete(clave);
      reg = null; 
    }
  if (reg?.hasta) 
    return res.status(429).json({
   error: 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.'
   });

   // buscar encargada en mongoDB
   // busquedad exacta por medio de espresiones regulares
  const exacto = new RegExp(`^${escRe(entrada)}$`, 'i');
  // busca por correo o por nombre
  const u = await Encargada.findOne({
     $or: [
      { email: exacto },
       { nombre: exacto }
      ]
     }).select('+password_hash');
     // comprueba si la contraseña es correcta 
  const ok = !!(
    u &&
     u.password_hash && 
     await bcrypt.compare(password, u.password_hash)
    );

  if (!ok) {
    reg = reg || { n: 0 };
    if (++reg.n >= MAX_INTENTOS) reg.hasta = Date.now() + BLOQUEO_MS;
    intentos.set(clave, reg);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  intentos.delete(clave);
  res.json({ token: firmarToken(u), usuario: publico(u) });
}));

// Restaurar sesión desde el token guardado en el navegador
router.get('/me', autenticar, (req, res) => res.json({ usuario: publico(req.usuario) }));

module.exports = router;
