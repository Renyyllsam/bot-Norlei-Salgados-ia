import { logger } from './logger.js';

export async function sendList(client, to, options) {
  try {
    const { buttonText, description, sections, footer = '', fallbackMessage = null } = options;

    try {
      await client.sendListMessage(to, { buttonText, description, sections, footer });
      logger.debug(`✅ Lista interativa enviada para ${to}`);
      return { success: true, type: 'list' };
    } catch (listError) {
      logger.warn(`⚠️ Lista interativa falhou, usando fallback: ${listError.message}`);
      if (fallbackMessage) {
        await client.sendText(to, fallbackMessage);
      } else {
        const textMessage = generateFallbackText(description, sections, footer);
        await client.sendText(to, textMessage);
      }
      return { success: true, type: 'text' };
    }
  } catch (error) {
    logger.error('❌ Erro ao enviar lista:', error);
    throw error;
  }
}

function generateFallbackText(description, sections, footer) {
  let message = description ? `${description}\n\n` : '';
  let optionNumber = 1;
  sections.forEach(section => {
    if (section.title) message += `*${section.title}*\n\n`;
    section.rows.forEach(row => {
      message += `${optionNumber}️⃣ ${row.title}\n`;
      if (row.description) message += `   ${row.description}\n`;
      message += `\n`;
      optionNumber++;
    });
  });
  message += `💬 Digite o número da opção\n`;
  if (footer) message += `\n${footer}`;
  return message;
}

export function parseListResponse(message, sections) {
  if (message.type === 'list_response' && message.listResponse) {
    return message.listResponse.singleSelectReply.selectedRowId;
  }
  if (message.listResponse?.singleSelectReply?.selectedRowId) {
    return message.listResponse.singleSelectReply.selectedRowId;
  }
  const text = message.body?.trim();
  const number = parseInt(text);
  if (!isNaN(number) && number > 0) {
    let currentIndex = 1;
    for (const section of sections) {
      for (const row of section.rows) {
        if (currentIndex === number) return row.rowId || row.id || row.title;
        currentIndex++;
      }
    }
  }
  if (text) {
    for (const section of sections) {
      for (const row of section.rows) {
        const rowId = row.rowId || row.id || row.title;
        if (rowId === text) return rowId;
      }
    }
  }
  return null;
}

export function createSection(title, rows) {
  return {
    title,
    rows: rows.map(row => ({
      title: row.title,
      description: row.description || '',
      rowId: row.id
    }))
  };
}