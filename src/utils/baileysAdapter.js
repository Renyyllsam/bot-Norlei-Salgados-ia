import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(process.cwd(), 'tokens', 'baileys-auth');

function normalizeJid(jid) {
  if (!jid) return jid;
  return jid.replace('@s.whatsapp.net', '@c.us').replace('@g.us', '@g.us');
}

function toBaileysJid(to) {
  return to.replace('@c.us', '@s.whatsapp.net');
}

function extractMessageText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

function convertMessage(msg, sock) {
  const from = normalizeJid(msg.key.remoteJid);
  const body = extractMessageText(msg);
  const isGroupMsg = msg.key.remoteJid?.endsWith('@g.us') || false;
  const fromMe = msg.key.fromMe || false;

  let type = 'chat';
  if (msg.message?.listResponseMessage) type = 'list_response';
  else if (msg.message?.imageMessage) type = 'image';
  else if (msg.message?.buttonsResponseMessage) type = 'buttons_response';

  const listResponse = msg.message?.listResponseMessage
    ? {
        singleSelectReply: {
          selectedRowId: msg.message.listResponseMessage.singleSelectReply?.selectedRowId || body
        }
      }
    : null;

  return {
    from,
    chatId: from,
    body,
    type,
    isGroupMsg,
    fromMe,
    listResponse,
    _baileysMsg: msg,
    _sock: sock
  };
}

export async function createBaileysClient(onQR) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  let sock;
  let messageCallback = null;
  let reconnecting = false;

  function createSocket() {
    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: {
        level: 'silent',
        info: () => {}, debug: () => {}, warn: () => {}, error: () => {}, trace: () => {},
        child: () => ({ level: 'silent', info: () => {}, debug: () => {}, warn: () => {}, error: () => {}, trace: () => {} })
      },
      browser: ['Bot Norlei Salgados', 'Chrome', '20.0'],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      retryRequestDelayMs: 250
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        if (typeof onQR === 'function') onQR(qr);
        logger.info('📸 QR Code gerado! Acesse /qrcode no navegador para escanear.');
      }

      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        logger.warn(`⚠️ Conexão fechada. Código: ${statusCode}. Reconectar: ${shouldReconnect}`);
        if (shouldReconnect && !reconnecting) {
          reconnecting = true;
          logger.info('🔄 Reconectando em 5 segundos...');
          setTimeout(() => { reconnecting = false; createSocket(); }, 5000);
        } else if (!shouldReconnect) {
          logger.error('❌ Sessão encerrada. Delete a pasta tokens/baileys-auth e reinicie.');
        }
      }

      if (connection === 'open') {
        logger.info('✅ WhatsApp conectado com sucesso!');
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid?.endsWith('@g.us')) continue;
        const converted = convertMessage(msg, sock);
        if (!converted.body) continue;
        if (messageCallback) await messageCallback(converted);
      }
    });
  }

  createSocket();

  const client = {
    onMessage(callback) { messageCallback = callback; },

    async sendText(to, text) {
      try {
        await sock.sendMessage(toBaileysJid(to), { text });
      } catch (error) {
        logger.error('❌ Erro sendText:', error.message);
        throw error;
      }
    },

    async sendImage(to, imageUrl, filename, caption) {
      try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
        const buffer = Buffer.from(response.data);
        const mimetype = response.headers['content-type'] || 'image/jpeg';
        await sock.sendMessage(toBaileysJid(to), { image: buffer, mimetype, caption: caption || '' });
      } catch (error) {
        logger.error('❌ Erro sendImage:', error.message);
        if (caption) await sock.sendMessage(toBaileysJid(to), { text: caption });
      }
    },

    async sendListMessage(to, options) {
      throw new Error('Usando fallback com números');
    },

    getSocket() { return sock; }
  };

  return client;
}