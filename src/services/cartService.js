import { getProductById } from './catalogService.js';
import { logger } from '../utils/logger.js';

const carts = new Map();

function getCart(userId) {
  if (!carts.has(userId)) carts.set(userId, []);
  return carts.get(userId);
}

export async function addToCart(userId, productId, size, color, quantity = 1) {
  try {
    const product = await getProductById(productId);
    if (!product) return { success: false, message: 'Produto não encontrado.' };
    if (!product.inStock) return { success: false, message: 'Produto fora de estoque.' };

    const cart = getCart(userId);
    const existing = cart.find(i => i.productId === productId && i.size === size && i.color === color);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({ productId, name: product.name, price: product.price, size, color, quantity });
    }
    logger.info(`🛒 Adicionado ao carrinho: ${product.name} | ${size} | ${color}`);
    return { success: true, message: 'Produto adicionado!' };
  } catch (error) {
    logger.error('❌ Erro ao adicionar ao carrinho:', error);
    return { success: false, message: 'Erro ao adicionar produto.' };
  }
}

export function getCartItems(userId) {
  return getCart(userId);
}

export function isCartEmpty(userId) {
  return getCart(userId).length === 0;
}

export function clearCart(userId) {
  carts.set(userId, []);
}

export function removeFromCart(userId, index) {
  const cart = getCart(userId);
  if (index < 0 || index >= cart.length) return { success: false };
  cart.splice(index, 1);
  return { success: true };
}

export function calculateTotal(userId, pixDiscount = false) {
  const cart = getCart(userId);
  const subtotal = cart.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);
  const discount = pixDiscount ? subtotal * 0.05 : 0;
  const total = subtotal - discount;
  return { subtotal, discount, total };
}