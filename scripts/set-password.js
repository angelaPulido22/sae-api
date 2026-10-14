/**
 * Asigna contraseñas (cifradas con bcrypt) a la colección "encargadas".
 *   node scripts/set-password.js                 -> da PASSWORD_INICIAL a quienes aún no tienen
 *   node scripts/set-password.js E003 MiClave123 -> cambia la contraseña de un usuario
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Encargada } = require('../models');

const [id, clave] = process.argv.slice(2);
const INICIAL = process.env.PASSWORD_INICIAL || 'Sae2026*';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/SAE');
  console.log('Base de datos:', mongoose.connection.name);
  if (id) {
    if (!clave || clave.length < 8) { console.error('Uso: node scripts/set-password.js E003 nuevaClave (mínimo 8 caracteres)'); process.exit(1); }
    const r = await Encargada.updateOne({ encargada_id: id }, { $set: { password_hash: await bcrypt.hash(clave, 10) } });
    console.log(r.matchedCount ? `Contraseña actualizada para ${id}` : `No existe el usuario ${id}`);
  } else {
    const sin = await Encargada.find({ password_hash: { $in: [null, ''] } }).lean();
    for (const u of sin) await Encargada.updateOne({ _id: u._id }, { $set: { password_hash: await bcrypt.hash(INICIAL, 10) } });
    console.log(`Contraseña inicial asignada a ${sin.length} usuario(s): ${sin.map((u) => u.encargada_id).join(', ') || '—'}`);
    if (sin.length) console.log(`Contraseña inicial: ${INICIAL}  (cámbiala después con: node scripts/set-password.js E001 NuevaClave)`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
