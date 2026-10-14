// un middleware funcional para autenticar usuarios mediante tokens JWT (datos de sesión) y verificar roles de usuario

const jwt = require('jsonwebtoken'); //importa libreria para generar y verificar tokens JWT
const crypto = require('crypto');
const { Encargada } = require('../models');// importa el modelo de datos Encargada para poder buscar usuarios en la base de datos
const { wrap } = require('../utils/helpers');

if (!process.env.JWT_SECRET) console.warn(' JWT_SECRET no está definido en .env: se usa uno temporal y las sesiones se cierran al reiniciar el servidor.');
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const EXPIRA = process.env.JWT_EXPIRES || '8h';

// funcion que genera el token 
const firmarToken = (usuario) =>
   jwt.sign(
    { id: usuario.encargada_id },
     SECRET, //firma el token con la clave secreta
      { expiresIn: EXPIRA } // establece el tiempo de expiración del token
    );

/** Exige `Authorization: Bearer <token>` y carga req.usuario desde la BD */

//req: información de la solicitud HTTP, res: objeto de respuesta HTTP, next: función que pasa el control al siguiente middleware
const autenticar = wrap(async (req, res, next) => {
  const m = /^Bearer (.+)$/.exec(req.header('authorization') || '');
  if (!m) return res.status(401).json({ error: 'Debes iniciar sesión' });
  let payload;
  try { payload = jwt.verify(m[1], SECRET); }
  catch { return res.status(401).json({ error: 'Sesión inválida o expirada' }); }
  // buscar usuario en la base de datos por su id (encargada_id) y cargarlo en req.usuario
  const usuario = await Encargada
  .findOne({ encargada_id: payload.id })
  .lean();
  // comprobar que el usuario existe; si no, devolver error 401 (no autorizado)
  if (!usuario) return res.status(401).json({ error: 'Usuario no válido' });
  req.usuario = usuario;
  next();
});

// funcion que restringe rutas o ciertos roles
const rol = (...roles) => (req, res, next) =>
  roles.includes(req.usuario.rol) ? next() : res.status(403).json({ error: `Requiere rol: ${roles.join(' o ')}` });

module.exports = { autenticar, rol, firmarToken };
