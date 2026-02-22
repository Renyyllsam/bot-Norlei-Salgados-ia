import { logger } from '../utils/logger.js';
import { storeConfig } from '../config/store.js';
import { sendList } from '../utils/listHelper.js';
import { getProductsByCategory } from '../services/catalogService.js';
import { getCartItems, calculateTotal, clearCart, removeFromCart, isCartEmpty, addToCart } from '../services/cartService.js';

const CANCEL_KEYWORDS = ['menu', 'cancelar', 'voltar', 'sair', 'produtos', 'catalogo', 'cardápio', 'cardapio', 'inicio', 'início'];
const isCancelCommand = (text) => CANCEL_KEYWORDS.includes(text.toLowerCase().trim());

const themes = {
  menu:    { color: '🧡', border: '🥟', line: '🧡════════════════════🧡', emoji: '✨' },
  catalog: { color: '🔥', border: '🍽️', line: '🔥════════════════════🔥', emoji: '🛍️' },
  product: { color: '💛', border: '✨', line: '💛════════════════════💛', emoji: '🥟' },
  cart:    { color: '💚', border: '🛒', line: '💚════════════════════💚', emoji: '🛍️' },
};

const userStates = new Map();
const setState = (id, state, data = {}) => { userStates.set(id, { state, data }); };
const getState = (id) => userStates.get(id) || { state: 'idle', data: {} };
const clearState = (id) => { userStates.delete(id); };

export function isInMenuState(userId) {
  return getState(userId).state !== 'idle';
}

export async function showMainMenu(client, from) {
  const t = themes.menu;
  const sections = [
    {
      title: `${t.border} CARDÁPIO ${t.border}`,
      rows: [
        { title: `${t.color} Ver Cardápio`, description: 'Salgados fritos, congelados e mais', rowId: 'menu_catalog' },
        { title: `${t.color} Promoções 🔥`, description: 'Ofertas especiais do dia', rowId: 'menu_promo' },
        { title: `${t.color} Meu Carrinho 🛒`, description: 'Ver itens selecionados', rowId: 'menu_cart' }
      ]
    },
    {
      title: `${t.border} PEDIDOS ${t.border}`,
      rows: [
        { title: `${t.color} Fazer Pedido`, description: 'Finalizar minha compra', rowId: 'menu_checkout' },
        { title: `${t.color} Encomendas 📦`, description: 'Festas e eventos especiais', rowId: 'menu_order' }
      ]
    },
    {
      title: `${t.border} ATENDIMENTO ${t.border}`,
      rows: [
        { title: `${t.color} Falar com Atendente`, description: 'Conversar com a Norlei', rowId: 'menu_attendant' },
        { title: `${t.color} Sobre Nós`, description: 'Conheça a Norlei Salgados', rowId: 'menu_about' }
      ]
    }
  ];
  await sendList(client, from, {
    buttonText: `${t.emoji} Ver Menu`,
    description: `${t.line}\n${t.border}   *NORLEI SALGADOS*   ${t.border}\n${t.line}\n\n${t.color} *Olá! Seja bem-vindo(a)!* ${t.color}\n\n${t.emoji} O que vai querer hoje? ${t.emoji}`,
    sections,
    footer: `🥟 Guarujá - SP | (11) 94383-3418`
  });
  clearState(from);
}

function isQuestionForAI(text) {
  const lower = text.toLowerCase().trim();
  if (text.includes('?')) return true;
  if (text.split(' ').length > 6) return true;
  const keywords = ['qual', 'quais', 'como', 'quando', 'onde', 'quanto', 'tem', 'aceita', 'entrega', 'frete', 'prazo', 'pix', 'pagamento', 'horário', 'funciona', 'preço', 'valor', 'custa', 'disponível', 'tem algum', 'gostaria', 'poderia', 'quero saber'];
  if (keywords.some(w => lower.includes(w))) {
    if (!isNaN(parseInt(text)) && text.trim().length <= 2) return false;
    return true;
  }
  return false;
}

export async function handleMenuCommand(client, message) {
  const from = message.from;
  const text = message.body.trim();
  const lower = text.toLowerCase();

  try {
    // Lista interativa clicada
    if (message.type === 'list_response' && message.listResponse) {
      const rowId = message.listResponse.singleSelectReply.selectedRowId;
      switch (rowId) {
        case 'menu_catalog': await showCategories(client, from); setState(from, 'browsing_categories'); return true;
        case 'menu_promo': await showPromotions(client, from); return true;
        case 'menu_cart': await showCart(client, from); return true;
        case 'menu_checkout': return false;
        case 'menu_order': await showOrderInfo(client, from); return true;
        case 'menu_attendant': await showAttendant(client, from); return true;
        case 'menu_about': await showAbout(client, from); return true;
        default: break;
      }
    }

    // Comandos diretos
    if (lower === 'menu' || lower === 'início' || lower === 'inicio' || lower === 'voltar') { await showMainMenu(client, from); return true; }
    if (lower === 'ajuda' || lower === 'help') { await showHelp(client, from); return true; }
    if (lower === 'carrinho') { await showCart(client, from); return true; }
    if (lower === 'limpar' || lower === 'limpar carrinho') { clearCart(from); await client.sendText(from, '💚 Carrinho esvaziado!\n\nDigite *menu* para continuar.'); clearState(from); return true; }
    if (lower.startsWith('remover ')) {
      const index = parseInt(lower.replace('remover ', '')) - 1;
      const r = removeFromCart(from, index);
      await client.sendText(from, r.success ? '💚 Item removido!\n\nDigite *carrinho* para ver o carrinho.' : '❌ Item não encontrado.');
      return true;
    }

    // Estados de navegação
    const state = getState(from);
    if (state.state !== 'idle') {
      switch (state.state) {
        case 'browsing_categories': return await handleCategorySelection(client, from, message, state);
        case 'viewing_products': return await handleProductSelection(client, from, message, state);
        case 'viewing_product_details': return await handleProductAction(client, from, message, state);
        case 'adding_to_cart': return await handleCartAddition(client, from, message, state);
        case 'after_add_to_cart': return await handleAfterAdd(client, from, message);
      }
    }

    // Atalhos do menu principal (só quando idle)
    if (lower === '1' || lower === 'cardápio' || lower === 'cardapio' || lower === 'produtos') { await showCategories(client, from); setState(from, 'browsing_categories'); return true; }
    if (lower === '2' || lower === 'promoções' || lower === 'promocoes') { await showPromotions(client, from); return true; }
    if (lower === '3') { await showCart(client, from); return true; }
    if (lower === '6' || lower === 'atendente') { await showAttendant(client, from); return true; }
    if (lower === '7' || lower === 'sobre') { await showAbout(client, from); return true; }

    return false;
  } catch (error) {
    logger.error('❌ Erro no menu:', error);
    await client.sendText(from, 'Ocorreu um erro. Digite *menu* para voltar.');
    clearState(from);
    return true;
  }
}

async function showCategories(client, from) {
  const t = themes.catalog;
  const sections = [{
    title: `${t.border} CATEGORIAS ${t.border}`,
    rows: storeConfig.categories.map((cat, i) => ({
      title: `${t.color} ${cat.emoji} ${cat.name}`,
      description: cat.description,
      rowId: `cat_${i}`
    }))
  }];
  await sendList(client, from, {
    buttonText: `${t.emoji} Ver Cardápio`,
    description: `${t.line}\n${t.border}   *NOSSO CARDÁPIO*   ${t.border}\n${t.line}\n\n${t.color} *Escolha a categoria:* ${t.color}\n\n${t.emoji} Tudo fresquinho e feito com amor!\n${t.emoji} Entrega em Guarujá - SP`,
    sections,
    footer: `Ou digite *menu* para voltar 🥟`
  });
}

async function showProductsByCategory(client, from, category) {
  const t = themes.catalog;
  try {
    const products = await getProductsByCategory(category.id);
    if (products.length === 0) {
      await client.sendText(from, `${t.color} Nenhum produto disponível nesta categoria no momento.\n\nDigite *menu* para voltar.`);
      return;
    }
    const sections = [{
      title: `${t.border} ${category.name.toUpperCase()} ${t.border}`,
      rows: products.map((p, i) => ({
        title: `${t.color} ${p.name}`,
        description: `R$ ${p.price.toFixed(2)}${p.sizes?.length ? ' | ' + p.sizes.join(', ') : ''}`,
        rowId: `prod_${i}`
      }))
    }];
    await sendList(client, from, {
      buttonText: `${t.emoji} Ver Produtos`,
      description: `${t.line}\n${t.border}   *${category.name.toUpperCase()}*   ${t.border}\n${t.line}\n\n${t.color} Escolha o produto: ${t.color}\n\n${t.emoji} Tudo fresquinho!\n${t.emoji} Qualidade garantida`,
      sections,
      footer: `Ou digite *menu* para voltar 🥟`
    });
  } catch (e) {
    await client.sendText(from, 'Erro ao carregar produtos. Digite *menu* para voltar.');
  }
}

async function sendProductImages(client, from, product) {
  if (!product.images || product.images.length === 0) return false;
  for (const imageUrl of product.images) {
    try {
      const finalUrl = imageUrl.startsWith('http') ? imageUrl : `${process.env.RENDER_URL || ''}${imageUrl}`;
      await client.sendImage(from, finalUrl, `📷 ${product.name} — R$ ${product.price.toFixed(2)}`);
      if (product.images.length > 1) await new Promise(r => setTimeout(r, 500));
    } catch (e) { logger.error(`❌ Erro ao enviar imagem: ${e.message}`); }
  }
  return true;
}

async function showProductDetails(client, from, product, category) {
  const t = themes.product;
  try {
    await sendProductImages(client, from, product);
    await new Promise(r => setTimeout(r, 800));

    let msg = `${t.line}\n${t.border}   *DETALHES DO PRODUTO*   ${t.border}\n${t.line}\n\n${t.emoji} *${product.name}* ${t.emoji}\n\n┊\n┊ 💰 *Preço:* R$ ${product.price.toFixed(2)}\n`;
    if (product.sizes?.length) msg += `┊ 📦 *Quantidades:* ${product.sizes.join(', ')}\n`;
    if (product.colors?.length) msg += `┊ 🎨 *Opções:* ${product.colors.join(', ')}\n`;
    msg += `┊ 📂 *Categoria:* ${category.name}\n┊\n┊ 📝 *Descrição:*\n┊ ${product.description}\n┊\n\n${t.color} O que deseja fazer? ${t.color}`;
    await client.sendText(from, msg);

    const sections = [{
      title: `${t.border} Ações ${t.border}`,
      rows: [
        { title: `${t.color} 🛒 Adicionar ao Carrinho`, description: 'Escolher quantidade', rowId: 'prod_action_add' },
        { title: `${t.color} 🍽️ Ver Outros Produtos`, description: `Voltar para ${category.name}`, rowId: 'prod_action_other' },
        { title: `${t.color} 📋 Voltar às Categorias`, description: 'Ver todas as categorias', rowId: 'prod_action_categories' }
      ]
    }];
    await sendList(client, from, { buttonText: `${t.emoji} Escolher`, description: '', sections, footer: `Escolha com carinho 🥟` });
  } catch (e) {
    logger.error('❌ Erro nos detalhes:', e);
    await client.sendText(from, 'Erro ao carregar produto. Digite *menu* para voltar.');
  }
}

async function handleCategorySelection(client, from, message, state) {
  const text = message.body.trim();
  if (isCancelCommand(text)) { await showMainMenu(client, from); return true; }
  if (isQuestionForAI(text) && !message.listResponse) return false;

  if (message.type === 'list_response' && message.listResponse) {
    const rowId = message.listResponse.singleSelectReply.selectedRowId;
    if (rowId.startsWith('cat_')) {
      const cat = storeConfig.categories[parseInt(rowId.replace('cat_', ''))];
      await showProductsByCategory(client, from, cat);
      setState(from, 'viewing_products', { category: cat });
      return true;
    }
  }
  const idx = parseInt(text) - 1;
  if (isNaN(idx) || idx < 0 || idx >= storeConfig.categories.length) {
    await client.sendText(from, '❌ Categoria inválida. Digite o número ou *menu* para voltar.');
    return true;
  }
  const cat = storeConfig.categories[idx];
  await showProductsByCategory(client, from, cat);
  setState(from, 'viewing_products', { category: cat });
  return true;
}

async function handleProductSelection(client, from, message, state) {
  try {
    const text = message.body.trim();
    if (isCancelCommand(text)) { await showCategories(client, from); setState(from, 'browsing_categories'); return true; }
    if (isQuestionForAI(text) && !message.listResponse) return false;

    const category = state.data.category;
    const products = await getProductsByCategory(category.id);

    if (message.type === 'list_response' && message.listResponse) {
      const rowId = message.listResponse.singleSelectReply.selectedRowId;
      if (rowId.startsWith('prod_')) {
        const product = products[parseInt(rowId.replace('prod_', ''))];
        await showProductDetails(client, from, product, category);
        setState(from, 'viewing_product_details', { category, product });
        return true;
      }
    }
    const idx = parseInt(text) - 1;
    if (isNaN(idx) || idx < 0 || idx >= products.length) {
      await client.sendText(from, '❌ Produto inválido. Digite o número ou *menu* para voltar.');
      return true;
    }
    const product = products[idx];
    await showProductDetails(client, from, product, category);
    setState(from, 'viewing_product_details', { category, product });
    return true;
  } catch (e) {
    await client.sendText(from, 'Erro ao processar. Digite *menu* para voltar.');
    return true;
  }
}

async function handleProductAction(client, from, message, state) {
  const text = message.body.trim();
  if (isCancelCommand(text)) { await showProductsByCategory(client, from, state.data.category); setState(from, 'viewing_products', { category: state.data.category }); return true; }
  if (!['1', '2', '3'].includes(text) && isQuestionForAI(text) && !message.listResponse) return false;

  let rowId = null;
  if (message.type === 'list_response' && message.listResponse) rowId = message.listResponse.singleSelectReply.selectedRowId;

  if (rowId === 'prod_action_add' || text === '1') {
    await showQuantitySelection(client, from, state.data.product);
    setState(from, 'adding_to_cart', { product: state.data.product, category: state.data.category, step: 'size' });
    return true;
  }
  if (rowId === 'prod_action_other' || text === '2') { await showProductsByCategory(client, from, state.data.category); setState(from, 'viewing_products', { category: state.data.category }); return true; }
  if (rowId === 'prod_action_categories' || text === '3') { await showCategories(client, from); setState(from, 'browsing_categories'); return true; }

  await client.sendText(from, '❌ Opção inválida. Digite 1, 2 ou 3.');
  return true;
}

async function showQuantitySelection(client, from, product) {
  const t = themes.product;
  // Se não tem tamanhos/quantidades definidas, adicionar direto com quantidade 1
  if (!product.sizes || product.sizes.length === 0) {
    setState(from, 'adding_to_cart', { product, step: 'color', size: 'Unidade' });
    if (!product.colors || product.colors.length === 0) {
      // Sem opções — adiciona direto
      return;
    }
  }

  const sections = [{
    title: `${t.border} QUANTIDADES ${t.border}`,
    rows: (product.sizes && product.sizes.length > 0 ? product.sizes : ['1 unidade', '6 unidades', '12 unidades', '25 unidades', '50 unidades']).map((s, i) => ({
      title: `${t.color} ${s}`,
      description: `Selecionar ${s}`,
      rowId: `size_${i}`
    }))
  }];
  await sendList(client, from, {
    buttonText: `${t.emoji} Escolher Quantidade`,
    description: `${t.line}\n${t.border}   *QUANTIDADE*   ${t.border}\n${t.line}\n\n${t.emoji} *${product.name}*\n\n💰 R$ ${product.price.toFixed(2)} por unidade\n\n${t.color} Quantas unidades? ${t.color}`,
    sections,
    footer: `Ou digite *cancelar* para voltar 🥟`
  });
}

async function handleCartAddition(client, from, message, state) {
  const { product, step, size, category } = state.data;
  const text = message.body.trim();

  if (isCancelCommand(text)) { await showProductDetails(client, from, product, category); setState(from, 'viewing_product_details', { category, product }); return true; }
  if (!message.listResponse && isQuestionForAI(text)) return false;

  if (step === 'size') {
    let selectedSize = null;
    if (message.type === 'list_response' && message.listResponse) {
      const rowId = message.listResponse.singleSelectReply.selectedRowId;
      if (rowId.startsWith('size_')) {
        const sizes = (product.sizes && product.sizes.length > 0) ? product.sizes : ['1 unidade', '6 unidades', '12 unidades', '25 unidades', '50 unidades'];
        selectedSize = sizes[parseInt(rowId.replace('size_', ''))];
      }
    } else {
      const sizes = (product.sizes && product.sizes.length > 0) ? product.sizes : ['1 unidade', '6 unidades', '12 unidades', '25 unidades', '50 unidades'];
      const idx = parseInt(text) - 1;
      if (isNaN(idx) || idx < 0 || idx >= sizes.length) {
        await client.sendText(from, '❌ Quantidade inválida. Escolha um número da lista ou *cancelar* para voltar.');
        return true;
      }
      selectedSize = sizes[idx];
    }
    if (!selectedSize) { await client.sendText(from, '❌ Não consegui processar. Tente novamente.'); return true; }

    // Se não tem cores, adicionar direto
    if (!product.colors || product.colors.length === 0) {
      const result = await addToCart(from, product.id, selectedSize, 'Padrão', 1);
      if (!result.success) { await client.sendText(from, `❌ ${result.message}`); clearState(from); return true; }
      await showAfterAdd(client, from, product, selectedSize, 'Padrão');
      setState(from, 'after_add_to_cart');
      return true;
    }

    await showColorSelection(client, from, product, selectedSize);
    setState(from, 'adding_to_cart', { product, category, step: 'color', size: selectedSize });
    return true;
  }

  if (step === 'color') {
    let selectedColor = null;
    if (message.type === 'list_response' && message.listResponse) {
      const rowId = message.listResponse.singleSelectReply.selectedRowId;
      if (rowId.startsWith('color_')) selectedColor = product.colors[parseInt(rowId.replace('color_', ''))];
    } else {
      const idx = parseInt(text) - 1;
      if (isNaN(idx) || idx < 0 || idx >= product.colors.length) {
        await client.sendText(from, '❌ Opção inválida. Escolha um número da lista.');
        return true;
      }
      selectedColor = product.colors[idx];
    }
    if (!selectedColor) { await client.sendText(from, '❌ Não consegui processar. Tente novamente.'); return true; }

    const result = await addToCart(from, product.id, size, selectedColor, 1);
    if (!result.success) { await client.sendText(from, `❌ ${result.message}`); clearState(from); return true; }
    await showAfterAdd(client, from, product, size, selectedColor);
    setState(from, 'after_add_to_cart');
    return true;
  }
  return true;
}

async function showColorSelection(client, from, product, selectedSize) {
  const t = themes.product;
  const sections = [{
    title: `${t.border} OPÇÕES ${t.border}`,
    rows: product.colors.map((c, i) => ({ title: `${t.color} ${c}`, description: `Selecionar ${c}`, rowId: `color_${i}` }))
  }];
  await sendList(client, from, {
    buttonText: `${t.emoji} Escolher Opção`,
    description: `${t.line}\n${t.border}   *ESCOLHA A OPÇÃO*   ${t.border}\n${t.line}\n\n${t.emoji} *${product.name}*\n📦 Quantidade: ${selectedSize}\n\n${t.color} Escolha a opção: ${t.color}`,
    sections,
    footer: `Ou digite *cancelar* para voltar 🥟`
  });
}

async function showAfterAdd(client, from, product, size, color) {
  const t = themes.cart;
  const totals = calculateTotal(from, false);
  const totalsWithPix = calculateTotal(from, true);
  const items = getCartItems(from);

  let msg = `${t.line}\n${t.border}   *ITEM ADICIONADO!*   ${t.border}\n${t.line}\n\n${t.emoji} *${product.name}*\n┊ 📦 ${size}${color !== 'Padrão' ? '\n┊ 🎨 ' + color : ''}\n┊ 💰 R$ ${product.price.toFixed(2)}\n\n💚 *Adicionado com sucesso!*\n\n────────────────────\n\n🛒 *SEU CARRINHO:*\n\n`;
  items.forEach((item, i) => { msg += `${i + 1}. ${item.name} (${item.size}) x${item.quantity} — R$ ${(item.price * item.quantity).toFixed(2)}\n`; });
  msg += `\n💰 Total Cartão: R$ ${totals.total.toFixed(2)}\n💚 Total PIX: R$ ${totalsWithPix.total.toFixed(2)}\n\n${t.color} O que deseja fazer? ${t.color}`;
  await client.sendText(from, msg);

  const sections = [{
    title: `${t.border} Próximas Ações ${t.border}`,
    rows: [
      { title: `${t.color} 🍽️ Continuar Comprando`, description: 'Ver mais salgados', rowId: 'after_continue' },
      { title: `${t.color} 🛒 Ver Carrinho`, description: 'Revisar pedido', rowId: 'after_cart' },
      { title: `${t.color} ✅ Finalizar Pedido`, description: 'Confirmar e pagar', rowId: 'after_checkout' }
    ]
  }];
  await sendList(client, from, { buttonText: `${t.emoji} Escolher`, description: '', sections, footer: `🥟 Ou digite o número da opção` });
}

async function handleAfterAdd(client, from, message) {
  let rowId = null;
  if (message.type === 'list_response' && message.listResponse) rowId = message.listResponse.singleSelectReply.selectedRowId;
  const text = message.body.trim();

  if (rowId === 'after_continue' || text === '1') { await showCategories(client, from); setState(from, 'browsing_categories'); return true; }
  if (rowId === 'after_cart' || text === '2') { await showCart(client, from); clearState(from); return true; }
  if (rowId === 'after_checkout' || text === '3') { clearState(from); return false; }
  await client.sendText(from, '❌ Opção inválida. Digite 1, 2 ou 3.');
  return true;
}

async function showCart(client, from) {
  const t = themes.cart;
  if (isCartEmpty(from)) {
    await client.sendText(from, `${t.line}\n${t.border}   *SEU CARRINHO*   ${t.border}\n${t.line}\n\n🛒 Carrinho vazio!\n\n💡 Digite *cardápio* para ver nossos salgados!\n🥟 Temos tudo fresquinho esperando por você!`);
    return;
  }
  const items = getCartItems(from);
  const totals = calculateTotal(from, false);
  const totalsWithPix = calculateTotal(from, true);

  let msg = `${t.line}\n${t.border}   *SEU CARRINHO*   ${t.border}\n${t.line}\n\n`;
  items.forEach((item, i) => { msg += `${i + 1}. *${item.name}* (${item.size}) x${item.quantity}\n   💰 R$ ${(item.price * item.quantity).toFixed(2)}\n\n`; });
  msg += `────────────────────\n💰 Total Cartão: R$ ${totals.total.toFixed(2)}\n💚 Total PIX (5% OFF): R$ ${totalsWithPix.total.toFixed(2)}\n\n• Digite *pedido* para finalizar\n• Digite *limpar* para esvaziar\n• Digite *remover [número]* para remover item`;
  await client.sendText(from, msg);
}

async function showPromotions(client, from) {
  await client.sendText(from, `🔥════════════════════🔥\n🍽️   *PROMOÇÕES DO DIA*   🍽️\n🔥════════════════════🔥\n\n🧡 *DESCONTO PIX*\n💚 5% OFF em todos os produtos!\n\n🔥 *FRETE GRÁTIS*\n🚚 Para pedidos em Guarujá - SP\n\n📦 *ENCOMENDAS ESPECIAIS*\nDesconto para pedidos acima de 100 unidades!\n\n────────────────────\nDigite *cardápio* para ver os produtos! 🥟`);
}

async function showOrderInfo(client, from) {
  await client.sendText(from, `📦════════════════════📦\n🥟   *ENCOMENDAS*   🥟\n📦════════════════════📦\n\n🧡 *Fazemos encomendas para:*\n\n🎉 Festas e eventos\n🏢 Empresas e escritórios\n🎂 Aniversários\n👰 Casamentos e formaturas\n\n📋 *Para encomendar:*\nFale diretamente com a Norlei:\n📱 (11) 94383-3418\n\n⏰ *Prazo mínimo:* 24 horas\n💚 *Pagamento:* PIX, cartão ou dinheiro\n\n────────────────────\n🥟 Salgados fresquinhos no seu evento!`);
}

async function showAttendant(client, from) {
  await client.sendText(from, `🧡════════════════════🧡\n🥟   *FALAR COM ATENDENTE*   🥟\n🧡════════════════════🧡\n\n✨ *Entre em contato:*\n\n📱 WhatsApp: (11) 94383-3418\n📍 Guarujá - SP\n\n⏰ *Horário de Atendimento:*\nSegunda a Sábado: 8h às 20h\nDomingo: 8h às 14h\n\n────────────────────\n🥟 Estamos à disposição!`);
}

async function showAbout(client, from) {
  await client.sendText(from, `🧡════════════════════🧡\n🥟   *NORLEI SALGADOS*   🥟\n🧡════════════════════🧡\n\n✨ Os melhores salgados de Guarujá!\nFeitos com muito amor e qualidade.\n\n📍 *Localização:* Guarujá - SP\n\n🚚 *Entrega:* Guarujá - SP\n\n💳 *Pagamentos:*\n💚 PIX (5% desconto)\n💳 Cartão de Crédito/Débito\n💵 Dinheiro\n\n────────────────────\n🥟 Obrigada por escolher a Norlei Salgados!`);
}

async function showHelp(client, from) {
  await client.sendText(from, `🧡════════════════════🧡\n🥟   *COMANDOS*   🥟\n🧡════════════════════🧡\n\n• *menu* — Menu principal\n• *cardápio* — Ver produtos\n• *carrinho* — Ver carrinho\n• *pedido* — Finalizar compra\n• *limpar* — Esvaziar carrinho\n• *atendente* — Falar conosco\n• *ajuda* — Ver esta mensagem\n\n────────────────────\n💡 Você também pode fazer perguntas normalmente!\n🥟 Estou aqui para ajudar!`);
}