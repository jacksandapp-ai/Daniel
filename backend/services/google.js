
const { google } = require('googleapis');
const { readDb } = require('./db');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BACKEND_URL}/api/auth/google/callback`
);

async function getDriveService() {
    const db = await readDb();
    if (!db.tokens) {
        throw new Error('Usuario no autenticado.');
    }
    oauth2Client.setCredentials(db.tokens);
    
    // El cliente se encargará de refrescar el token si es necesario
    
    return google.drive({ version: 'v3', auth: oauth2Client });
}

module.exports = {
    oauth2Client,
    getDriveService,
};
