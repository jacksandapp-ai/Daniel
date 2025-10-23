const express = require('express');
const multer = require('multer');
const { Readable } = require('stream');
const { oauth2Client, getDriveService } = require('../services/google');
const { readDb, writeDb } = require('../services/db');
const { isConfigured, missingEnv } = require('../services/config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

// Middleware para verificar la configuración del backend
function checkConfiguration(req, res, next) {
    if (!isConfigured) {
        return res.status(503).json({
            error: 'La configuración del backend está incompleta.',
            details: `Faltan las siguientes variables de entorno en el archivo backend/.env: ${missingEnv.join(', ')}`
        });
    }
    next();
}


// Middleware para verificar la autenticación
async function isAuthenticated(req, res, next) {
    try {
        const db = await readDb();
        if (db.tokens && db.driveFolderId) {
            return next();
        }
        res.status(401).json({ error: 'No autenticado o carpeta no configurada.' });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor al verificar la autenticación.' });
    }
}

// --- Rutas de Configuración y Autenticación ---

router.get('/config', (req, res) => {
    res.json({ clientId: process.env.GOOGLE_CLIENT_ID });
});

router.get('/auth/status', async (req, res) => {
    if (!isConfigured) {
        return res.status(503).json({
            error: 'La configuración del backend está incompleta.',
            details: `Faltan las siguientes variables de entorno: ${missingEnv.join(', ')}`,
            isAuthenticated: false,
            isFolderSet: false,
        });
    }
    try {
        const db = await readDb();
        res.json({
            isAuthenticated: !!db.tokens,
            isFolderSet: !!db.driveFolderId,
            folderId: db.driveFolderId || null
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el estado de la autenticación.' });
    }
});

router.get('/auth/google', checkConfiguration, (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Pide un refresh_token
        scope: DRIVE_SCOPES,
        prompt: 'consent' // Vuelve a pedir consentimiento para asegurar el refresh_token
    });
    res.redirect(url);
});

router.get('/auth/google/callback', checkConfiguration, async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const db = await readDb();
        db.tokens = tokens;
        await writeDb(db);

        res.redirect(`${process.env.FRONTEND_URL}?auth=success`);
    } catch (error) {
        console.error('Error al obtener tokens de Google:', error);
        res.redirect(`${process.env.FRONTEND_URL}?auth=error`);
    }
});

// --- Rutas de Google Drive ---

router.post('/drive/set-folder', checkConfiguration, async (req, res) => {
    const { folderUrl } = req.body;
    if (!folderUrl) {
        return res.status(400).json({ error: 'Se requiere folderUrl.' });
    }

    // Extraer el ID de la URL
    const folderIdMatch = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
    const folderId = folderIdMatch ? folderIdMatch[1] : null;

    if (!folderId) {
        return res.status(400).json({ error: 'URL de la carpeta no válida.' });
    }

    try {
        const db = await readDb();
        if(!db.tokens) {
            return res.status(401).json({ error: 'Primero debes autenticarte.' });
        }
        db.driveFolderId = folderId;
        await writeDb(db);
        res.json({ success: true, message: 'Carpeta configurada correctamente.', folderId });
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar la configuración de la carpeta.' });
    }
});

router.get('/drive/files', checkConfiguration, isAuthenticated, async (req, res) => {
    try {
        const drive = await getDriveService();
        const db = await readDb();

        const response = await drive.files.list({
            q: `'${db.driveFolderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, thumbnailLink, webViewLink)',
            pageSize: 50
        });

        res.json(response.data.files);
    } catch (error) {
        console.error('Error al listar archivos de Drive:', error);
        res.status(500).json({ error: 'No se pudieron listar los archivos.' });
    }
});

router.post('/drive/upload', checkConfiguration, isAuthenticated, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    }

    try {
        const drive = await getDriveService();
        const db = await readDb();

        const fileMetadata = {
            name: req.file.originalname,
            parents: [db.driveFolderId]
        };

        const media = {
            mimeType: req.file.mimetype,
            body: Readable.from(req.file.buffer)
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name'
        });

        res.status(201).json(response.data);
    } catch (error) {
        console.error('Error al subir archivo a Drive:', error);
        res.status(500).json({ error: 'No se pudo subir el archivo.' });
    }
});

router.post('/drive/upload-post', 
    checkConfiguration,
    isAuthenticated, 
    upload.fields([{ name: 'image', maxCount: 1 }, { name: 'text', maxCount: 1 }]), 
    async (req, res) => {
        if (!req.files || !req.files.image || !req.files.text) {
            return res.status(400).json({ error: 'Se requieren los archivos de imagen y texto.' });
        }
        if (!req.body.postTheme) {
            return res.status(400).json({ error: 'Se requiere el tema del post para nombrar la carpeta.' });
        }

        try {
            const drive = await getDriveService();
            const db = await readDb();
            const parentFolderId = db.driveFolderId;

            const folderName = `${req.body.postTheme}_${new Date().toISOString()}`;
            const folderMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentFolderId]
            };
            const folder = await drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });
            const newFolderId = folder.data.id;

            const imageFile = req.files.image[0];
            const imageMetadata = {
                name: imageFile.originalname,
                parents: [newFolderId]
            };
            const imageMedia = {
                mimeType: imageFile.mimetype,
                body: Readable.from(imageFile.buffer)
            };
            await drive.files.create({
                resource: imageMetadata,
                media: imageMedia,
                fields: 'id'
            });

            const textFile = req.files.text[0];
            const textMetadata = {
                name: textFile.originalname,
                parents: [newFolderId]
            };
            const textMedia = {
                mimeType: textFile.mimetype,
                body: Readable.from(textFile.buffer)
            };
            await drive.files.create({
                resource: textMetadata,
                media: textMedia,
                fields: 'id'
            });

            res.status(201).json({ success: true, message: 'Post subido a Drive correctamente.', folderId: newFolderId });

        } catch (error) {
            console.error('Error al subir el post a Drive:', error);
            res.status(500).json({ error: 'No se pudo subir el post a Google Drive.' });
        }
    }
);

router.get('/drive/download/:fileId', checkConfiguration, isAuthenticated, async (req, res) => {
    try {
        const drive = await getDriveService();
        const fileId = req.params.fileId;
        
        const metaRes = await drive.files.get({ fileId: fileId, fields: 'name' });
        const fileName = metaRes.data.name;

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const fileStream = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        fileStream.data.on('end', () => res.end())
                       .on('error', err => {
                            console.error('Error durante la descarga del stream.', err);
                            res.status(500).send('Error al descargar el archivo.');
                       })
                       .pipe(res);

    } catch (error) {
        console.error('Error al descargar archivo de Drive:', error);
        res.status(500).json({ error: 'No se pudo descargar el archivo.' });
    }
});

module.exports = router;