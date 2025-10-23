require('dotenv').config();

const requiredEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'BACKEND_URL', 'FRONTEND_URL'];
const missingEnv = requiredEnv.filter(v => !process.env[v]);

const isConfigured = missingEnv.length === 0;

if (!isConfigured) {
    console.error("---------------------------------------------------------------------------");
    console.error("ADVERTENCIA: Faltan variables de entorno requeridas.");
    console.error(`Las siguientes variables no se encuentran en el archivo backend/.env: ${missingEnv.join(', ')}`);
    console.error("La aplicación se ejecutará, pero las funciones de autenticación estarán desactivadas y devolverán errores.");
    console.error("Por favor, cree o actualice el archivo .env en el directorio 'backend' y reinicie el servidor.");
    console.error("---------------------------------------------------------------------------");
}

module.exports = {
    isConfigured,
    missingEnv,
};
