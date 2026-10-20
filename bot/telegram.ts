// Minimal Telegram Bot API client (https://core.telegram.org/bots/api), no dependencies.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const API = `https://api.telegram.org/bot${TOKEN}`;

export type TgMessage = {
  message_id: number;
  chat: { id: number; type: string; first_name?: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  location?: { latitude: number; longitude: number };
};
export type TgUpdate = { update_id: number; message?: TgMessage };

type TgResponse<T> = { ok: boolean; result: T; description?: string; parameters?: { retry_after?: number } };

export function hasToken() {
  return TOKEN.length > 0;
}

async function call<T>(method: string, body: object, timeoutMs = 15_000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json()) as TgResponse<T>;
    if (data.ok) return data.result;
    // Flood control: Telegram says exactly how long to wait.
    const wait = data.parameters?.retry_after;
    if (res.status === 429 && wait && attempt < 4) {
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  }
}

/** Long polling: waits up to `timeoutS` for new messages. */
export function getUpdates(offset: number, timeoutS = 30) {
  return call<TgUpdate[]>('getUpdates', { offset, timeout: timeoutS, allowed_updates: ['message'] }, (timeoutS + 10) * 1000);
}

export function sendMessage(chatId: number | string, html: string, opts: { silent?: boolean; locationButton?: boolean } = {}) {
  return call('sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    disable_notification: opts.silent ?? false,
    ...(opts.locationButton && {
      reply_markup: {
        keyboard: [[{ text: '📍 Enviar minha localização', request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }),
  });
}

export function setMyCommands(commands: { command: string; description: string }[]) {
  return call('setMyCommands', { commands });
}

/** Escapes text for parse_mode HTML. */
export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
