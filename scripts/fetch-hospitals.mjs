// Builds public/data/hospitais.geojson from the Ministry of Health open CNES API.
// Keeps public (natureza jurídica 1xxx) emergency units in the state of RJ:
// UPAs / pronto atendimento, prontos-socorros, and 24h general/specialized hospitals.
//
// Usage: node scripts/fetch-hospitals.mjs
import fs from 'node:fs';

const API = 'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';
const UF_RJ = 33;
const PAGE = 20; // the API caps pages at 20 regardless of `limit`
const OUT = new URL('../public/data/hospitais.geojson', import.meta.url);

// codigo_tipo_unidade → category shown in the app
const TYPES = {
  73: 'upa', // Pronto Atendimento (UPA)
  20: 'pronto-socorro', // Pronto Socorro Geral
  21: 'pronto-socorro', // Pronto Socorro Especializado
  5: 'hospital', // Hospital Geral
  7: 'hospital', // Hospital Especializado
};
const TURNO_24H = '06';

async function getPage(tipo, offset, attempt = 1) {
  const url = `${API}?codigo_uf=${UF_RJ}&codigo_tipo_unidade=${tipo}&limit=${PAGE}&offset=${offset}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).estabelecimentos ?? [];
  } catch (e) {
    if (attempt >= 4) throw new Error(`${url}: ${e.message}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return getPage(tipo, offset, attempt + 1);
  }
}

function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/(^|\s|\(|-)(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase());
}

/** Drops administrative noise: "Sms Hospital Municipal X Ap 21" → "Hospital Municipal X". */
function cleanName(s) {
  return s
    .replace(/^(Sms|Smsdc|Ses Rj|Ses|Fms)\s+/i, '')
    .replace(/\s+(Ap\s*\d+(\.\d+)?|Smsm?|Sms\w*)$/i, '')
    .trim();
}

// Public, but not an option for a civilian emergency walk-in.
const EXCLUDE = /militar|for[cç]a a[eé]rea|naval|marinha|aeron[aá]utica|ex[eé]rcito|pol[ií]cia|bombeiro|psiqui|pinel|penitenci|prisional|presid[ií]|custodia/i;
const MATERNITY = /maternidade|materno|perinatal|da mulher/i;
// Specialized hospitals (tipo 7) only count when they take emergency walk-ins of a broad group.
const SPECIALIZED_EMERGENCY = /infantil|crian[cç]a|pedi[aá]tri|trauma|emerg|urg[eê]ncia|pronto/i;

const features = [];
for (const [tipo, baseCategory] of Object.entries(TYPES)) {
  let offset = 0;
  let kept = 0;
  for (;;) {
    const page = await getPage(tipo, offset);
    for (const e of page) {
      const isPublic = String(e.descricao_natureza_juridica_estabelecimento ?? '').startsWith('1');
      const is24h = e.codigo_identificador_turno_atendimento === TURNO_24H;
      const lat = e.latitude_estabelecimento_decimo_grau;
      const lng = e.longitude_estabelecimento_decimo_grau;
      if (!isPublic || !is24h || typeof lat !== 'number' || typeof lng !== 'number') continue;
      // Discard obviously broken coordinates (outside the state's bounding box).
      if (lat < -23.5 || lat > -20.7 || lng < -45 || lng > -40.8) continue;
      const rawName = `${e.nome_fantasia ?? ''} ${e.nome_razao_social ?? ''}`;
      if (EXCLUDE.test(rawName)) continue;
      if (tipo === '7' && !MATERNITY.test(rawName) && !SPECIALIZED_EMERGENCY.test(rawName)) continue;
      const category = baseCategory === 'hospital' && MATERNITY.test(rawName) ? 'maternidade' : baseCategory;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          cnes: e.codigo_cnes,
          nome: cleanName(titleCase(e.nome_fantasia ?? e.nome_razao_social ?? 'Unidade de saúde')),
          tipo: category,
          esfera: e.descricao_esfera_administrativa ?? null,
          endereco: [e.endereco_estabelecimento, e.numero_estabelecimento, e.bairro_estabelecimento].filter(Boolean).map(titleCase).join(', '),
          municipio: e.codigo_municipio,
          telefone: e.numero_telefone_estabelecimento?.replace(/\s+/g, ' ').trim() || null,
          atualizado: e.data_atualizacao ?? null,
        },
      });
      kept++;
    }
    process.stdout.write(`\rtipo ${tipo}: offset ${offset}, mantidos ${kept}   `);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  process.stdout.write('\n');
}

const fc = { type: 'FeatureCollection', generated: new Date().toISOString(), source: 'CNES / Ministério da Saúde', features };
fs.writeFileSync(OUT, JSON.stringify(fc));
console.log(`${features.length} unidades → ${OUT.pathname}`);
