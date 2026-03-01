import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../utils/logger.js';
import { storeConfig } from '../config/store.js';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const PRODUCTS_PUBLIC_ID = 'norlei-salgados/products-data';

let productsCache = null;
let lastLoadTime = null;
const CACHE_DURATION = 30 * 1000;

async function loadProducts() {
  try {
    if (productsCache && lastLoadTime && (Date.now() - lastLoadTime < CACHE_DURATION)) {
      return productsCache;
    }
    const result = await cloudinary.api.resource(PRODUCTS_PUBLIC_ID, { resource_type: 'raw' });
    const response = await fetch(result.secure_url + '?t=' + Date.now());
    const data = await response.json();
    productsCache = data;
    lastLoadTime = Date.now();
    logger.info(`📦 Catálogo carregado: ${data.products?.length || 0} produtos`);
    return data;
  } catch (error) {
    logger.warn('⚠️ Cloudinary indisponível, usando fallback local');
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.default.dirname(__filename);
      const filePath = path.default.join(__dirname, '..', '..', 'data', 'products.json');
      const raw = await fs.default.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      productsCache = data;
      lastLoadTime = Date.now();
      return data;
    } catch (e) {
      return { categories: storeConfig.categories, products: [] };
    }
  }
}

export async function saveProducts(data) {
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
    productsCache = null;
    lastLoadTime = null;
    logger.info(`✅ Produtos salvos no Cloudinary: ${data.products?.length || 0}`);
    return true;
  } catch (error) {
    logger.error('❌ Erro ao salvar no Cloudinary:', error);
    return false;
  }
}

export async function getAllProducts() {
  const data = await loadProducts();
  return data.products || [];
}

export async function getProductsByCategory(categoryId) {
  const products = await getAllProducts();
  return products.filter(p => p.category === categoryId && p.inStock);
}

export async function getProductById(productId) {
  const products = await getAllProducts();
  return products.find(p => p.id === productId);
}

// ✅ SEMPRE usa storeConfig — ignora categorias do Cloudinary que podem ter IDs errados
export async function getCategories() {
  return storeConfig.categories;
}

export function formatProduct(product, showDetails = false) {
  if (!product) return 'Produto não encontrado.';
  const category = storeConfig.categories.find(c => c.id === product.category);
  const categoryEmoji = category?.emoji || '🛍️';
  let message = `${categoryEmoji} *${product.name}*\n`;
  message += `💰 *R$ ${product.price.toFixed(2)}*\n`;
  if (showDetails) {
    message += `\n📝 ${product.description}\n`;
    if (product.sizes?.length) message += `\n📏 Quantidades: ${product.sizes.join(', ')}`;
    if (product.colors?.length) message += `\n🎨 Opções: ${product.colors.join(', ')}`;
    if (!product.inStock) message += `\n\n⚠️ *INDISPONÍVEL NO MOMENTO*`;
  }
  return message;
}

export function clearCache() {
  productsCache = null;
  lastLoadTime = null;
}