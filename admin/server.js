const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = 3000;

// ===== CONFIGURAÇÕES =====
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('Norlei@2026', 10);
const PRODUCTS_FILE = path.join(__dirname, '../data/products.json');
const PRODUCTS_PUBLIC_ID = 'norlei-salgados/products-data';

// ===== CLOUDINARY CONFIG =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'drtkkczoy',
  api_key: process.env.CLOUDINARY_API_KEY || '668721458954238',
  api_secret: process.env.CLOUDINARY_API_SECRET || '5MV1qywJYnSzoqF-eUMENCQ09Co'
});

// ===== MIDDLEWARES =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'norlei-salgados-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ===== CLOUDINARY STORAGE (para imagens) =====
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'norlei-salgados',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }]
  }
});

const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ===== AUTH =====
function isAuthenticated(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Não autenticado' });
}

// ===== FUNÇÕES AUXILIARES =====
function readProducts() {
  try {
    const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { categories: [], products: [] };
  }
}

async function writeProducts(data) {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('⚠️ Não foi possível salvar local:', e.message);
  }

  try {
    const json = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(json, 'utf-8');

    await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: PRODUCTS_PUBLIC_ID, resource_type: 'raw', overwrite: true, invalidate: true },
        (error, result) => { if (error) reject(error); else resolve(result); }
      );
      uploadStream.end(buffer);
    });

    console.log(`✅ Produtos salvos no Cloudinary! Total: ${data.products?.length || 0}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar no Cloudinary:', error.message);
    return false;
  }
}

function getCloudinaryPublicId(url) {
  try {
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    return matches ? matches[1] : null;
  } catch (e) { return null; }
}

// ===== ROTAS DE AUTENTICAÇÃO =====
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha não fornecida' });
  if (bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Senha incorreta' });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/check-auth', (req, res) => { res.json({ authenticated: !!req.session.authenticated }); });

// ===== ROTAS DE PRODUTOS =====
app.get('/api/products', isAuthenticated, (req, res) => {
  const data = readProducts();
  res.json({ products: data.products || [], categories: data.categories || [] });
});

app.get('/api/products/:id', isAuthenticated, (req, res) => {
  const data = readProducts();
  const product = data.products.find(p => p.id === req.params.id);
  if (product) res.json(product);
  else res.status(404).json({ error: 'Produto não encontrado' });
});

app.post('/api/products', isAuthenticated, upload.array('images', 5), async (req, res) => {
  try {
    const data = readProducts();
    const maxId = data.products.reduce((max, p) => {
      const num = parseInt(p.id.match(/\d+/)?.[0] || 0);
      return Math.max(max, num);
    }, 0);
    const categoryPrefix = req.body.category.substring(0, 4).toUpperCase();
    const newId = `${categoryPrefix}${String(maxId + 1).padStart(3, '0')}`;
    const images = req.files ? req.files.map(f => f.path) : [];
    const sizes = req.body.sizes ? req.body.sizes.split(',').map(s => s.trim()) : [];
    const colors = req.body.colors ? req.body.colors.split(',').map(c => c.trim()) : [];

    const newProduct = {
      id: newId, name: req.body.name, category: req.body.category,
      price: parseFloat(req.body.price), description: req.body.description,
      sizes, colors, images, inStock: req.body.inStock === 'true'
    };

    data.products.push(newProduct);
    const saved = await writeProducts(data);
    if (saved) res.json({ success: true, product: newProduct });
    else res.status(500).json({ error: 'Erro ao salvar produto' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', isAuthenticated, upload.array('images', 5), async (req, res) => {
  try {
    const data = readProducts();
    const idx = data.products.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });

    const existing = data.products[idx];
    let images = existing.images || [];

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(f => f.path);
      if (req.body.keepExistingImages === 'true') {
        images = [...images, ...newImages];
      } else {
        for (const img of images) {
          const id = getCloudinaryPublicId(img);
          if (id) try { await cloudinary.uploader.destroy(id); } catch (e) {}
        }
        images = newImages;
      }
    }

    const sizes = req.body.sizes ? req.body.sizes.split(',').map(s => s.trim()) : existing.sizes;
    const colors = req.body.colors ? req.body.colors.split(',').map(c => c.trim()) : existing.colors;

    const updated = {
      ...existing,
      name: req.body.name || existing.name,
      category: req.body.category || existing.category,
      price: req.body.price ? parseFloat(req.body.price) : existing.price,
      description: req.body.description || existing.description,
      sizes, colors, images,
      inStock: req.body.inStock !== undefined ? req.body.inStock === 'true' : existing.inStock
    };

    data.products[idx] = updated;
    const saved = await writeProducts(data);
    if (saved) res.json({ success: true, product: updated });
    else res.status(500).json({ error: 'Erro ao salvar produto' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', isAuthenticated, async (req, res) => {
  try {
    const data = readProducts();
    const idx = data.products.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });

    const product = data.products[idx];
    for (const img of (product.images || [])) {
      const id = getCloudinaryPublicId(img);
      if (id) try { await cloudinary.uploader.destroy(id); } catch (e) {}
    }

    data.products.splice(idx, 1);
    const saved = await writeProducts(data);
    if (saved) res.json({ success: true });
    else res.status(500).json({ error: 'Erro ao deletar produto' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories', isAuthenticated, (req, res) => {
  res.json(readProducts().categories || []);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  🥟  PAINEL ADMIN - NORLEI SALGADOS  🥟   ║
║  ✅ http://localhost:${PORT}                  ║
║  🔑 Senha: Norlei@2026                     ║
║  ☁️  Dados + Imagens: Cloudinary           ║
║  🔄 Sync automático: SEM push necessário!  ║
╚════════════════════════════════════════════╝`);
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Erro interno do servidor' });
});