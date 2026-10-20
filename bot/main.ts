// Sentinela Telegram bot: forwards new Fogo Cruzado occurrences to private chats.
//
// Two loops share one state file:
//   - poll Fogo Cruzado every POLL_SECONDS and message each allowed chat about new occurrences;
//   - long-poll Telegram for commands and shared locations.
//
// Run: node bot/main.ts   (Node 24 runs TypeScript directly; env vars in docs/DOCUMENTACAO.md "Bot do Telegram")
import { credentials, fetchIncidents } from '../api/fogo-cruzado.ts';
import type { Incident } from '../src/lib/incidentTypes.ts';
import { fmtDist, incidentLine, incidentMessage, nearestPlace } from './format.ts';
import { heartbeat, loadState, prefsFor, saveState, type State } from './state.ts';
import { esc, getUpdates, hasToken, sendMessage, setMyCommands, type TgMessage } from './telegram.ts';

const POLL_MS = Math.max(60, Number(process.env.POLL_SECONDS) || 120) * 1000;
/** Window asked from the API on each poll. */
const FETCH_HOURS = 24;
/** Records the source adds late (backfills) are not pushed if older than this. */
const MAX_ALERT_AGE_MS = 12 * 3600_000;
/** After this long failing, chats get one "source down" notice (and one when it recovers). */
const OUTAGE_NOTICE_MS = 15 * 60_000;
const ALLOWED = new Set(
  (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const state: State = loadState();
let lastIncidents: Incident[] = [];
let lastOkAt = 0;
let failingSince = 0;
let outageNotified = false;

const COMMANDS = [
  { command: 'locais', description: 'Ver e gerenciar seus locais' },
  { command: 'addlocal', description: 'Adicionar local: /addlocal Casa = endereço' },
  { command: 'raio', description: 'Raio de proximidade em km: /raio 3' },
  { command: 'modo', description: 'todas (RJ inteiro) ou perto (só perto dos locais)' },
  { command: 'ultimas', description: 'Últimas ocorrências (24 h)' },
  { command: 'pausar', description: 'Pausar os alertas' },
  { command: 'retomar', description: 'Retomar os alertas' },
  { command: 'status', description: 'Situação do bot' },
  { command: 'ajuda', description: 'Como usar' },
];

const HELP = [
  '<b>Sentinela · alertas do Fogo Cruzado</b>',
  '',
  'Você recebe cada ocorrência nova no RJ. As que acontecem perto dos seus locais chegam <b>com som</b> e destaque; as demais chegam em silêncio.',
  '',
  '<b>Locais</b>',
  '• Envie uma <b>localização</b> (📎 → Localização) e depois o nome dela, ou',
  '• <code>/addlocal Casa = Rua Conde de Bonfim 100, Tijuca</code>',
  '• <code>/addlocal Trabalho = -22.9068, -43.1729</code>',
  '• /locais lista · <code>/remover 2</code> apaga o 2º',
  '',
  '<b>Ajustes</b>',
  '• <code>/raio 3</code> raio de proximidade em km (0,5 a 20)',
  '• <code>/modo todas</code> ou <code>/modo perto</code>',
  '• /pausar e /retomar',
  '• /ultimas e /status',
].join('\n');

// ---------- Fogo Cruzado → Telegram ----------

async function notifyChats(incidents: Incident[]) {
  for (const chatId of ALLOWED) {
    const prefs = prefsFor(state, chatId);
    if (prefs.paused) continue;
    for (const i of incidents) {
      const near = nearestPlace(i, prefs.places, prefs.radiusKm);
      if (prefs.mode === 'perto' && !near) continue;
      try {
        await sendMessage(chatId, incidentMessage(i, near), { silent: !near });
      } catch (e) {
        log('falha ao enviar para', chatId, e);
      }
      await sleep(1100); // stay under Telegram's ~1 msg/s per chat
    }
  }
}

async function broadcast(html: string) {
  for (const chatId of ALLOWED) {
    if (prefsFor(state, chatId).paused) continue;
    await sendMessage(chatId, html).catch((e) => log('falha ao enviar aviso para', chatId, e));
  }
}

async function pollSource(creds: { email: string; password: string }) {
  try {
    const { incidents } = await fetchIncidents(FETCH_HOURS, creds);
    lastIncidents = incidents;
    lastOkAt = Date.now();
    if (outageNotified) await broadcast('✅ Conexão com o Fogo Cruzado restabelecida.');
    failingSince = 0;
    outageNotified = false;

    const fresh = incidents.filter((i) => !(i.id in state.seen));
    for (const i of fresh) state.seen[i.id] = Date.now();

    if (!state.primed) {
      // First run: everything already published is history, not news.
      state.primed = true;
      log(`primeira execução: ${fresh.length} ocorrências existentes registradas sem envio`);
    } else {
      const toSend = fresh
        .filter((i) => Date.now() - Date.parse(i.date) <= MAX_ALERT_AGE_MS)
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      if (fresh.length) log(`${fresh.length} novas, ${toSend.length} para enviar`);
      await notifyChats(toSend);
    }
    saveState(state);
  } catch (e) {
    failingSince ||= Date.now();
    log('erro ao consultar o Fogo Cruzado:', e instanceof Error ? e.message : e);
    if (!outageNotified && Date.now() - failingSince > OUTAGE_NOTICE_MS) {
      outageNotified = true;
      await broadcast('⚠️ Não estou conseguindo consultar o Fogo Cruzado há mais de 15 min. Aviso quando voltar.');
    }
  }
}

async function sourceLoop() {
  const creds = credentials();
  if (!creds) throw new Error('Defina FOGOCRUZADO_EMAIL e FOGOCRUZADO_PASSWORD');
  for (;;) {
    await pollSource(creds);
    heartbeat();
    await sleep(POLL_MS);
  }
}

// ---------- Commands ----------

/** Photon geocoder, limited to the state of RJ. */
async function geocode(q: string) {
  const params = new URLSearchParams({ q, limit: '1', bbox: '-44.9,-23.4,-40.9,-20.7', lat: '-22.9', lon: '-43.2' });
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] };
  const f = data.features[0];
  if (!f) return null;
  const p = f.properties;
  const label = [p.name, p.street && [p.street, p.housenumber].filter(Boolean).join(', '), p.district, p.city].filter(Boolean).join(' · ');
  return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label };
}

function listPlaces(chatId: number) {
  const prefs = prefsFor(state, chatId);
  if (!prefs.places.length) return 'Nenhum local cadastrado. Envie uma localização ou use <code>/addlocal Casa = endereço</code>.';
  const lines = prefs.places.map(
    (p, n) => `${n + 1}. <b>${esc(p.name)}</b> — <a href="https://www.google.com/maps?q=${p.lat},${p.lng}">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</a>`,
  );
  return [`<b>Seus locais</b> (raio de ${String(prefs.radiusKm).replace('.', ',')} km):`, ...lines, '', '<code>/remover N</code> apaga um local.'].join('\n');
}

async function handle(msg: TgMessage) {
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();

  if (!ALLOWED.has(String(chatId))) {
    // Private bot: strangers only learn their own chat id (needed to set the bot up).
    if (text.startsWith('/start')) {
      await sendMessage(chatId, `Este é um bot privado.\nSeu chat id é <code>${chatId}</code>. Para receber alertas, ele precisa estar em <code>TELEGRAM_ALLOWED_CHAT_IDS</code>.`);
    }
    log('mensagem ignorada de chat não autorizado', chatId);
    return;
  }

  const prefs = prefsFor(state, chatId);
  const reply = (html: string, opts?: { locationButton?: boolean }) => sendMessage(chatId, html, opts);

  if (msg.location) {
    prefs.pendingPlace = { lat: msg.location.latitude, lng: msg.location.longitude };
    await reply('📍 Recebi a localização. Como quer chamar esse local? (ex.: <i>Casa</i>, <i>Trabalho</i>)');
    return;
  }

  if (!text.startsWith('/')) {
    if (prefs.pendingPlace && text) {
      prefs.places.push({ name: text.slice(0, 40), ...prefs.pendingPlace });
      delete prefs.pendingPlace;
      await reply(`✅ Local <b>${esc(text.slice(0, 40))}</b> salvo. Alertas a até ${String(prefs.radiusKm).replace('.', ',')} km dele chegam com som.`);
    } else {
      await reply('Não entendi. Envie /ajuda para ver os comandos.');
    }
    return;
  }

  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = rawCmd.slice(1).split('@')[0].toLowerCase();
  const arg = rest.join(' ').trim();

  switch (cmd) {
    case 'start':
    case 'ajuda':
    case 'help':
      await reply(HELP, { locationButton: prefs.places.length === 0 });
      break;

    case 'locais':
      await reply(listPlaces(chatId));
      break;

    case 'addlocal': {
      const m = arg.match(/^(.+?)\s*=\s*(.+)$/);
      if (!m) {
        await reply('Use: <code>/addlocal Casa = endereço</code> ou <code>/addlocal Casa = -22.9, -43.2</code>');
        break;
      }
      const name = m[1].slice(0, 40);
      const coords = m[2].match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      const found = coords ? { lat: Number(coords[1]), lng: Number(coords[2]), label: 'coordenadas' } : await geocode(m[2]);
      if (!found || Math.abs(found.lat) > 90 || Math.abs(found.lng) > 180) {
        await reply('Não encontrei esse endereço no RJ. Tente com bairro e cidade, ou envie a localização pelo 📎.');
        break;
      }
      prefs.places.push({ name, lat: found.lat, lng: found.lng });
      await reply(`✅ <b>${esc(name)}</b> salvo: ${esc(found.label)}\n<a href="https://www.google.com/maps?q=${found.lat},${found.lng}">Conferir no mapa</a>`);
      break;
    }

    case 'remover': {
      const n = Number(arg);
      if (!Number.isInteger(n) || n < 1 || n > prefs.places.length) {
        await reply(`Use <code>/remover N</code>, com N entre 1 e ${prefs.places.length || 1}. Veja /locais.`);
        break;
      }
      const [removed] = prefs.places.splice(n - 1, 1);
      await reply(`🗑️ <b>${esc(removed.name)}</b> removido.`);
      break;
    }

    case 'raio': {
      const km = Number(arg.replace(',', '.'));
      if (!(km >= 0.5 && km <= 20)) {
        await reply(`Raio atual: ${String(prefs.radiusKm).replace('.', ',')} km. Use <code>/raio 3</code> (entre 0,5 e 20).`);
        break;
      }
      prefs.radiusKm = km;
      await reply(`✅ Raio de proximidade: ${String(km).replace('.', ',')} km.`);
      break;
    }

    case 'modo': {
      const m = arg.toLowerCase();
      if (m !== 'todas' && m !== 'perto') {
        await reply(
          `Modo atual: <b>${prefs.mode}</b>.\n<code>/modo todas</code> — toda ocorrência do RJ (as próximas com som)\n<code>/modo perto</code> — só as próximas dos seus locais`,
        );
        break;
      }
      prefs.mode = m;
      await reply(
        m === 'perto' && !prefs.places.length
          ? '✅ Modo <b>perto</b>. Você ainda não tem locais, então nada será enviado até cadastrar um.'
          : `✅ Modo <b>${m}</b>.`,
      );
      break;
    }

    case 'pausar':
      prefs.paused = true;
      await reply('⏸️ Alertas pausados. Use /retomar para voltar.');
      break;

    case 'retomar':
      prefs.paused = false;
      await reply('▶️ Alertas retomados.');
      break;

    case 'ultimas': {
      const recent = lastIncidents.slice(0, 10);
      if (!recent.length) {
        await reply(lastOkAt ? 'Nenhuma ocorrência registrada nas últimas 24 h.' : 'Ainda consultando o Fogo Cruzado, tente em instantes.');
        break;
      }
      const lines = recent.map((i) => incidentLine(i, nearestPlace(i, prefs.places, prefs.radiusKm)));
      await reply([`<b>Últimas ocorrências</b> (${lastIncidents.length} em 24 h):`, '', ...lines].join('\n'));
      break;
    }

    case 'status': {
      const ago = lastOkAt ? `${Math.round((Date.now() - lastOkAt) / 60_000)} min atrás` : 'ainda não';
      const near = lastIncidents.filter((i) => nearestPlace(i, prefs.places, prefs.radiusKm)).length;
      await reply(
        [
          '<b>Status</b>',
          `Alertas: ${prefs.paused ? '⏸️ pausados' : '▶️ ativos'} · modo <b>${prefs.mode}</b>`,
          `Locais: ${prefs.places.length} · raio ${fmtDist(prefs.radiusKm * 1000)}`,
          `Última consulta ao Fogo Cruzado: ${ago}${failingSince ? ' (com falhas)' : ''}`,
          `Ocorrências em 24 h: ${lastIncidents.length} (${near} perto dos seus locais)`,
          `Consulta a cada ${Math.round(POLL_MS / 60_000)} min.`,
        ].join('\n'),
      );
      break;
    }

    default:
      await reply('Comando desconhecido. Envie /ajuda.');
  }
}

async function telegramLoop() {
  await setMyCommands(COMMANDS).catch((e) => log('setMyCommands falhou:', e));
  for (;;) {
    try {
      const updates = await getUpdates(state.updateOffset);
      for (const u of updates) {
        state.updateOffset = u.update_id + 1;
        if (u.message) await handle(u.message).catch((e) => log('erro ao tratar mensagem:', e));
      }
      if (updates.length) saveState(state);
    } catch (e) {
      log('erro no Telegram:', e instanceof Error ? e.message : e);
      await sleep(5000);
    }
  }
}

// ---------- Start ----------

if (!hasToken()) throw new Error('Defina TELEGRAM_BOT_TOKEN (crie o bot com o @BotFather)');
if (!ALLOWED.size) log('TELEGRAM_ALLOWED_CHAT_IDS vazio: envie /start ao bot para descobrir seu chat id. Nenhum alerta será enviado.');
log(`bot iniciado · chats autorizados: ${ALLOWED.size} · consulta a cada ${POLL_MS / 1000}s`);

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    saveState(state);
    process.exit(0);
  });
}

await Promise.all([sourceLoop(), telegramLoop()]);
