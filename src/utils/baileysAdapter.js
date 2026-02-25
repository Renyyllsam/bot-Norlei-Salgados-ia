import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FOLDER = path.join(process.cwd(), 'auth_info_baileys');
const CLOUDINARY_AUTH_KEY = 'norlei-salgados/auth_session';

// Configura Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ✅ Callback global — persiste entre reconexões
let globalMessageCallback = null;

// ========== CLOUDINARY AUTH HELPERS ==========

async function loadAuthFromCloudinary() {
  try {
    const url = cloudinary.url(`${CLOUDINARY_AUTH_KEY}.json`, {
      resource_type: 'raw',
      secure: true,
      sign_url: false
    });

    const res = await fetch(url);
    if (!res.ok) {
      logger.info('📂 Nenhuma sessão salva no Cloudinary, iniciando nova...');
      return false;
    }

    const authData = await res.json();
    await fs.mkdir(AUTH_FOLDER, { recursive: true });

    for (const [filename, content] of Object.entries(authData)) {
      const filePath = path.join(AUTH_FOLDER, filename);
      await fs.writeFile(filePath, JSON.stringify(content));
    }

    logger.info('✅ Sessão WhatsApp restaurada do Cloudinary!');
    return true;
  } catch (err) {
    logger.warn('⚠️ Não foi possível restaurar sessão do Cloudinary:', err.message);
    return false;
  }
}

async function saveAuthToCloudinary() {
  try {
    const files = await fs.readdir(AUTH_FOLDER);
    const authData = {};

    for (const file of files) {
      const filePath = path.join(AUTH_FOLDER, file);
      const content = await fs.readFile(filePath, 'utf-8');
      try {
        authData[file] = JSON.parse(content);
      } catch {
        authData[file] = content;
      }
    }

    const jsonBuffer = Buffer.from(JSON.stringify(authData));

    await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: CLOUDINARY_AUTH_KEY,
          resource_type: 'raw',
          overwrite: true,
          format: 'json'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(jsonBuffer);
    });

    logger.info('☁️ Sessão WhatsApp salva no Cloudinary!');
  } catch (err) {
    logger.warn('⚠️ Erro ao salvar sessão no Cloudinary:', err.message);
  }
}

// ========== CLIENTE BAILEYS ==========

export async function createBaileysClient(onQR) {
  // Restaura sessão do Cloudinary antes de conectar
  await loadAuthFromCloudinary();

  await fs.mkdir(AUTH_FOLDER, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: {
      level: 'silent',
      trace: () => {}, debug: () => {}, info: () => {},
      warn: () => {}, error: () => {}, fatal: () => {},
      child: () => ({
        level: 'silent', trace: () => {}, debug: () => {},
        info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}
      })
    }
  });

  let isConnected = false;

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    // Salva no Cloudinary sempre que as credenciais atualizam
    await saveAuthToCloudinary();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && onQR) onQR(qr);

    if (connection === 'close') {
      isConnected = false;
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;
      const code = lastDisconnect?.error?.output?.statusCode;
      logger.warn(`⚠️ Conexão fechada. Código: ${code}. Reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        logger.info('🔄 Reconectando em 5 segundos...');
        setTimeout(() => createBaileysClient(onQR), 5000);
      } else {
        // Sessão inválida (logout) — remove sessão do Cloudinary
        logger.warn('🗑️ Sessão inválida, limpando dados do Cloudinary...');
        try {
          await cloudinary.uploader.destroy(`${CLOUDINARY_AUTH_KEY}.json`, { resource_type: 'raw' });
        } catch {}
        setTimeout(() => createBaileysClient(onQR), 5000);
      }
    }

    if (connection === 'open') {
      isConnected = true;
      logger.info('✅ WhatsApp conectado com sucesso!');
      // Salva sessão logo após conectar
      await saveAuthToCloudinary();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      try {
        const from = msg.key.remoteJid;
        const messageType = Object.keys(msg.message)[0];

        let body = '';
        let msgType = 'text';
        let listResponse = null;

        if (messageType === 'conversation') {
          body = msg.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
          body = msg.message.extendedTextMessage?.text || '';
        } else if (messageType === 'listResponseMessage') {
          body = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
          listResponse = { singleSelectReply: { selectedRowId: body } };
          msgType = 'list_response';
        } else {
          continue;
        }

        if (!body) continue;

        logger.info(`📨 Mensagem recebida de ${from}: ${body}`);

        const formattedMessage = { from, body, type: msgType, listResponse, raw: msg };

        if (globalMessageCallback) await globalMessageCallback(formattedMessage);

      } catch (error) {
        logger.error('❌ Erro ao processar mensagem:', error);
      }
    }
  });

  const client = {
    onMessage: (callback) => {
      globalMessageCallback = callback;
    },
    sendText: async (to, text) => {
      await sock.sendMessage(to, { text });
    },
    sendImage: async (to, imageUrl, caption = '') => {
      await sock.sendMessage(to, { image: { url: imageUrl }, caption });
    },
    sendListMessage: async (to, options) => {
      const { buttonText, description, sections, footer } = options;
      const waSection = sections.map(s => ({
        title: s.title || '',
        rows: s.rows.map(r => ({
          title: r.title || '',
          description: r.description || '',
          rowId: r.rowId || r.id || r.title
        }))
      }));
      await sock.sendMessage(to, {
        listMessage: {
          title: description || '',
          text: description || '',
          footerText: footer || '',
          buttonText: buttonText || 'Ver opções',
          listType: 1,
          sections: waSection
        }
      });
    },
    isConnected: () => isConnected,
    sock
  };

  return client;
}