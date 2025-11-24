import { downloadMediaMessage } from "baileys";
import { buildText, messageErrorCommandUsage } from "../utils/general.util.js";
import * as waUtil from '../utils/whatsapp.util.js';
import * as imageUtil from '../utils/image.util.js';
import * as audioUtil from '../utils/audio.util.js';
import * as miscUtil from '../utils/misc.util.js';
import { cotacaoMoeda } from '../utils/misc.util.js';
import { extractAudioFromVideo, convertVideoToWhatsApp } from '../utils/convert.util.js';
import utilityCommands from "./utility.list.commands.js";
import { analyzeCryptoEnhanced } from '../utils/misc.util.js';
import { newsLivecoins } from '../utils/misc.util.js';
import { DateTime } from 'luxon';
import NodeCache from 'node-cache';
export { utilityCommands };
////////////////////////////////
// Configurações da Polymarket /
////////////////////////////////
const BRT = 'America/Sao_Paulo';
const GAMMA = 'https://gamma-api.polymarket.com';
const COINGECKO = 'https://api.coingecko.com/api/v3';

// =====================
// Utils de data / rede
// =====================
function todayRangeBRT() {
  const start = DateTime.now().setZone(BRT).startOf('day');
  const end = start.plus({ days: 1 });
  return { start, end };
}

async function getJSON(url, params = {}, timeoutMs = 25000) {
  const qs = new URLSearchParams(params);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}?${qs.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctl.signal
    });
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch {}
      console.error(`getJSON fail ${res.status} @ ${url}`, String(body).slice(0, 400));
      throw new Error(`HTTP ${res.status} @ ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function parseISO(s) {
  if (!s) return null;
  const dt = DateTime.fromISO(s);
  return dt.isValid ? dt : null;
}

// Verifica se o mercado está ATIVO
function isActiveMarket(m) {
  if (m.closed === true || m.resolved === true) return false;
  const end = parseISO(m.endDate || m.closeTime || m.end_time);
  if (!end) return true;
  return end > DateTime.now().setZone(BRT);
}

// Formata expiração em pt-BR
function formatExpirationBRT(m) {
  const end = parseISO(m.endDate || m.closeTime || m.end_time);
  if (!end || !end.isValid) return '';
  return end.setZone(BRT).setLocale('pt-BR').toFormat('dd/LL HH:mm') + ' BRT';
}

// Verifica se é "de hoje"
function isTodayBRT(m) {
  const end = parseISO(m?.endDate || m?.closeTime || m?.end_time);
  if (!end) return false;
  const { start, end: todayEnd } = todayRangeBRT();
  return end >= start && end < todayEnd;
}

// Fallback: próximos 7 dias
function isRecentBRT(m) {
  const end = parseISO(m?.endDate || m?.closeTime || m?.end_time);
  if (!end) return false;
  const now = DateTime.now().setZone(BRT);
  return end >= now && end < now.plus({ days: 7 });
}

// ===========================
// Cache simples em memória
// ===========================
const CACHE = { cgSearch: new Map(), terms: new Map() };
const CACHE_TTL_MS = 30 * 60 * 1000;
function setCache(map, key, val) { map.set(key, { val, t: Date.now() }); }
function getCache(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) { map.delete(key); return null; }
  return hit.val;
}

// =============================================
// Resolver universal: ticker/nome -> search terms
// =============================================
async function resolveAssetTermsDynamic(queryOrTicker) {
  const raw = (queryOrTicker || '').trim();
  if (!raw) throw new Error('Ticker/nome vazio');

  const key = raw.toLowerCase();
  const cache = getCache(CACHE.terms, key);
  if (cache) return cache;

  let cg = getCache(CACHE.cgSearch, key);
  if (!cg) {
    try {
      cg = await getJSON(`${COINGECKO}/search`, { query: raw });
      setCache(CACHE.cgSearch, key, cg);
    } catch { cg = null; }
  }

  let coin = null;
  if (cg?.coins?.length) {
    const exactBySymbol = cg.coins.find(c => (c.symbol||'').toLowerCase() === key);
    const containsInName = cg.coins.find(c => (c.name||'').toLowerCase().includes(key));
    coin = exactBySymbol || containsInName || cg.coins[0];
  }

  const name = coin?.name || raw.toUpperCase();
  const symbol = (coin?.symbol || raw).toUpperCase();

  const sym = symbol.toLowerCase();
  const terms = [
    name,
    ` ${sym} `,
    ` ${sym}/`,
    `${sym}/usdt`,
    `${sym}usdt`,
    ` ${sym}-usd`,
    ` ${sym}-usdt`
  ];

  const out = { name, symbol, terms };
  setCache(CACHE.terms, key, out);
  return out;
}

// =====================
// Polymarket: pesquisa (offset 1000)
// =====================
async function searchMarketsByTerms(terms, displayName) {
  let markets = [];
  try {
    const data = await getJSON(`${GAMMA}/public-search`, { q: displayName });
    for (const ev of data?.events || []) {
      for (const m of ev?.markets || []) markets.push(m);
    }
  } catch {}

  if (markets.length < 5) {
    let offset = 0;
    while (offset < 1000) {
      const evs = await getJSON(`${GAMMA}/events`, {
        closed: 'false',
        order: 'id',
        ascending: 'false',
        limit: 50,
        offset
      });
      if (!evs?.length) break;
      for (const ev of evs) {
        const blob = [ev.title, ev.subtitle, ev.description]
          .filter(Boolean).join(' ').toLowerCase();
        if (terms.some(t => blob.includes(t.toLowerCase()))) {
          for (const m of ev.markets || []) markets.push(m);
        }
      }
      offset += 50;
    }
  }

  const seen = new Set(); const out = [];
  for (const m of markets) {
    const key = m.slug || m.id;
    if (key && !seen.has(key)) { seen.add(key); out.push(m); }
  }
  return out;
}

// =====================================
// Probabilidades e classificação
// =====================================
function toArrayLoose(x) {
  if (x == null) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === 'string') {
    const trimmed = x.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === 'object') return Object.values(parsed);
      } catch {}
    }
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (typeof x === 'object') {
    const vals = Object.values(x);
    if (vals.length) return vals;
    const keys = Object.keys(x);
    if (keys.length) return keys;
  }
  return [];
}

function normalizeOutcomes(obj) {
  let outs = toArrayLoose(obj.shortOutcomes);
  if (!outs.length) outs = toArrayLoose(obj.outcomes);
  if (!outs.length) outs = toArrayLoose(obj.outcomeAssets);
  if (!outs.length) outs = toArrayLoose(obj.outcomeNames);
  if (!outs.length && obj.outcomeNames) outs = toArrayLoose(obj.outcomeNames);

  outs = outs.map(o => {
    if (typeof o === 'object' && o !== null) {
      return String(o.name || o.symbol || o.id || JSON.stringify(o));
    }
    return String(o);
  });

  return outs.map(s => s.replace(/\s+/g, ' ').trim());
}

function normalizePrices(obj) {
  let prices = toArrayLoose(obj.outcomePrices);
  if (!prices.length) prices = toArrayLoose(obj.prices);
  if (!prices.length) prices = toArrayLoose(obj.lastTradePrices);
  if (!prices.length) prices = toArrayLoose(obj.outcomeTokenPrices);
  return prices.map(v => Number(v)).filter(n => Number.isFinite(n));
}

function pickMapValue(map, key) {
  if (!key) return undefined;
  const raw = String(key).trim();
  const variants = [
    raw,
    raw.toUpperCase(),
    raw.toLowerCase(),
    raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
  ];
  for (const k of variants) if (k in map) return map[k];
  return undefined;
}

function numeric(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fromCandidates(obj, keys = []) {
  for (const k of keys) {
    const n = numeric(obj?.[k]);
    if (n != null) return n;
  }
  return null;
}

function mid(a, b) {
  const na = numeric(a), nb = numeric(b);
  if (na != null && nb != null) return (na + nb) / 2;
  return na ?? nb ?? null;
}

function extractYesNoUpDown(market, detail) {
  const src = detail || market;
  let outs = normalizeOutcomes(src);
  let prices = normalizePrices(src);

  let pUp = null, pDn = null;

  if (outs.length && prices.length && outs.length === prices.length) {
    const mp = {};
    for (let i = 0; i < outs.length; i++) {
      const key = outs[i].replace(/\s+/g, ' ').trim();
      const v = numeric(prices[i]);
      if (v != null) {
        mp[key] = v;
        mp[key.toUpperCase()] = v;
        mp[key.toLowerCase()] = v;
        const cap = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
        mp[cap] = v;
      }
    }
    pUp = pickMapValue(mp, 'Up')  ?? pickMapValue(mp, 'YES') ?? pickMapValue(mp, 'Yes');
    pDn = pickMapValue(mp, 'Down')?? pickMapValue(mp, 'NO')  ?? pickMapValue(mp, 'No');

    if (pUp == null || pDn == null) {
      for (const [k, v] of Object.entries(mp)) {
        const kk = ` ${k.toLowerCase()} `;
        if (pUp == null && (kk.includes(' yes ') || kk.includes(' up ')))  pUp = v;
        if (pDn == null && (kk.includes(' no ')  || kk.includes(' down '))) pDn = v;
      }
    }
  }

  if (pUp == null || pDn == null) {
    const srcs = [detail, market].filter(Boolean);
    for (const s of srcs) {
      if (pUp == null) {
        pUp = fromCandidates(s, [
          'yesPrice','lastYesPrice','impliedYes','p_yes',
          'bestBidYes','bestAskYes','probYes','probabilityYes'
        ]);
      }
      if (pDn == null) {
        pDn = fromCandidates(s, [
          'noPrice','lastNoPrice','impliedNo','p_no',
          'bestBidNo','bestAskNo','probNo','probabilityNo'
        ]);
      }
    }
  }

  if ((pUp == null || pDn == null) && Array.isArray(detail?.outcomes)) {
    const mp2 = {};
    for (const o of detail.outcomes) {
      const k = (o?.name || o?.symbol || o?.code || o?.id || '').toString().trim();
      const val = numeric(o?.price ?? o?.probability ?? o?.prob);
      if (k && val != null) {
        mp2[k] = val;
        mp2[k.toUpperCase()] = val;
        mp2[k.toLowerCase()] = val;
      }
    }
    if (pUp == null) pUp = pickMapValue(mp2, 'Up')  ?? pickMapValue(mp2, 'YES') ?? pickMapValue(mp2, 'Yes');
    if (pDn == null) pDn = pickMapValue(mp2, 'Down')?? pickMapValue(mp2, 'NO')  ?? pickMapValue(mp2, 'No');
    if (pUp == null || pDn == null) {
      for (const [k, v] of Object.entries(mp2)) {
        const kk = ` ${k.toLowerCase()} `;
        if (pUp == null && (kk.includes(' yes ') || kk.includes(' up ')))  pUp = v;
        if (pDn == null && (kk.includes(' no ')  || kk.includes(' down '))) pDn = v;
      }
    }
  }

  const ob = detail?.orderbooks || detail?.orderbook || market?.orderbooks || market?.orderbook;
  if ((pUp == null || pDn == null) && ob) {
    if (pUp == null) {
      pUp = mid(ob?.yes?.bestBid?.price,  ob?.yes?.bestAsk?.price)
         ?? mid(ob?.YES?.bestBid?.price,  ob?.YES?.bestAsk?.price)
         ?? mid(ob?.up?.bestBid?.price,   ob?.up?.bestAsk?.price)
         ?? mid(ob?.UP?.bestBid?.price,   ob?.UP?.bestAsk?.price);
    }
    if (pDn == null) {
      pDn = mid(ob?.no?.bestBid?.price,   ob?.no?.bestAsk?.price)
         ?? mid(ob?.NO?.bestBid?.price,   ob?.NO?.bestAsk?.price)
         ?? mid(ob?.down?.bestBid?.price, ob?.down?.bestAsk?.price)
         ?? mid(ob?.DOWN?.bestBid?.price, ob?.DOWN?.bestAsk?.price);
    }
  }

  if (pUp == null && pDn == null && prices.length === 2) {
    const [a, b] = prices.map(numeric);
    if (a != null && b != null) {
      if (a >= b) { pUp = a; pDn = b; } else { pUp = b; pDn = a; }
    }
  }

  return { pUp, pDn, outs, prices };
}

async function fetchMarketsDetails(idsOrSlugs) {
  if (!Array.isArray(idsOrSlugs) || !idsOrSlugs.length) return {};
  const join = idsOrSlugs.join(',');

  let data = [];
  try { data = await getJSON(`${GAMMA}/markets`, { ids: join }); } catch {}
  if (!Array.isArray(data) || data.length === 0) {
    try { data = await getJSON(`${GAMMA}/markets`, { slugs: join }); } catch {}
  }

  const map = {};
  if (Array.isArray(data)) {
    for (const d of data) {
      const k = d?.id || d?.slug;
      if (k) map[k] = d;
    }
  }
  return map;
}

function pct(x) {
  return (x != null && Number.isFinite(x)) ? Math.round(x * 100) : null;
}

// === TRADUÇÃO DE DATAS EM INGLÊS NO TÍTULO ===
function traduzTituloEnPt(t, assetName) {
  if (!t) return '';
  let s = String(t);

  // Meses em inglês → português
  const mesesEN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const mesesPT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  mesesEN.forEach((en, i) => {
    s = s.replace(new RegExp(`\\b${en}\\b`, 'gi'), mesesPT[i]);
  });

  // "in October" → "em outubro"
  s = s.replace(/\bin\s+([a-z]+)\b/gi, (match, mes) => {
    const idx = mesesEN.findIndex(m => m.toLowerCase() === mes.toLowerCase());
    return idx >= 0 ? `em ${mesesPT[idx]}` : match;
  });

  // "by December 31" → "até 31 de dezembro"
  s = s.replace(/\bby\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?(\s+\d{4})?/gi, (match, mes, dia, ano) => {
    const idx = mesesEN.findIndex(m => m.toLowerCase() === mes.toLowerCase());
    const anoStr = ano ? ` ${ano.trim()}` : '';
    return idx >= 0 ? `até ${dia} de ${mesesPT[idx]}${anoStr}` : match;
  });

  // "on October 29" → "em 29 de outubro"
  s = s.replace(/\bon\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?(\s+\d{4})?/gi, (match, mes, dia, ano) => {
    const idx = mesesEN.findIndex(m => m.toLowerCase() === mes.toLowerCase());
    const anoStr = ano ? ` ${ano.trim()}` : '';
    return idx >= 0 ? `em ${dia} de ${mesesPT[idx]}${anoStr}` : match;
  });

  // Regras originais
  s = s.replace(/\bAll Time High\b/ig, 'nova máxima histórica');
  s = s.replace(/^Will\s+the\s+price\s+of\s+/i, 'O preço de ');
  s = s.replace(/\s+be\s+at\s+least\s+/i, ' ficará em pelo menos ');
  s = s.replace(/\s+be\s+less\s+than\s+/i, ' ficará abaixo de ');
  s = s.replace(/\s+be\s+below\s+/i, ' ficará abaixo de ');
  s = s.replace(/\s+be\s+above\s+/i, ' ficará acima de ');
  s = s.replace(/\s+reach\s+/i, ' atingirá ');
  s = s.replace(/\s+hit\s+/i, ' baterá ');
  s = s.replace(/\s+be\s+between\s+([$\£\€]?\s*\d[\d,\.]*)\s+and\s+([$\£\€]?\s*\d[\d,\.]*)/i, ' ficará ENTRE $1 e $2');
  if (/^Will\s/i.test(s)) s = s.replace(/^Will\s/i, 'Será que ');
  s = s.replace(/\?\s*$/i, '?');
  if (assetName && /^O preço de\s+/i.test(s) && !new RegExp(assetName, 'i').test(s)) {
    s = s.replace(/^O preço de\s+/i, `O preço de ${assetName} `);
  }
  return s.trim();
}

function labelsParaTituloPT(tituloPT) {
  const usaSimNao = /acima|abaixo|pelo menos|atingirá|baterá|será que|nova máxima|máxima histórica|entre|above|below|between|at least|reach|hit/i.test(tituloPT);
  return usaSimNao ? { up: 'Sim', down: 'Não' } : { up: 'Alta', down: 'Baixa' };
}

function resumoFinal(score, counts, assetName) {
  let faixa, emoji;
  if (score >= 70) { faixa = 'fortemente ALTISTA'; emoji = '📈'; }
  else if (score >= 55) { faixa = 'levemente ALTISTA'; emoji = '↗️'; }
  else if (score > 45) { faixa = 'NEUTRO'; emoji = '😶'; }
  else if (score > 30) { faixa = 'levemente BAIXISTA'; emoji = '↘️'; }
  else { faixa = 'fortemente BAIXISTA'; emoji = '📉'; }
  return `${emoji} Resumo: O sentimento no Polymarket para ${assetName} está *${faixa}* hoje. ` +
         `Contagem → Altistas: ${counts.altistas}, Baixistas: ${counts.baixistas}, Neutros: ${counts.neutros}.`;
}

function classifyMarket(m, detail = null) {
  const { pUp, pDn } = extractYesNoUpDown(m, detail);
  if (pUp == null || pDn == null) return { label: 'neutro', strength: 0 };
  const diff = pUp - pDn;
  const strength = Math.min(Math.abs(diff), 1);
  const label = diff > 0 ? 'altista' : (diff < 0 ? 'baixista' : 'neutro');
  return { label, strength };
}

async function computeSentiment(markets, { ignoreDate = false } = {}) {
  const ids = markets.map(m => m?.id || m?.slug).filter(Boolean);
  let detailMap = {};
  if (ids.length) {
    try { detailMap = await fetchMarketsDetails(ids); } catch (e) {
      console.error('Erro ao buscar detalhes para sentimento:', e);
    }
  }

  const buckets = { altista: [], baixista: [], neutro: [] };

  const feed = (arr) => {
    for (const m of (arr || [])) {
      try {
        const detail = detailMap[m.id || m.slug];
        const { label, strength } = classifyMarket(m, detail);
        if (!ignoreDate && !isTodayBRT(m) && !isRecentBRT(m)) continue;
        const oi  = Number(m.openInterest ?? m.openInterestNum ?? detail?.openInterest ?? 0) || 0;
        const vol = Number(m.volumeNum ?? m.volume ?? detail?.volumeNum ?? 0) || 0;
        const weight = oi > 0 ? oi : (vol > 0 ? vol : 1);
        (buckets[label] || buckets.neutro).push({ strength, weight, m });
      } catch {}
    }
  };

  if (!ignoreDate) feed(markets);
  if (!ignoreDate && !buckets.altista.length && !buckets.baixista.length && !buckets.neutro.length) {
    return computeSentiment(markets, { ignoreDate: true });
  }

  const weighted = (arr) => {
    const num = arr.reduce((s, it) => s + it.strength * it.weight, 0);
    const den = arr.reduce((s, it) => s + it.weight, 0);
    return den > 0 ? num / den : 0;
  };

  const bull = weighted(buckets.altista);
  const bear = weighted(buckets.baixista);

  let score = 50 + Math.round((bull - bear) * 50);
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    counts: {
      altistas: buckets.altista.length,
      baixistas: buckets.baixista.length,
      neutros:  buckets.neutro.length
    }
  };
}

// =======================================
// RESUMO PRINCIPAL
// =======================================
export async function polymarketResumoPrincipaisMercados(queryOrTicker, { limit = 8 } = {}) {
  const resolved = await resolveAssetTermsDynamic(queryOrTicker);
  const markets = await searchMarketsByTerms(resolved.terms, resolved.name);

  const activeMarkets = markets.filter(m => isActiveMarket(m));
  const { score, counts } = await computeSentiment(activeMarkets.length ? activeMarkets : markets);

  let baseMkts = activeMarkets.length ? activeMarkets : markets;

  const sorted = baseMkts.slice().sort((a, b) => {
    const aVol = Number(a?.volumeNum ?? a?.volume ?? 0) || 0;
    const bVol = Number(b?.volumeNum ?? b?.volume ?? 0) || 0;
    if (bVol !== aVol) return bVol - aVol;
    const aOI = Number(a?.openInterest ?? a?.openInterestNum ?? 0) || 0;
    const bOI = Number(b?.openInterest ?? b?.openInterestNum ?? 0) || 0;
    return bOI - aOI;
  });

  const top = sorted.slice(0, limit);
  const ids = top.map(m => m?.id || m?.slug).filter(Boolean);

  let detailMap = {};
  if (ids.length) {
    try { detailMap = await fetchMarketsDetails(ids); } catch (e) {
      console.error('Erro ao buscar detalhes:', e);
    }
  }

  const cards = [];
  for (const m of top) {
    const key = m?.id || m?.slug;
    const detail = detailMap[key] || m;
    const { pUp, pDn } = extractYesNoUpDown(m, detail);
    const titleRaw = m?.question || m?.groupItemTitle || m?.slug || '';
    const tituloPT = traduzTituloEnPt(titleRaw, resolved.name);
    const { up: labelUp, down: labelDn } = labelsParaTituloPT(tituloPT);
    const upP = pct(pUp), dnP = pct(pDn);

    const vol = Number(m?.volumeNum ?? m?.volume ?? 0) || 0;
    const expiration = formatExpirationBRT(detail);

    let destaque = null;
    if (upP != null && dnP != null) {
      if (upP >= dnP) destaque = { lado: labelUp, prob: upP };
      else destaque = { lado: labelDn, prob: dnP };
    }

    if ((upP === 0 && dnP === 100) || (upP === 100 && dnP === 0)) {
      if (!isActiveMarket(detail)) continue;
    }

    cards.push({
      titulo: tituloPT,
      upLabel: labelUp, upP,
      dnLabel: labelDn, dnP,
      volume: vol,
      destaque,
      expiration
    });
  }

  const today = DateTime.now().setZone(BRT).setLocale('pt-BR').toFormat('dd/LL/yyyy');
  const header = `Sentimento Polymarket by Educabit — ${resolved.name} (${resolved.symbol}) — ${today}`;

  const lines = [
    header, '',
    `Índice de Sentimento (0 = forte baixa, 50 = neutro, 100 = forte alta): ${score}`,
    `Mercados ativos → Altistas: ${counts.altistas} | Baixistas: ${counts.baixistas} | Neutros: ${counts.neutros}`
  ];

  const topVolume = cards.slice(0, Math.min(cards.length, Math.ceil(limit/2)));
  const topResultado = cards
    .filter(c => c.destaque && c.destaque.prob != null)
    .sort((a, b) => (b.destaque.prob ?? -1) - (a.destaque.prob ?? -1))
    .slice(0, Math.min(cards.length, Math.ceil(limit/2)));

  if (topVolume.length) {
    lines.push('', '🔥 Top por volume (preços em tempo real):');
    for (const c of topVolume) {
      const volStr = c.volume ? ` | Vol: $${Math.round(c.volume).toLocaleString('en-US')}` : '';
      const expStr = c.expiration ? ` | Exp: ${c.expiration}` : '';

      const odds = 
        (c.upP != null && c.dnP != null) ? ` — *${c.upLabel} ${c.upP}% / ${c.dnLabel} ${c.dnP}%*` :
        (c.upP != null) ? ` — *${c.upLabel} ${c.upP}%*` :
        (c.dnP != null) ? ` — *${c.dnLabel} ${c.dnP}%*` : '';

      const vencedorStr = c.destaque ? ` | Vencedor atual: *${c.destaque.lado} ${c.destaque.prob}%*` : '';

      lines.push(`• ${c.titulo}${odds}${vencedorStr}${volStr}${expStr}`);
    }
  }

  if (topResultado.length) {
    lines.push('', '🏅 Maiores probabilidades agora:');
    for (const c of topResultado) {
      const tag = c.destaque ? ` — *${c.destaque.lado} ${c.destaque.prob}%*` : '';
      const volStr = c.volume ? ` | Vol: $${Math.round(c.volume).toLocaleString('en-US')}` : '';
      const expStr = c.expiration ? ` | Exp: ${c.expiration}` : '';
      lines.push(`• ${c.titulo}${tag}${volStr}${expStr}`);
    }
  }

  if (!topVolume.length && !topResultado.length) {
    lines.push('', 'Nenhum mercado ativo encontrado no momento. Tente novamente em breve!');
  }

  lines.push('', resumoFinal(score, counts, resolved.name));
  lines.push('', 'Fonte: *Polymarket* ');

  return lines.join('\n');
}

// =======================================
// Handler explícito
// =======================================
export async function polymarketExplicitCommand(client, botInfo, message, group) {
  const prefix = (botInfo?.prefix || '!').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const txt = (message.text || message.body || '').trim();
  const re = new RegExp(`^${prefix}polymarket\\s+([a-z0-9]{2,15})\\b`, 'i');
  const m = txt.match(re);
  if (!m) return false;

  const ticker = m[1].toLowerCase();
  try {
    const reply = await polymarketResumoPrincipaisMercados(ticker, { limit: 8 });
    await waUtil.replyText(client, message.chat_id, reply, message.wa_message, { expiration: message.expiration });
    return true;
  } catch (err) {
    console.error('polymarketExplicitCommand ERROR:', err?.stack || err);
    await waUtil.replyText(
      client,
      message.chat_id,
      'Não consegui obter o sentimento do Polymarket agora. Tente novamente.',
      message.wa_message,
      { expiration: message.expiration }
    );
    return true;
  }
}
export async function ouvirCommand(client, botInfo, message, group) {
    if (!message.isQuoted || message.quotedMessage?.type != 'audioMessage') {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    else if (message.quotedMessage?.media?.seconds && message.quotedMessage?.media?.seconds > 90) {
        throw new Error(utilityCommands.ouvir.msgs.error_audio_limit);
    }
    let audioBuffer = await downloadMediaMessage(message.quotedMessage.wa_message, "buffer", {}, { logger: client.logger, reuploadRequest: client.updateMediaMessage });
    let replyText = await audioUtil.audioTranscription(audioBuffer);
    await waUtil.replyText(client, message.chat_id, buildText(utilityCommands.ouvir.msgs.reply, replyText), message.quotedMessage.wa_message, { expiration: message.expiration });
}
export async function qualmusicaCommand(client, botInfo, message, group) {
    const messageType = message.isQuoted ? message.quotedMessage?.type : message.type;
    if (messageType != "videoMessage" && messageType != "audioMessage") {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const messageData = message.isQuoted
        ? waUtil.ensureMessageParticipant(message.quotedMessage?.wa_message, message.quotedMessage?.sender, message.chat_id)
        : waUtil.ensureMessageParticipant(message.wa_message, message.sender, message.chat_id);
    if (!messageData) {
        throw new Error(utilityCommands.qualmusica.msgs.error_message);
    }
    const messageMediaBuffer = await downloadMediaMessage(messageData, "buffer", {}, { logger: client.logger, reuploadRequest: client.updateMediaMessage });
    await waUtil.replyText(client, message.chat_id, utilityCommands.qualmusica.msgs.wait, message.wa_message, { expiration: message.expiration });
    const musicResult = await audioUtil.musicRecognition(messageMediaBuffer);
    if (!musicResult) {
        throw new Error(utilityCommands.qualmusica.msgs.error_not_found);
    }
    const replyText = buildText(utilityCommands.qualmusica.msgs.reply, musicResult.title, musicResult.producer, musicResult.duration, musicResult.release_date, musicResult.album, musicResult.artists);
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function steamverdeCommand(client, botInfo, message, group) {
    const LIMIT_RESULTS = 20;
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    let gamesList = await miscUtil.searchGame(message.text_command.trim());
    if (!gamesList.length) {
        throw new Error(utilityCommands.steamverde.msgs.error_not_found);
    }
    gamesList = gamesList.length > LIMIT_RESULTS ? gamesList.splice(0, LIMIT_RESULTS) : gamesList;
    let replyText = utilityCommands.steamverde.msgs.reply_title;
    gamesList.forEach((game) => {
        let gamesUrl = game.uris.map((uri) => {
            if (uri.includes('magnet')) {
                return buildText(utilityCommands.steamverde.msgs.link_torrent, uri.split("&dn")[0]);
            }
            else {
                return buildText(utilityCommands.steamverde.msgs.link_direct, uri);
            }
        });
        replyText += buildText(utilityCommands.steamverde.msgs.reply_item, game.title, game.uploader, game.uploadDate, gamesUrl.join(""), game.fileSize.replace('\n', ''));
    });
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function animesCommand(client, botInfo, message, group) {
    const animes = await miscUtil.animeReleases();
    let replyText = utilityCommands.animes.msgs.reply_title;
    animes.forEach((anime) => {
        replyText += buildText(utilityCommands.animes.msgs.reply_item, anime.name.trim(), anime.episode, anime.url);
    });
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function mangasCommand(client, botInfo, message, group) {
    const mangas = await miscUtil.mangaReleases();
    let replyText = utilityCommands.mangas.msgs.reply_title;
    mangas.forEach((manga) => {
        replyText += buildText(utilityCommands.mangas.msgs.reply_item, manga.name.trim(), manga.chapter, manga.url);
    });
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function brasileiraoCommand(client, botInfo, message, group) {
    let seriesSupported = ['A', 'B'];
    let serieSelected;
    if (!message.args.length) {
        serieSelected = 'A';
    }
    else {
        if (!seriesSupported.includes(message.text_command.toUpperCase())) {
            throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
        }
        serieSelected = message.text_command.toUpperCase();
    }
    const { tabela: table, rodadas: rounds } = await miscUtil.brasileiraoTable(serieSelected);
    if (!rounds) {
        throw new Error(utilityCommands.brasileirao.msgs.error_rounds_not_found);
    }
    const [round] = rounds.filter(round => round.rodada_atual === true);
    const { partidas: matches } = round;
    let replyText = buildText(utilityCommands.brasileirao.msgs.reply_title, serieSelected);
    replyText += utilityCommands.brasileirao.msgs.reply_table_title;
    table.forEach(team => {
        replyText += buildText(utilityCommands.brasileirao.msgs.reply_table_item, team.posicao, team.nome, team.pontos, team.jogos, team.vitorias);
    });
    replyText += "\n" + utilityCommands.brasileirao.msgs.reply_round_title;
    matches.forEach(match => {
        replyText += buildText(utilityCommands.brasileirao.msgs.reply_match_item, match.time_casa, match.time_fora, match.data, match.local, match.gols_casa ? match.resultado_texto : '---');
    });
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function encurtarCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const url = await miscUtil.shortenUrl(message.text_command);
    if (!url) {
        throw new Error(utilityCommands.encurtar.msgs.error);
    }
    await waUtil.replyText(client, message.chat_id, buildText(utilityCommands.encurtar.msgs.reply, url), message.wa_message, { expiration: message.expiration });
}
export async function upimgCommand(client, botInfo, message, group) {
    if (message.quotedMessage?.type !== 'imageMessage' && message.type !== 'imageMessage') {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    let imageBuffer;
    if (message.isQuoted && message.quotedMessage?.wa_message) {
        imageBuffer = await downloadMediaMessage(message.quotedMessage.wa_message, 'buffer', {}, { logger: client.logger, reuploadRequest: client.updateMediaMessage });
    }
    else {
        imageBuffer = await downloadMediaMessage(message.wa_message, 'buffer', {}, { logger: client.logger, reuploadRequest: client.updateMediaMessage });
    }
    let imageUrl = await imageUtil.uploadImage(imageBuffer);
    await waUtil.replyText(client, message.chat_id, buildText(utilityCommands.upimg.msgs.reply, imageUrl), message.wa_message, { expiration: message.expiration });
}
export async function filmesCommand(client, botInfo, message, group) {
    let movieTrendings = await miscUtil.moviedbTrendings("movie");
    await waUtil.replyText(client, message.chat_id, buildText(utilityCommands.filmes.msgs.reply, movieTrendings), message.wa_message, { expiration: message.expiration });
}
export async function seriesCommand(client, botInfo, message, group) {
    let movieTrendings = await miscUtil.moviedbTrendings("tv");
    await waUtil.replyText(client, message.chat_id, buildText(utilityCommands.series.msgs.reply, movieTrendings), message.wa_message, { expiration: message.expiration });
}
export async function rbgCommand(client, botInfo, message, group) {
    if (!message.isMedia && !message.isQuoted) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    let messageData = {
        type: (message.isMedia) ? message.type : message.quotedMessage?.type,
        wa_message: (message.isQuoted)
            ? waUtil.ensureMessageParticipant(message.quotedMessage?.wa_message, message.quotedMessage?.sender, message.chat_id)
            : waUtil.ensureMessageParticipant(message.wa_message, message.sender, message.chat_id)
    };
    if (!messageData.type || !messageData.wa_message) {
        throw new Error(utilityCommands.rbg.msgs.error_message);
    }
    else if (messageData.type != "imageMessage") {
        throw new Error(utilityCommands.rbg.msgs.error_only_image);
    }
    await waUtil.replyText(client, message.chat_id, utilityCommands.rbg.msgs.wait, message.wa_message, { expiration: message.expiration });
    let imageBuffer = await downloadMediaMessage(messageData.wa_message, "buffer", {}, { logger: client.logger, reuploadRequest: client.updateMediaMessage });
    let replyImageBuffer = await imageUtil.removeBackground(imageBuffer);
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', replyImageBuffer, '', message.wa_message, { expiration: message.expiration });
}
export async function audioCommand(client, botInfo, message, group) {
    if (!message.isMedia && !message.isQuoted) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    let messageData = {
        type: (message.isMedia) ? message.type : message.quotedMessage?.type,
        wa_message: (message.isQuoted)
            ? waUtil.ensureMessageParticipant(message.quotedMessage?.wa_message, message.quotedMessage?.sender, message.chat_id)
            : waUtil.ensureMessageParticipant(message.wa_message, message.sender, message.chat_id)
    };
    if (!messageData.type || !messageData.wa_message) {
        throw new Error(utilityCommands.audio.msgs.error_message);
    }
    else if (messageData.type != "videoMessage") {
        throw new Error(utilityCommands.audio.msgs.error_only_video);
    }
    let videoBuffer = await downloadMediaMessage(messageData.wa_message, "buffer", {}, { logger: client.logger, reuploadRequest: client.updateMediaMessage });
    let replyAudioBuffer = await extractAudioFromVideo('buffer', videoBuffer);
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', replyAudioBuffer, '', message.wa_message, { expiration: message.expiration, mimetype: 'audio/mpeg' });
}
export async function tabelaCommand(client, botInfo, message, group) {
    const replyText = await miscUtil.symbolsASCI();
    await waUtil.replyText(client, message.chat_id, buildText(utilityCommands.tabela.msgs.reply, replyText), message.wa_message, { expiration: message.expiration });
}
export async function letraCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const musicLyrics = await miscUtil.musicLyrics(message.text_command);
    if (!musicLyrics) {
        throw new Error(utilityCommands.letra.msgs.error_not_found);
    }
    const replyText = buildText(utilityCommands.letra.msgs.reply, musicLyrics.title, musicLyrics.artist, musicLyrics.lyrics);
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', musicLyrics.image, replyText, message.wa_message, { expiration: message.expiration });
}
export async function efeitoaudioCommand(client, botInfo, message, group) {
    const supportedEffects = ['estourar', 'x2', 'reverso', 'grave', 'agudo', 'volume'];
    if (!message.args.length || !supportedEffects.includes(message.text_command.trim().toLowerCase()) || !message.isQuoted || message.quotedMessage?.type != "audioMessage") {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const effectSelected = message.text_command.trim().toLowerCase();
    const audioBuffer = await downloadMediaMessage(message.quotedMessage.wa_message, "buffer", {}, { logger: client.logger, reuploadRequest: client.updateMediaMessage });
    const replyAudioBuffer = await audioUtil.audioModified(audioBuffer, effectSelected);
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', replyAudioBuffer, '', message.wa_message, { expiration: message.expiration, mimetype: 'audio/mpeg' });
}
export async function traduzCommand(client, botInfo, message, group) {
    const languageSupported = ["pt", "es", "en", "ja", "it", "ru", "ko"];
    let languageTranslation;
    let textTranslation;
    if (message.isQuoted && (message.quotedMessage?.type == 'conversation' || message.quotedMessage?.type == 'extendedTextMessage')) {
        if (!message.args.length) {
            throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
        }
        languageTranslation = message.args[0];
        textTranslation = message.quotedMessage.body || message.quotedMessage.caption;
    }
    else if (!message.isQuoted && (message.type == 'conversation' || message.type == 'extendedTextMessage')) {
        if (message.args.length < 2) {
            throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
        }
        [languageTranslation, ...textTranslation] = message.args;
        textTranslation = textTranslation.join(" ");
    }
    else {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    if (!languageSupported.includes(languageTranslation)) {
        throw new Error(utilityCommands.traduz.msgs.error);
    }
    const replyTranslation = await miscUtil.translationGoogle(textTranslation, languageTranslation);
    const replyText = buildText(utilityCommands.traduz.msgs.reply, textTranslation, replyTranslation);
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function vozCommand(client, botInfo, message, group) {
    const languageSupported = ["pt", 'en', 'ja', 'es', 'it', 'ru', 'ko', 'sv'];
    let languageVoice;
    let textVoice;
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    else if (message.isQuoted && (message.quotedMessage?.type == 'extendedTextMessage' || message.quotedMessage?.type == 'conversation')) {
        languageVoice = message.args[0];
        textVoice = message.quotedMessage.body || message.quotedMessage.caption;
    }
    else {
        [languageVoice, ...textVoice] = message.args;
        textVoice = textVoice.join(" ");
    }
    if (!languageSupported.includes(languageVoice)) {
        throw new Error(utilityCommands.voz.msgs.error_not_supported);
    }
    else if (!textVoice) {
        throw new Error(utilityCommands.voz.msgs.error_text);
    }
    else if (textVoice.length > 500) {
        throw new Error(utilityCommands.voz.msgs.error_text_long);
    }
    const replyAudioBuffer = await audioUtil.textToVoice(languageVoice, textVoice);
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', replyAudioBuffer, '', message.wa_message, { expiration: message.expiration, mimetype: 'audio/mpeg' });
}
export async function noticiasCommand(client, botInfo, message, group) {
  const userText = message.text || message.body || "";
  const args = userText.replace(/^!noticias/i, "").trim().split(/\s+/).filter(Boolean);

  let newsList;
  try {
    // newsLivecoins retorna: { title, published, author, url, summary?, image? }
    newsList = await miscUtil.newsLivecoins(args);
  } catch (err) {
    return waUtil.replyText(
      client,
      message.chat_id,
      "Erro ao buscar notícias: " + (err.message || "Tente mais tarde."),
      message.wa_message,
      { expiration: message.expiration }
    );
  }

  if (!Array.isArray(newsList) || newsList.length === 0) {
    return waUtil.replyText(
      client,
      message.chat_id,
      (utilityCommands?.noticias?.msgs?.reply_title || "🗞️ Notícias") +
        "\nNenhuma notícia encontrada para os termos: " + (args.join(", ") || "todas"),
      message.wa_message,
      { expiration: message.expiration }
    );
  }

  await waUtil.replyText(
    client,
    message.chat_id,
    (utilityCommands?.noticias?.msgs?.reply_title || "🗞️ Notícias"),
    message.wa_message,
    { expiration: message.expiration }
  );

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function fetchImageToBuffer(url, { maxBytes = 8 * 1024 * 1024 } = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    try {
      const fetchImpl = globalThis.fetch || (await import('node-fetch')).default;
      const res = await fetchImpl(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EducabitBot/1.0',
          'Accept': 'image/avif,image/webp,image/apng,image/*;q=0.8,*/*;q=0.5',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ctype = res.headers.get('content-type') || '';
      if (!/^image\//i.test(ctype)) throw new Error(`Tipo não suportado: ${ctype}`);

      const ab = await res.arrayBuffer();
      if (ab.byteLength > maxBytes) throw new Error('Imagem muito grande');
      return { buffer: Buffer.from(ab), mime: ctype };
    } finally {
      clearTimeout(t);
    }
  }

  // util: sanitiza e limita tamanho de texto
  function clamp(str, max = 600) {
    if (!str) return '';
    let s = String(str).replace(/\s+/g, ' ').trim();
    if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
    return s;
  }

  for (const news of newsList) {
    const title = clamp(news.title) || 'Sem título';
    const author = clamp(news.author) || 'Desconhecido';
    const published = clamp(news.published) || 'Data desconhecida';
    const link = news.url || '';
    const summary = clamp(news.summary);

    // 🔒 Montagem manual da legenda — NENHUM placeholder/templating
    let caption = `*${title}*`;
    if (summary) caption += `\nResumo: ${summary}`;
    caption += `\n• Link: ${link}`;

    try {
      if (news.image) {
        await client.sendMessage(
          message.chat_id,
          { image: { url: news.image }, caption },
          { quoted: message.wa_message, ephemeralExpiration: message.expiration }
        );
      } else {
        await client.sendMessage(
          message.chat_id,
          { text: caption },
          { quoted: message.wa_message, ephemeralExpiration: message.expiration }
        );
      }
    } catch (e) {
      console.error('[Noticias] Falha ao enviar imagem por URL:', e?.message || e);
      if (news.image) {
        try {
          const got = await fetchImageToBuffer(news.image);
          await client.sendMessage(
            message.chat_id,
            { image: got.buffer, mimetype: got.mime, caption },
            { quoted: message.wa_message, ephemeralExpiration: message.expiration }
          );
        } catch (fallbackErr) {
          console.error('[Noticias] Falha no fallback de buffer:', fallbackErr?.message || fallbackErr);
          await client.sendMessage(
            message.chat_id,
            { text: caption },
            { quoted: message.wa_message, ephemeralExpiration: message.expiration }
          );
        }
      } else {
        await client.sendMessage(
          message.chat_id,
          { text: caption },
          { quoted: message.wa_message, ephemeralExpiration: message.expiration }
        );
      }
    }

    await sleep(1000);
  }
}
export async function analiseCommand(client, botInfo, message, group) {
  try {
    const txt = (message.text || message.body || '').trim();
    const parts = txt.replace(/^!analise\b/i, '').trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      const help = [
        'Uso: !analise <símbolo|nome> [moeda] [dias]',
        'Ex.: !analise btc',
        'Ex.: !analise bitcoin 90d',
        'Ex.: !analise eth usd 30d',
      ].join('\n');
      await waUtil.replyText(client, message.chat_id, help, message.wa_message, { expiration: message.expiration });
      return;
    }

    const asset = parts[0];
    let currency = 'usd';
    let days = 30;

    for (let i = 1; i < parts.length; i++) {
      const p = parts[i].toLowerCase();
      if (/^\d+d$/.test(p)) days = parseInt(p, 10);
      else if (/^[a-z]{3,4}$/.test(p)) currency = p; // brl, usd, usdt...
    }

    const data = await analyzeCryptoEnhanced(asset, { currency, days });

    // Noticias do Livecoins relacionadas ao ativo
    const newsTerms = [data.symbol, data.name].filter(Boolean).map(s => s.toLowerCase());
    let newsBlock = '';
    try {
      const news = await newsLivecoins(newsTerms, 2); // 2 manchetes
      if (news?.length) {
        newsBlock = '\nÚltimas notícias relacionadas:\n' +
          news.map(n => `• ${n.title}\n${n.url}`).join('\n');
      }
    } catch { /* silencioso */ }

    const title = `📊 Análise — ${data.name} (${data.symbol}) em ${data.currency}`;
    const lines = [
      title,
      '',
      data.tldr,
      '',
      'Pontos rápidos:',
      ...data.bullets.map(b => `• ${b}`),
    ];

    // Catalisadores
    if (data.catalysts?.length) {
      lines.push('', 'Catalisadores/Atualizações recentes:');
      for (const c of data.catalysts) {
        const one = `• ${c.title}${c.date ? ` — ${c.date}` : ''}\n${c.description || ''}${c.url ? `\n${c.url}` : ''}`;
        lines.push(one.trim());
      }
    }

    // Sentimento
    const s = data.sentiment || {};
    const sParts = [];
    if (s.funding) sParts.push(`Funding (Binance ${s.funding.perp}): ${s.funding.rate >= 0 ? '+' : ''}${s.funding.rate.toFixed(4)}% — ${s.funding.time}`);
    if (s.btcDominance != null) sParts.push(`Dominância BTC: ${s.btcDominance.toFixed(1)}%`);
    if (sParts.length) {
      lines.push('', 'Sentimento de mercado:', ...sParts.map(x => `• ${x}`));
    }

    if (newsBlock) lines.push('', newsBlock);

    lines.push('', `Fonte: ${data.source}`);

    const reply = lines.join('\n');

    await waUtil.replyText(client, message.chat_id, reply, message.wa_message, { expiration: message.expiration });
  } catch (err) {
    console.error('Erro no comando !analise:', err?.message || err);
    await waUtil.replyText(
      client,
      message.chat_id,
      'Não consegui gerar a análise agora. Tente novamente em instantes ou altere o ativo/período.',
      message.wa_message,
      { expiration: message.expiration }
    );
  }
}
export async function calcCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const calcResult = await miscUtil.calcExpression(message.text_command);
    if (!calcResult) {
        throw new Error(utilityCommands.calc.msgs.error_invalid_result);
    }
    const replyText = buildText(utilityCommands.calc.msgs.reply, calcResult);
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function pesquisaCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    let webSearchList = await miscUtil.webSearchGoogle(message.text_command);
    let replyText = buildText(utilityCommands.pesquisa.msgs.reply_title, message.text_command);
    if (!webSearchList.length) {
        throw new Error(utilityCommands.pesquisa.msgs.error_not_found);
    }
    for (let search of webSearchList) {
        replyText += buildText(utilityCommands.pesquisa.msgs.reply_item, search.title, search.url);
    }
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function moedaCommand(client, botInfo, message, group) {
  const FIAT = new Set(["dolar", "iene", "euro", "real"]);
  const args = Array.isArray(message.args)
    ? message.args.map(a => String(a).trim()).filter(Boolean)
    : [];

  if (args.length === 0) {
    throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
  }

  const base = args[0].toLowerCase();
  const isFiat = FIAT.has(base);

  // ---------- 1) FIAT • "!moeda dolar 100" (comportamento antigo mantido)
  if (isFiat) {
    if (args.length !== 2) {
      throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const valor = Number(String(args[1]).replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error(utilityCommands.moeda.msgs.error_invalid_value);
    }

    const convertData = await miscUtil.convertCurrency(base, valor);

    let replyText = buildText(
      utilityCommands.moeda.msgs.reply_title,
      convertData.currency,
      convertData.value
    );

    for (const convert of convertData.convertion) {
      replyText += buildText(
        utilityCommands.moeda.msgs.reply_item,
        convert.convertion_name,
        convert.value_converted_formatted,
        convert.currency,
        convert.updated
      );
    }

    return waUtil.replyText(
      client, message.chat_id, replyText, message.wa_message,
      { expiration: message.expiration }
    );
  }

  // Helper para formatar moedas
  const fmt = (v, ccy) => new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: ccy
  }).format(v);

  // Constrói a query completa para repassar ao cotacaoMoeda
  // (isso permite "!moeda btc, eth, sol" e "!moeda top 25")
  const queryStr = args.join(" ");

  // ---------- 2) CRIPTO COM QUANTIDADE • "!moeda bitcoin 2.5"
  // Se houver 2 argumentos e o 2º for número, tratamos como "1 cripto + quantidade"
  if (args.length === 2) {
    const quantidade = Number(String(args[1]).replace(",", "."));
    if (Number.isFinite(quantidade) && quantidade > 0) {
      const res = await cotacaoMoeda(`!moeda ${base}`);
      if (!res?.ok) {
        const msg = res?.message ?? "Erro ao obter cotação.";
        return waUtil.replyText(
          client, message.chat_id, msg, message.wa_message,
          { expiration: message.expiration }
        );
      }

      // res.coins = [{id, symbol, name}], res.prices = { [id]: {usd, brl, eur, ...} }
      const coin = Array.isArray(res.coins) ? res.coins[0] : null;
      const row  = coin ? res.prices?.[coin.id] : null;

      if (!coin || !row) {
        const msg = "Não encontrei a cotação desse ativo agora.";
        return waUtil.replyText(
          client, message.chat_id, msg, message.wa_message,
          { expiration: message.expiration }
        );
      }

      const symbol = coin.symbol || "CRYPTO";
      const linhas = [];

      if (typeof row.brl === "number") {
        linhas.push(`• BRL: ${fmt(row.brl * quantidade, "BRL")}  (1 ${symbol} = ${fmt(row.brl, "BRL")})`);
      }
      if (typeof row.usd === "number") {
        linhas.push(`• USD: ${fmt(row.usd * quantidade, "USD")}  (1 ${symbol} = ${fmt(row.usd, "USD")})`);
      }
      if (typeof row.eur === "number") {
        linhas.push(`• EUR: ${fmt(row.eur * quantidade, "EUR")}  (1 ${symbol} = ${fmt(row.eur, "EUR")})`);
      }

      const reply =
`📊 ${quantidade} ${symbol}
${linhas.join("\n")}`;

      return waUtil.replyText(
        client, message.chat_id, reply, message.wa_message,
        { expiration: message.expiration }
      );
    }
    // Se o 2º argumento NÃO é número, pode ser algo como "top 10" → repassa
  }

  // ---------- 3) DEMAIS CASOS DE CRIPTO / LISTAS / TOP N
  // Aqui aceitamos:
  // • "!moeda bitcoin"
  // • "!moeda btc, eth, sol"
  // • "!moeda top" ou "!moeda top 25"
  {
    const res = await cotacaoMoeda(`!moeda ${queryStr}`);
    const reply = res?.message || "Não foi possível obter a cotação agora.";
    return waUtil.replyText(
      client, message.chat_id, reply, message.wa_message,
      { expiration: message.expiration }
    );
  }
}
export async function climaCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    let wheatherResult = await miscUtil.wheatherInfo(message.text_command);
    let replyText = buildText(utilityCommands.clima.msgs.reply, message.text_command, wheatherResult.location.name, wheatherResult.location.region, wheatherResult.location.country, wheatherResult.location.current_time, wheatherResult.current.temp, wheatherResult.current.feelslike, wheatherResult.current.condition, wheatherResult.current.wind, wheatherResult.current.humidity, wheatherResult.current.cloud);
    wheatherResult.forecast.forEach((forecast) => {
        replyText += buildText(utilityCommands.clima.msgs.reply_forecast, forecast.day, forecast.max, forecast.min, forecast.condition, forecast.max_wind, forecast.chance_rain, forecast.chance_snow, forecast.uv);
    });
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function dddCommand(client, botInfo, message, group) {
    let dddSelected;
    if (message.isQuoted) {
        let internationalCode = message.quotedMessage?.sender.slice(0, 2);
        if (internationalCode != "55") {
            throw new Error(utilityCommands.ddd.msgs.error);
        }
        dddSelected = message.quotedMessage?.sender.slice(2, 4);
    }
    else if (message.args.length) {
        dddSelected = message.text_command;
    }
    if (!dddSelected) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    let dddResult = await miscUtil.infoDDD(dddSelected);
    if (!dddResult) {
        throw new Error(utilityCommands.ddd.msgs.error_not_found);
    }
    const replyText = buildText(utilityCommands.ddd.msgs.reply, dddResult.state, dddResult.region);
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function qualanimeCommand(client, botInfo, message, group) {
    const messageData = {
        type: (message.isQuoted) ? message.quotedMessage?.type : message.type,
        message: (message.isQuoted)
            ? waUtil.ensureMessageParticipant(message.quotedMessage?.wa_message, message.quotedMessage?.sender, message.chat_id)
            : waUtil.ensureMessageParticipant(message.wa_message, message.sender, message.chat_id)
    };
    if (messageData.type != "imageMessage") {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    else if (!messageData.message) {
        throw new Error(utilityCommands.qualanime.msgs.error_message);
    }
    await waUtil.replyText(client, message.chat_id, utilityCommands.qualanime.msgs.wait, message.wa_message, { expiration: message.expiration });
    const imageBuffer = await downloadMediaMessage(messageData.message, "buffer", {}, { logger: client.logger, reuploadRequest: client.updateMediaMessage });
    const animeInfo = await imageUtil.animeRecognition(imageBuffer);
    if (!animeInfo) {
        throw new Error(utilityCommands.qualanime.msgs.error_not_found);
    }
    else if (animeInfo.similarity < 87) {
        throw new Error(utilityCommands.qualanime.msgs.error_similarity);
    }
    const videoBuffer = await convertVideoToWhatsApp('url', animeInfo.preview_url);
    const replyText = buildText(utilityCommands.qualanime.msgs.reply, animeInfo.title, animeInfo.episode || "---", animeInfo.initial_time, animeInfo.final_time, animeInfo.similarity, animeInfo.preview_url);
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', videoBuffer, replyText, message.wa_message, { expiration: message.expiration, mimetype: 'video/mp4' });
}
