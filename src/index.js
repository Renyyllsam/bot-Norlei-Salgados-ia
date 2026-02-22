import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { handleIncomingMessage } from './handlers/messageHandler.js';
import { getAllProducts } from './services/catalogService.js';
import { createBaileysClient } from './utils/baileysAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let currentQR = null;

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.get('/', (req, res) => {
  res.json({ status: 'online', bot: 'Norlei Salgados', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

app.get('/qrcode', async (req, res) => {
  if (!currentQR) {
    return res.send(`<html><head><title>QR Code</title><meta http-equiv="refresh" content="5"><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#fff;font-family:sans-serif;}</style></head><body><h2>⏳ Aguardando QR Code...</h2><p>A página atualiza em 5 segundos.</p></body></html>`);
  }
  try {
    const qrImageUrl = await QRCode.toDataURL(currentQR, { scale: 8 });
    res.send(`<html><head><title>QR Code WhatsApp</title><meta http-equiv="refresh" content="20"><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#fff;font-family:sans-serif;}img{border:8px solid #fff;border-radius:12px;}</style></head><body><h2>📱 Escaneie com o WhatsApp</h2><img src="${qrImageUrl}" alt="QR Code"/><p>WhatsApp → Dispositivos conectados → Conectar dispositivo</p><p>⏱️ Atualiza a cada 20s automaticamente</p></body></html>`);
  } catch (err) {
    res.status(500).send('Erro ao gerar QR Code');
  }
});

// Rota de sync de produtos
app.post('/api/sync-products', (req, res) => {
  const { secret, data } = req.body;
  const SYNC_SECRET = process.env.SYNC_SECRET || 'norlei-sync-2026';
  if (secret !== SYNC_SECRET) return res.status(401).json({ error: 'Não autorizado' });
  if (!data || !data.products) return res.status(400).json({ error: 'Dados inválidos' });
  try {
    const PRODUCTS_FILE = path.join(process.cwd(), 'data', 'products.json');
    const dataDir = path.dirname(PRODUCTS_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    logger.info(`✅ Produtos sincronizados: ${data.products.length}`);
    res.json({ success: true, count: data.products.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  logger.info(`🌐 Servidor HTTP rodando na porta ${PORT}`);
});

async function start() {
  try {
    logger.info('🚀 INICIANDO BOT NORLEI SALGADOS...');

    try {
      const products = await getAllProducts();
      logger.info(`📦 Catálogo carregado: ${products.length} produtos`);
    } catch (error) {
      logger.warn('⚠️ Erro ao carregar produtos:', error.message);
    }

    logger.info('🤖 Gemini AI configurado');
    logger.info('📱 Conectando ao WhatsApp via Baileys...');

    const onQR = (qr) => {
      currentQR = qr;
      logger.info('📸 QR Code gerado! Acesse /qrcode no navegador para escanear.');
    };

    const client = await createBaileysClient(onQR);

    client.onMessage(async (message) => {
      try {
        await handleIncomingMessage(client, message);
      } catch (error) {
        logger.error('❌ Erro ao processar mensagem:', error);
      }
    });

    currentQR = null;
    logger.info('✅ BOT NORLEI SALGADOS ONLINE!');
    logger.info('💬 Aguardando mensagens...');

  } catch (error) {
    logger.error('❌ Erro fatal ao iniciar:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => { logger.error('❌ Erro não capturado:', error); });
process.on('unhandledRejection', (error) => { logger.error('❌ Promise rejeitada:', error); });

start();