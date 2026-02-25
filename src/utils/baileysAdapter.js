import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FOLDER = path.join(process.cwd(), 'auth_info_baileys');

// ✅ Callback global — persiste entre reconexões
let globalMessageCallback = null;

export async function createBaileysClient(onQR) {
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

  sock.ev.on('creds.update', saveCreds);

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
      }
    }

    if (connection === 'open') {
      isConnected = true;
      logger.info('✅ WhatsApp conectado com sucesso!');
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

        logger.info(`📨 Mensagem de ${from}: ${body}`);

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