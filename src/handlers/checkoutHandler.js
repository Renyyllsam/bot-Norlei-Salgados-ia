import { logger } from '../utils/logger.js';
import { getCartItems, calculateTotal, clearCart, isCartEmpty } from '../services/cartService.js';
import { startCheckout, getCheckoutSession, updateCheckoutSession, endCheckout, isInCheckout } from '../services/checkoutService.js';
import { storeConfig } from '../config/store.js';

export async function handleCheckoutCommand(client, message) {
  const from = message.from;

  if (isCartEmpty(from)) {
    await client.sendText(from,
      '🛒 Seu carrinho está vazio!\n\n' +
      '💡 Digite *produtos* para ver nosso cardápio.\n' +
      'Ou digite *menu* para ver todas as opções.'
    );
    return;
  }

  startCheckout(from);
  await askName(client, from);
}

async function askName(client, from) {
  const items = getCartItems(from);
  const totals = calculateTotal(from, false);
  const totalsWithPix = calculateTotal(from, true);

  let cartSummary = '🛒 *SEU PEDIDO:*\n\n';
  items.forEach((item, i) => {
    cartSummary += `${i + 1}. ${item.name}`;
    if (item.size) cartSummary += ` (${item.size})`;
    cartSummary += ` x${item.quantity} — R$ ${(item.price * item.quantity).toFixed(2)}\n`;
  });
  cartSummary += `\n💰 Subtotal: R$ ${totals.subtotal.toFixed(2)}`;
  cartSummary += `\n💳 Cartão: R$ ${totals.total.toFixed(2)}`;
  cartSummary += `\n💚 PIX (5% OFF): R$ ${totalsWithPix.total.toFixed(2)}`;

  await client.sendText(from,
    `${cartSummary}\n\n` +
    `────────────────────\n\n` +
    `📝 *DADOS PARA ENTREGA*\n\n` +
    `Por favor, me informe seu *nome completo*:`
  );
}

export async function handleCheckoutFlow(client, message) {
  const from = message.from;
  const text = message.body?.trim() || '';
  const lower = text.toLowerCase();

  if (lower === 'cancelar' || lower === 'menu' || lower === 'voltar') {
    endCheckout(from);
    await client.sendText(from, '❌ Pedido cancelado.\n\nDigite *menu* para voltar ao início.');
    return;
  }

  const session = getCheckoutSession(from);
  if (!session) return;

  switch (session.step) {
    case 'name':
      updateCheckoutSession(from, { step: 'phone', data: { ...session.data, name: text } });
      await client.sendText(from, `✅ Obrigada, *${text}*!\n\nAgora me informe seu *telefone* (com DDD):`);
      break;

    case 'phone':
      updateCheckoutSession(from, { step: 'address', data: { ...session.data, phone: text } });
      await client.sendText(from, `✅ Anotado!\n\nMe informe o *endereço completo* para entrega:\n_(Rua, número, bairro)_\n\nOu digite *retirar* para retirar no local.`);
      break;

    case 'address':
      const isPickup = lower === 'retirar' || lower === 'retirada';
      const addressText = isPickup ? 'Retirada no local' : text;
      updateCheckoutSession(from, { step: 'payment', data: { ...session.data, address: addressText } });
      await client.sendText(from,
        `✅ ${isPickup ? 'Retirada no local anotada!' : 'Endereço anotado!'}\n\n` +
        `💳 *FORMA DE PAGAMENTO:*\n\n` +
        `1️⃣ PIX (5% de desconto) 💚\n` +
        `2️⃣ Cartão de Crédito\n` +
        `3️⃣ Cartão de Débito\n` +
        `4️⃣ Dinheiro\n\n` +
        `Digite o número da opção:`
      );
      break;

    case 'payment':
      const paymentOptions = { '1': 'PIX', '2': 'Cartão de Crédito', '3': 'Cartão de Débito', '4': 'Dinheiro' };
      const payment = paymentOptions[text];
      if (!payment) {
        await client.sendText(from, '❌ Opção inválida. Digite 1, 2, 3 ou 4.');
        return;
      }
      const isPix = text === '1';
      updateCheckoutSession(from, { step: 'confirm', data: { ...session.data, payment } });
      await showOrderSummary(client, from, session.data, payment, isPix);
      break;

    case 'confirm':
      if (lower === 'sim' || lower === 's' || lower === '1') {
        await finalizeOrder(client, from, session.data);
      } else if (lower === 'não' || lower === 'nao' || lower === 'n' || lower === '2') {
        endCheckout(from);
        await client.sendText(from, '❌ Pedido cancelado.\n\nDigite *menu* para voltar ao início.');
      } else {
        await client.sendText(from, 'Digite *sim* para confirmar ou *não* para cancelar.');
      }
      break;
  }
}

async function showOrderSummary(client, from, data, payment, isPix) {
  const items = getCartItems(from);
  const totals = calculateTotal(from, isPix);

  let summary = `📋 *RESUMO DO PEDIDO*\n\n`;
  summary += `👤 *Nome:* ${data.name}\n`;
  summary += `📱 *Telefone:* ${data.phone}\n`;
  summary += `📍 *Endereço:* ${data.address}\n`;
  summary += `💳 *Pagamento:* ${payment}${isPix ? ' (5% OFF)' : ''}\n\n`;
  summary += `🛒 *ITENS:*\n`;
  items.forEach((item, i) => {
    summary += `${i + 1}. ${item.name}`;
    if (item.size) summary += ` (${item.size})`;
    summary += ` x${item.quantity} — R$ ${(item.price * item.quantity).toFixed(2)}\n`;
  });
  summary += `\n💰 *TOTAL: R$ ${totals.total.toFixed(2)}*`;
  if (isPix) summary += ` _(com 5% PIX)_`;
  summary += `\n\n✅ Confirmar pedido?\n\n1️⃣ *Sim*, confirmar\n2️⃣ *Não*, cancelar`;

  await client.sendText(from, summary);
}

async function finalizeOrder(client, from, data) {
  const items = getCartItems(from);
  const isPix = data.payment === 'PIX';
  const totals = calculateTotal(from, isPix);

  // Mensagem de confirmação para o cliente
  await client.sendText(from,
    `✅ *PEDIDO CONFIRMADO!* 🥟\n\n` +
    `Obrigada, *${data.name}*!\n\n` +
    `Seu pedido foi recebido e em breve entraremos em contato.\n\n` +
    `📱 Dúvidas? Fale conosco:\n` +
    `WhatsApp: ${storeConfig.contact.whatsapp}\n\n` +
    `🥟 Norlei Salgados — Guarujá - SP`
  );

  // Notificação para o atendente
  const attendantMsg =
    `🔔 *NOVO PEDIDO!*\n\n` +
    `👤 Cliente: ${data.name}\n` +
    `📱 Telefone: ${data.phone}\n` +
    `📍 Endereço: ${data.address}\n` +
    `💳 Pagamento: ${data.payment}\n\n` +
    `🛒 *ITENS:*\n` +
    items.map((item, i) =>
      `${i + 1}. ${item.name}${item.size ? ' (' + item.size + ')' : ''} x${item.quantity} — R$ ${(item.price * item.quantity).toFixed(2)}`
    ).join('\n') +
    `\n\n💰 *TOTAL: R$ ${totals.total.toFixed(2)}*`;

  try {
    await client.sendText(`${storeConfig.contact.whatsapp}@s.whatsapp.net`, attendantMsg);
    logger.info(`📨 Pedido enviado ao atendente: ${storeConfig.contact.whatsapp}`);
  } catch (e) {
    logger.error('❌ Erro ao notificar atendente:', e.message);
  }

  clearCart(from);
  endCheckout(from);
  logger.info(`✅ Pedido finalizado para ${from}`);
}