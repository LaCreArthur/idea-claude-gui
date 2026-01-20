import type { ClaudeMessage, ClaudeContentBlock, ToolResultBlock } from '../types';

export function convertMessagesToJSON(messages: ClaudeMessage[], sessionTitle: string): string {
  const exportTime = formatTimestamp(new Date().toISOString());

  const filteredMessages = messages
    .filter(msg => shouldExportMessage(msg))
    .map(msg => processMessageForExport(msg));

  const exportData = {
    format: 'claude-chat-export-v2',
    exportTime,
    sessionTitle,
    messageCount: filteredMessages.length,
    messages: filteredMessages
  };

  return JSON.stringify(exportData, null, 2);
}

function processMessageForExport(message: ClaudeMessage): any {
  const contentBlocks = getContentBlocks(message);

  let processedBlocks: any[] = [];
  if (contentBlocks.length > 0) {
    processedBlocks = contentBlocks.map(block => processContentBlock(block));
  } else if (message.content && message.content.trim()) {
    processedBlocks = [{ type: 'text', text: message.content }];
  } else if (message.raw) {
    const rawContent = extractRawContent(message.raw);
    if (rawContent) {
      processedBlocks = [{ type: 'text', text: rawContent }];
    }
  }

  return {
    type: message.type,
    timestamp: message.timestamp ? formatTimestamp(message.timestamp) : null,
    content: message.content,
    contentBlocks: processedBlocks,
    raw: message.raw
  };
}

function extractRawContent(raw: any): string | null {
  if (!raw) return null;

  if (typeof raw === 'string') return raw;

  if (typeof raw.content === 'string') return raw.content;

  if (Array.isArray(raw.content)) {
    return raw.content
      .filter((block: any) => block && block.type === 'text')
      .map((block: any) => block.text || '')
      .join('\n');
  }

  if (raw.message?.content) {
    if (typeof raw.message.content === 'string') return raw.message.content;
    if (Array.isArray(raw.message.content)) {
      return raw.message.content
        .filter((block: any) => block && block.type === 'text')
        .map((block: any) => block.text || '')
        .join('\n');
    }
  }

  return null;
}

function processContentBlock(block: ClaudeContentBlock | ToolResultBlock): any {
  if (block.type === 'text') {
    return {
      type: 'text',
      text: block.text
    };
  } else if (block.type === 'thinking') {
    return {
      type: 'thinking',
      thinking: (block as any).thinking,
      text: (block as any).text
    };
  } else if (block.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: block.input
    };
  } else if (block.type === 'tool_result') {
    const toolResult = block as ToolResultBlock;
    const content = limitContentLength(toolResult.content, 10000);
    return {
      type: 'tool_result',
      tool_use_id: toolResult.tool_use_id,
      content: content,
      is_error: toolResult.is_error
    };
  } else if (block.type === 'image') {
    const imageBlock = block as any;
    return {
      type: 'image',
      src: imageBlock.src || imageBlock.source?.data,
      mediaType: imageBlock.mediaType || imageBlock.source?.media_type,
      alt: imageBlock.alt
    };
  }

  return block;
}

function limitContentLength(content: any, maxLength: number): any {
  if (typeof content === 'string') {
    if (content.length > maxLength) {
      return content.substring(0, maxLength) + '\n... (content too long, truncated)';
    }
    return content;
  } else if (Array.isArray(content)) {
    return content.map(item => {
      if (item.text && item.text.length > maxLength) {
        return {
          ...item,
          text: item.text.substring(0, maxLength) + '\n... (content too long, truncated)'
        };
      }
      return item;
    });
  }
  return content;
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return timestamp;
  }
}

function shouldExportMessage(message: ClaudeMessage): boolean {
  const text = getMessageText(message);
  if (text && (
    text.includes('<command-name>') ||
    text.includes('<local-command-stdout>') ||
    text.includes('<local-command-stderr>') ||
    text.includes('<command-message>') ||
    text.includes('<command-args>')
  )) {
    return false;
  }

  return true;
}

function getMessageText(message: ClaudeMessage): string {
  if (message.content) {
    return message.content;
  }

  const raw = message.raw;
  if (!raw) {
    return '';
  }

  if (typeof raw === 'string') {
    return raw;
  }

  if (typeof raw.content === 'string') {
    return raw.content;
  }

  if (Array.isArray(raw.content)) {
    return raw.content
      .filter((block: any) => block && block.type === 'text')
      .map((block: any) => block.text ?? '')
      .join('\n');
  }

  if (raw.message?.content && Array.isArray(raw.message.content)) {
    return raw.message.content
      .filter((block: any) => block && block.type === 'text')
      .map((block: any) => block.text ?? '')
      .join('\n');
  }

  return '';
}

function getContentBlocks(message: ClaudeMessage): (ClaudeContentBlock | ToolResultBlock)[] {
  if (message.raw) {
    const rawBlocks = normalizeBlocks(message.raw);
    if (rawBlocks && rawBlocks.length > 0) {
      return rawBlocks;
    }
  }

  if (message.content && message.content.trim()) {
    return [{ type: 'text', text: message.content }];
  }

  return [];
}

function normalizeBlocks(raw: any): (ClaudeContentBlock | ToolResultBlock)[] | null {
  if (!raw) {
    return null;
  }

  let contentArray: any[] | null = null;

  if (raw.message && Array.isArray(raw.message.content)) {
    contentArray = raw.message.content;
  }
  else if (Array.isArray(raw)) {
    contentArray = raw;
  } else if (Array.isArray(raw.content)) {
    contentArray = raw.content;
  } else if (typeof raw.content === 'string' && raw.content.trim()) {
    return [{ type: 'text', text: raw.content }];
  } else if (raw.message && typeof raw.message.content === 'string' && raw.message.content.trim()) {
    return [{ type: 'text', text: raw.message.content }];
  }

  if (contentArray) {
    return contentArray.map((block: any) => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      }
      if (block.type === 'thinking') {
        return { type: 'thinking', thinking: block.thinking, text: block.text };
      }
      if (block.type === 'tool_use') {
        return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
      }
      if (block.type === 'tool_result') {
        return {
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: block.content,
          is_error: block.is_error
        };
      }
      if (block.type === 'image') {
        return { type: 'image', src: block.source?.data, mediaType: block.source?.media_type };
      }
      return block;
    });
  }

  return null;
}

export function downloadJSON(content: string, filename: string): void {
  const payload = JSON.stringify({
    content: content,
    filename: filename.endsWith('.json') ? filename : `${filename}.json`
  });

  if (window.sendToJava) {
    window.sendToJava(`save_json:${payload}`);
  } else {
    console.error('[Frontend] sendToJava not available, falling back to browser download');
    fallbackBrowserDownload(content, filename);
  }
}

function fallbackBrowserDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
