import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger.js';
import { getAllProducts, getCategories } from './catalogService.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
logger.info('🤖 Serviço de IA inicializado');

const conversationHistory = new Map();

async function buildSystemPrompt() {
  let products = [];
  let categories = [];
  try {
    products = await getAllProducts();
    categories = await getCategories();
  } catch (e) {}

  const productsList = products.map(p =>
    `- ${p.name} (${p.category}): R$ ${p.price.toFixed(2)} | ${p.description}${p.sizes?.length ? ' | Qtd: ' + p.sizes.join(', ') : ''}${!p.inStock ? ' | INDISPONÍVEL' : ''}`
  ).join('\n');

  return `Você é a Norlei, atendente virtual da Norlei Salgados, localizada em Guarujá - SP.

SEU PERFIL:
- Nome: Norlei
- Tom: simpática, animada, acolhedora e eficiente
- Especialidade: salgados artesanais frescos e congelados
- Sempre use emojis relacionados a comida 🥟🔥❄️

SOBRE A LOJA:
- Nome: Norlei Salgados
- Cidade: Guarujá - SP
- WhatsApp atendente humano: (11) 94383-3418
- Entrega disponível em Guarujá - SP
- Pagamentos: PIX (5% desconto), cartão de crédito, débito e dinheiro

CATEGORIAS:
${categories.map(c => `- ${c.name}: ${c.description}`).join('\n')}

PRODUTOS DISPONÍVEIS:
${productsList || 'Cardápio sendo atualizado...'}

REGRAS IMPORTANTES:
1. Seja sempre animada e use emojis de comida
2. Quando perguntarem sobre produtos, apresente as opções da categoria
3. Para encomendas, sempre peça: quantidade, tipo de salgado, data e horário
4. Se não souber responder, direcione para o WhatsApp: (11) 94383-3418
5. Nunca invente preços — use apenas os do cardápio acima
6. Mencione o desconto PIX quando falar de pagamento
7. Diga "fresquinho" e "feito com amor" para valorizar o produto
8. Para pedidos grandes (mais de 50 unidades), sempre indique fazer encomenda

COMANDOS QUE O CLIENTE PODE USAR:
- "menu" — ver o menu principal
- "produtos" — ver o cardápio
- "carrinho" — ver itens selecionados
- "pedido" — finalizar o pedido ou cancelar


Responda sempre em português brasileiro, de forma simpática e objetiva.`;
}

export async function generateAIResponse(userMessage, userId, cartContext = null) {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const systemPrompt = await buildSystemPrompt();

      if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, []);
      }
      const history = conversationHistory.get(userId);

      let contextMessage = userMessage;
      if (cartContext?.hasItems) {
        contextMessage += `\n\n[Contexto: cliente tem ${cartContext.itemCount} item(s) no carrinho, subtotal R$ ${cartContext.subtotal?.toFixed(2)}]`;
      }

      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Entendido! Sou a Norlei, atendente da Norlei Salgados. Estou pronta para atender! 🥟' }] },
          ...history
        ],
        generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
      });

      const result = await chat.sendMessage(contextMessage);
      const response = result.response.text();

      history.push(
        { role: 'user', parts: [{ text: userMessage }] },
        { role: 'model', parts: [{ text: response }] }
      );
      if (history.length > 20) history.splice(0, 2);

      logger.info(`✅ IA respondeu com sucesso na tentativa ${attempt}`);
      return response;

    } catch (error) {
      logger.error(`❌ Erro na tentativa ${attempt}/${MAX_RETRIES}`);
      logger.error(`Tipo: ${error.constructor.name}`);
      logger.error(`Mensagem: ${error.message}`);
      if (attempt === MAX_RETRIES) {
        logger.error('❌ ERRO CRÍTICO AO GERAR RESPOSTA DA IA');
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  return null;
}