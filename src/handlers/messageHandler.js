import { generateAIResponse } from '../services/aiService.js';
import { logger } from '../utils/logger.js';
import { handleMenuCommand, showMainMenu, isInMenuState } from './menuHandler.js';
import { handleCheckoutCommand, handleCheckoutFlow } from './checkoutHandler.js';
import { isInCheckout } from '../services/checkoutService.js';
import { getCartItems, calculateTotal } from '../services/cartService.js';

export async function handleIncomingMessage(client, message) {
  try {
    const from = message.from;
    const text = message.body?.trim() || '';
    const lower = text.toLowerCase();

    logger.info(`📨 Mensagem recebida de ${from}: ${text}`);
    if (!text) return;

    // PRIORIDADE 1: CHECKOUT EM ANDAMENTO
    if (isInCheckout(from)) {
      await handleCheckoutFlow(client, message);
      return;
    }

    // PRIORIDADE 2: MENU (inclui todos os estados de navegação)
    const menuHandled = await handleMenuCommand(client, message);
    if (menuHandled) return;

    // PRIORIDADE 3: INICIAR CHECKOUT
    // Inclui '3' (opção "Finalizar Pedido" após adicionar ao carrinho)
    // e '4' (opção do menu principal)
    if (lower === '3' || lower === '4' || lower === 'pedido' || lower === 'fazer pedido' || lower === 'finalizar') {
      await handleCheckoutCommand(client, message);
      return;
    }

    // PRIORIDADE 4: IA
    const cartItems = getCartItems(from);
    let cartContext = null;
    if (cartItems?.length > 0) {
      const totals = calculateTotal(from, false);
      cartContext = { hasItems: true, itemCount: cartItems.length, subtotal: totals.subtotal };
    }

    const aiResponse = await generateAIResponse(text, from, cartContext);
    if (aiResponse) {
      await client.sendText(from, aiResponse);
    } else {
      await client.sendText(from,
        'Desculpe, estou com uma dificuldade técnica. 😔\n\n' +
        '• Digite *menu* para ver as opções\n' +
        '• Digite *cardápio* para ver o cardápio\n' +
        '• Ligue: (11) 94383-3418 🥟'
      );
    }
  } catch (error) {
    logger.error('❌ Erro ao processar mensagem:', error);
    try { await client.sendText(message.from, 'Ocorreu um erro. Digite *menu* para voltar!'); } catch (e) {}
  }
}

export async function handleWelcome(client, from) {
  try { await showMainMenu(client, from); } catch (error) { logger.error('❌ Erro nas boas-vindas:', error); }
}