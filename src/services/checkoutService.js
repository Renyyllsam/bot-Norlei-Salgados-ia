import { logger } from '../utils/logger.js';

const checkoutSessions = new Map();

export function isInCheckout(userId) {
  return checkoutSessions.has(userId);
}

export function startCheckout(userId) {
  checkoutSessions.set(userId, { step: 'name', data: {} });
  logger.debug(`🛒 Checkout iniciado para ${userId}`);
}

export function getCheckoutSession(userId) {
  return checkoutSessions.get(userId);
}

export function updateCheckoutSession(userId, updates) {
  const session = checkoutSessions.get(userId);
  if (session) {
    checkoutSessions.set(userId, { ...session, ...updates });
  }
}

export function endCheckout(userId) {
  checkoutSessions.delete(userId);
  logger.debug(`✅ Checkout finalizado para ${userId}`);
}