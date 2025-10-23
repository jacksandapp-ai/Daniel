const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, '../db/database.json');

// --- Mecanismo de Bloqueo (Mutex) para Prevenir Condiciones de Carrera ---
// Esta es una implementación simple de un bloqueo asíncrono.
// 'lock' es una Promesa que representa la finalización de la última operación de escritura.
// Cada nueva llamada a `writeDb` se encadena a esta promesa, asegurando que las
// escrituras ocurran secuencialmente y no en paralelo, lo que evita que
// una operación de escritura sobrescriba a otra que ocurrió casi al mismo tiempo.
let lock = Promise.resolve();

async function readDb() {
    try {
        const data = await fs.readFile(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // El archivo no existe, lo cual es normal la primera vez
            return {};
        }
        console.error('Error al leer la base de datos:', error);
        throw error;
    }
}

async function writeDb(data) {
    // Espera a que la operación de escritura anterior termine (si hay alguna)
    // y luego adquiere el bloqueo para la operación actual.
    lock = lock.then(async () => {
        try {
            // La operación de escritura se realiza de forma atómica dentro de esta cadena de promesas.
            await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error('Error al escribir en la base de datos:', error);
            // Si hay un error, lo lanzamos para que la promesa del bloqueo se rechace
            // y las siguientes operaciones puedan manejarlo.
            throw error;
        }
    }).catch(err => {
        // En caso de un error, nos aseguramos de que el bloqueo no se quede atascado
        // registrando el error y continuando. La petición individual fallará,
        // pero el sistema de bloqueo no se detendrá.
        console.error("Error en la cadena de bloqueo de escritura de la base de datos:", err);
    });
    
    // Devolvemos la promesa de bloqueo para que la función que llama pueda esperar (await)
    // a que esta operación de escritura se complete.
    return lock;
}

module.exports = { readDb, writeDb };