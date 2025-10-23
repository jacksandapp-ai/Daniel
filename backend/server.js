require('dotenv').config();
const { isConfigured } = require('./services/config'); // Importar para logging inicial

// --- Environment Variable Validation ---
// La lógica de validación ahora está en services/config.js
// El servidor ya no se detendrá al iniciar si faltan variables,
// en su lugar, los endpoints devolverán un error informativo.
isConfigured; // Esto simplemente ejecuta el console.warn/error de config.js en el arranque.

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Crear directorio db si no existe
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}
// Crear database.json si no existe
const dbPath = path.join(dbDir, 'database.json');
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '{}', 'utf8');
}


// Middlewares
app.use(cors()); // Permitir peticiones desde cualquier origen para solucionar el error "Failed to fetch".
app.use(express.json());

// Rutas de la API
app.use('/api', apiRoutes);

// --- Servir Frontend Estático ---
// Obtiene la ruta al directorio 'dist' del frontend compilado
const frontendDistPath = path.resolve(__dirname, '..', 'dist');

// Sirve los archivos estáticos (JS, CSS, imágenes, etc.) desde el directorio 'dist'
app.use(express.static(frontendDistPath));

// Handler "catch-all": para cualquier otra petición que no coincida con la API,
// devuelve el archivo principal 'index.html' de la aplicación de React.
// Esto es crucial para que el enrutamiento del lado del cliente (si se añade) funcione correctamente.
app.get('*', (req, res) => {
  res.sendFile(path.resolve(frontendDistPath, 'index.html'));
});


app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});