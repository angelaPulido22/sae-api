require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const { expirarVencidas } = require('./services/solicitudes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api', (req, res) => res.json({ servicio: 'SAE API', estado: 'ok' }));   // verificación rápida
app.use('/api/auth', require('./routes/auth'));
app.use('/api/solicitudes', require('./routes/solicitudes'));
app.use('/api/casos', require('./routes/casos'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/SAE';

mongoose.connect(URI).then(async () => {
  console.log('MongoDB conectado:', mongoose.connection.name);
  const n = await expirarVencidas();
  if (n) console.log(`Solicitudes expiradas al iniciar: ${n}`);
  // HU-16: revisión programada cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try { const x = await expirarVencidas(); if (x) console.log(`[cron] solicitudes expiradas: ${x}`); }
    catch (e) { console.error('[cron] error:', e.message); }
  });
  app.listen(PORT, () => console.log(`SAE listo en http://localhost:${PORT}`));
}).catch((e) => { console.error('No se pudo conectar a MongoDB:', e.message); process.exit(1); });
