import axios from 'axios';
import { prettyNum } from 'pretty-num';
import { translate } from '@vitalets/google-translate-api';
import google from '@victorsouzaleal/googlethis';
import { OrganicResult, search } from 'google-sr';
import Genius from 'genius-lyrics';
import qs from 'querystring';
import { showConsoleLibraryError, timestampToDate } from './general.util.js';
import { obterDadosBrasileiraoA, obterDadosBrasileiraoB } from '@victorsouzaleal/brasileirao';
import { JSDOM } from 'jsdom';
import UserAgent from 'user-agents';
import moment from 'moment-timezone';
import Fuse from 'fuse.js';
import botTexts from '../helpers/bot.texts.helper.js';
import Parser from 'rss-parser';
import crypto from 'crypto';

export async function animeReleases() {
    try {
        const URL_BASE = 'https://animedays.org/';
        const { data: animesResponse } = await axios.get(URL_BASE, { headers: { "User-Agent": new UserAgent().toString() } });
        const { window: { document } } = new JSDOM(animesResponse);
        let $animes = document.querySelectorAll('div.postbody > div:nth-child(2) > div.listupd.normal > div.excstf > article > div');
        let animes = [];
        for (let $anime of $animes) {
            let name = $anime.querySelector('a > div.tt > h2')?.innerHTML;
            let episode = $anime.querySelector('a > div.limit > div.bt > span.epx')?.innerHTML;
            let url = $anime.querySelector('a')?.href;
            if (!name || !episode || !url) {
                continue;
            }
            name = name.split("Episódio")[0];
            animes.push({
                name,
                episode,
                url
            });
        }
        return animes;
    }
    catch (err) {
        showConsoleLibraryError(err, 'animeReleases');
        throw new Error(botTexts.library_error);
    }
}
export async function mangaReleases() {
    try {
        const URL_BASE = 'https://mangabr.net/';
        const { data: mangasResponse } = await axios.get(URL_BASE, { headers: { "User-Agent": new UserAgent().toString() } });
        const { window: { document } } = new JSDOM(mangasResponse);
        let $mangas = document.querySelectorAll('div.col-6.col-sm-3.col-md-3.col-lg-2.p-1');
        let mangas = [];
        for (let $manga of $mangas) {
            let name = $manga.querySelector('h3.chapter-title > span.series-name')?.innerHTML.trim();
            let chapter = $manga.querySelector('h3.chapter-title > span.chapter-name')?.innerHTML.trim();
            let url = `https://mangabr.net${$manga.querySelector('a.link-chapter')?.getAttribute('href')}`;
            if (!name || !chapter) {
                continue;
            }
            mangas.push({
                name,
                chapter,
                url
            });
        }
        return mangas;
    }
    catch (err) {
        showConsoleLibraryError(err, 'mangaReleases');
        throw new Error(botTexts.library_error);
    }
}
export async function brasileiraoTable(serie) {
    try {
        let table;
        if (serie == "A") {
            table = await obterDadosBrasileiraoA();
        }
        else if (serie == "B") {
            table = await obterDadosBrasileiraoB();
        }
        else {
            throw new Error("Unsupported league");
        }
        return table;
    }
    catch (err) {
        showConsoleLibraryError(err, 'brasileiraoTable');
        throw new Error(botTexts.library_error);
    }
}
export async function moviedbTrendings(type = "movie") {
    try {
        let num = 0;
        const BASE_URL = `https://api.themoviedb.org/3/trending/${type}/day?api_key=6618ac868ff51ffa77d586ee89223f49&language=pt-BR`;
        const { data: movieDbResponse } = await axios.get(BASE_URL);
        const trendings = movieDbResponse.results.map((item) => {
            num++;
            return `${num}°: *${item.title || item.name}.*\n\`Sinopse:\` ${item.overview} \n`;
        }).join('\n');
        return trendings;
    }
    catch (err) {
        showConsoleLibraryError(err, 'moviedbTrendings');
        throw new Error(botTexts.library_error);
    }
}
export async function calcExpression(expr) {
    try {
        const URL_BASE = 'https://api.mathjs.org/v4/';
        expr = expr.replace(/[Xx\xD7]/g, "*");
        expr = expr.replace(/\xF7/g, "/");
        expr = expr.replace(/,/g, ".");
        expr = expr.replace("em", "in");
        const { data: calcResponse } = await axios.post(URL_BASE, { expr });
        let calcResult = calcResponse.result;
        if (calcResult == "NaN" || calcResult == "Infinity") {
            return null;
        }
        calcResult = calcResult.split(" ");
        calcResult[0] = (calcResult[0].includes("e")) ? prettyNum(calcResult[0]) : calcResult[0];
        calcResult = calcResult.join(" ");
        return calcResult;
    }
    catch (err) {
        showConsoleLibraryError(err, 'calcExpression');
        throw new Error(botTexts.library_error);
    }
}
const parser = new Parser();

export async function newsLivecoins(filters = [], limit = 5) {
  try {
    const feed = await parser.parseURL('https://livecoins.com.br/noticias/feed');

    const normalize = (str = '') =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const terms = (filters || []).map(normalize).filter(Boolean);

    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    });

    // util: fetch seguro (Node >=18 usa global fetch; senão tenta node-fetch)
    const fetchSafe = await getFetchSafe();

    // mapeia e já limita
    const rawItems = (feed.items || [])
      .filter((news) => {
        if (terms.length === 0) return true;
        const hay = normalize(`${news.title || ''} ${news.contentSnippet || ''}`);
        return terms.some((t) => hay.includes(t));
      })
      .slice(0, limit);

    const results = [];
    for (const news of rawItems) {
      const base = {
        title: news.title,
        published: news.pubDate ? formatter.format(new Date(news.pubDate)) : '',
        author: news.creator || 'Livecoins',
        url: news.link,
      };

      // Extrai o primeiro parágrafo como resumo
      const summary = tryFirstParagraph(news);

      // 1) Tenta imagem do enclosure
      let image = tryEnclosureImage(news);

      // 2) Tenta primeira <img> do conteúdo do item do feed
      if (!image) {
        const fromContent = tryImageFromContent(news, news.link);
        if (fromContent) image = fromContent;
      }

      // 3) Último recurso: baixa a página e pega og:image/twitter:image
      if (!image && fetchSafe && news.link) {
        try {
          const og = await tryOgImage(fetchSafe, news.link);
          if (og) image = og;
        } catch {
          // silencioso: sem travar a função
        }
      }

      results.push({ ...base, ...(summary ? { summary } : {}), ...(image ? { image } : {}) });
    }

    return results;
  } catch (err) {
    console.error('Erro ao buscar notícias do Livecoins:', err);
    throw new Error('Não foi possível carregar as notícias no momento.');
  }
}

/* ===== Helpers internos (sem dependências externas obrigatórias) ===== */

// Usa enclosure.url quando existir (rss-parser costuma popular isso em alguns feeds)
function tryEnclosureImage(item) {
  const enc = item?.enclosure;
  if (!enc) return null;
  // rss-parser geralmente traz { url, type, length }
  const url = enc.url || enc.link;
  if (!url) return null;
  if (isImageLike(enc.type) || looksLikeImageUrl(url)) return url;
  return null;
}
function isImageLike(mime = '') {
  return String(mime).startsWith('image/');
}
function looksLikeImageUrl(u = '') {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(u);
}

// Extrai primeira <img src="..."> do conteúdo do item do feed (sem cheerio)
function tryImageFromContent(item, baseUrl) {
  const html = item?.['content:encoded'] || item?.content || item?.contentSnippet || '';
  if (!html) return null;
  const imgMatch = String(html).match(/<img\b[^>]*\bsrc=['"]([^'"]+)['"][^>]*>/i);
  if (!imgMatch) return null;
  const src = imgMatch[1];
  try {
    return absolutize(src, baseUrl);
  } catch {
    return src; // se não der pra absolutizar, retorna como veio
  }
}

// Baixa a página e tenta og:image/twitter:image por regex (com timeout)
async function tryOgImage(fetchSafe, pageUrl) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000); // 6s timeout
  try {
    const res = await fetchSafe(pageUrl, { redirect: 'follow', signal: controller.signal, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EducabitBot/1.0',
      'Accept': 'text/html,application/xhtml+xml'
    }});
    const html = await res.text();

    // tenta várias variações comuns
    const candidates = [
      ['property','og:image:secure_url'],
      ['property','og:image:url'],
      ['property','og:image'],
      ['name','og:image'],
      ['name','twitter:image:src'],
      ['name','twitter:image'],
      ['property','twitter:image']
    ];

    for (const [attr, val] of candidates) {
      const found = findMetaContent(html, attr, val);
      if (found) return absolutize(found, pageUrl);
    }

    return null;
  } finally {
    clearTimeout(t);
  }
}

function findMetaContent(html, attr, value) {
  const re = new RegExp(
    `<meta[^>]*\\b${attr}\\s*=\\s*["']${escapeRegex(value)}["'][^>]*\\bcontent\\s*=\\s*["']([^"']+)["'][^>]*>`,
    'i'
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function absolutize(maybeUrl, baseUrl) {
  try {
    // já é absoluto?
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return maybeUrl;
  }
}

// fetch seguro: usa globalThis.fetch (Node ≥18) ou tenta node-fetch; se não rolar, retorna null
async function getFetchSafe() {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch;
  try {
    const mod = await import('node-fetch');
    return mod.default || mod;
  } catch {
    return null; // sem fetch disponível; seguimos sem tentar OG
  }
}

// Nova helper para extrair o primeiro parágrafo
function tryFirstParagraph(item) {
  const html = item?.['content:encoded'] || item?.content || item?.description || '';
  if (!html) return null;

  // Encontra o primeiro <p>...</p> (non-greedy)
  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!pMatch) return null;

  // Remove tags HTML e limpa espaços extras
  let text = pMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');

  // Opcional: limita o tamanho se for muito longo (ex: 300 chars), mas pode remover se não precisar
  if (text.length > 300) text = text.slice(0, 300) + '...';

  return text;
}
/* =========================
 *  COINGECKO (DEMO KEY FIXA)
 * ========================= */
const CG_TIER = 'demo'; // 'demo' | 'pro'
const CG_API_KEY = 'CG-dgfyDMoNe8RAsyGGG6qNS7Vx';
const CG_BASE =
  CG_TIER === 'pro'
    ? 'https://pro-api.coingecko.com/api/v3'
    : 'https://api.coingecko.com/api/v3';
const CG_HEADER = CG_TIER === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';

export const CG = axios.create({
  baseURL: CG_BASE,
  timeout: 12_000,
  headers: { [CG_HEADER]: CG_API_KEY },
});

// Garante a key também via querystring (alguns proxies/CDNs ignoram header)
CG.interceptors.request.use((config) => {
  const k = CG_TIER === 'pro' ? 'x_cg_pro_api_key' : 'x_cg_demo_api_key';
  config.params = { ...(config.params || {}), [k]: CG_API_KEY.trim() };
  return config;
});

// Log amigável e mensagens claras em 401/429
CG.interceptors.response.use(
  (res) => res,
  (err) => {
    const s = err?.response?.status;
    const u = (err?.config?.baseURL || '') + (err?.config?.url || '');
    console.error('CG ERROR', s, u, err?.response?.data);
    if (s === 401) {
      throw new Error(
        'CoinGecko 401: verifique chave e domínio (api.coingecko.com).'
      );
    }
    if (s === 429) {
      throw new Error('CoinGecko 429: limite atingido. Tente novamente.');
    }
    throw err;
  }
);

/* =========================
 *  BINANCE (TESTE - KEYS FIXAS)
 * ========================= */
const BINANCE_API_KEY =
  'aZzWZiWbwU4hpElcPa87Z1LeABikrk3PLUal2XlyxN2BczqtETaMDaGvXKiX6HoNs';
const BINANCE_API_SECRET =
  'OczxcwLyMM1MP32Zo5uz0YDrX6wigCWEEcjdEbdBOSJmzRbHMIMQkBapXl3BeJ1Ls';

// Futures (USDT-M)
export const BINANCE_FAPI = axios.create({
  baseURL: 'https://fapi.binance.com',
  timeout: 10_000,
  headers: { 'X-MBX-APIKEY': BINANCE_API_KEY },
});

// Spot (para fallback de preço)
export const BINANCE_API = axios.create({
  baseURL: 'https://api.binance.com',
  timeout: 10_000,
  headers: { 'X-MBX-APIKEY': BINANCE_API_KEY },
});

// Assinatura HMAC-SHA256 (para endpoints privados; não usamos no fallback)
function signParams(params = {}) {
  const base = { recvWindow: 5000, timestamp: Date.now(), ...params };
  const qsObj = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined && v !== null) qsObj.append(k, String(v));
  }
  const qs = qsObj.toString();
  const signature = crypto
    .createHmac('sha256', BINANCE_API_SECRET)
    .update(qs)
    .digest('hex');
  return `${qs}&signature=${signature}`;
}

// Helpers Binance
export async function fapiGetPublic(path, params = {}) {
  const { data } = await BINANCE_FAPI.get(path, { params });
  return data;
}
export async function fapiGetSigned(path, params = {}) {
  const qs = signParams(params);
  const { data } = await BINANCE_FAPI.get(`${path}?${qs}`);
  return data;
}
export async function fapiPostSigned(path, params = {}) {
  const qs = signParams(params);
  const { data } = await BINANCE_FAPI.post(`${path}?${qs}`);
  return data;
}

// Fallback de preço via Binance Spot (USDT≈USD)
async function getBinanceSpotUSDPrice(symbolUpper) {
  try {
    const pair = `${symbolUpper}USDT`;
    const { data } = await BINANCE_API.get('/api/v3/ticker/price', {
      params: { symbol: pair },
    });
    return Number(data?.price) || null;
  } catch {
    return null;
  }
}

/* =========================
 *  CACHE + RETRY (Performance & Robustez)
 * ========================= */
const _cache = new Map(); // key -> { data, exp }
function _getCache(key) {
  const hit = _cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  if (hit) _cache.delete(key);
  return null;
}
function _setCache(key, data, ttlMs) {
  _cache.set(key, { data, exp: Date.now() + ttlMs });
}
async function withCache(key, ttlMs, fetcher) {
  const hit = _getCache(key);
  if (hit !== null) return hit;
  const data = await fetcher();
  _setCache(key, data, ttlMs);
  return data;
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function cgGet(path, params, { retries = 2 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await CG.get(path, { params });
    } catch (err) {
      const status = err?.response?.status;
      if (attempt < retries && (status === 429 || (status >= 500 && status < 600))) {
        await delay(300 * Math.pow(2, attempt)); // backoff exponencial simples
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

/* =========================
 *  HELPERS DE FORMATAÇÃO
 * ========================= */
export function fmtMoney(n, c = 'USD', locale = 'pt-BR') {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: c,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return String(n);
  }
}
export const fmtUSD = (n) => fmtMoney(n, 'USD');

export function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
export function fmtPctArrowBold(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '•';
  const s = (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  return `*${arrow} ${s}*`;
}

// número com sinal (ex.: +0.0123) para MACD hist etc.
export function fmtSigned(n, digits = 4) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(digits);
}

export function formatDateTimeBR(dt) {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return f.format(dt);
}

/* =========================
 *  HELPERS DE SÉRIE / TÉCNICOS
 * ========================= */
function SMA(series, period) {
  if (!Array.isArray(series) || series.length < period) return null;
  let sum = 0;
  for (let i = series.length - period; i < series.length; i++) sum += series[i];
  return sum / period;
}

// retorna array alinhado com EMAs (posições anteriores ficam null até ter base)
function EMAseries(series, period) {
  if (!Array.isArray(series) || series.length < period) return null;
  const k = 2 / (period + 1);
  const out = Array(series.length).fill(null);
  // seed com SMA inicial
  let emaPrev = 0;
  for (let i = 0; i < period; i++) emaPrev += series[i];
  emaPrev /= period;
  out[period - 1] = emaPrev;
  for (let i = period; i < series.length; i++) {
    const ema = series[i] * k + emaPrev * (1 - k);
    out[i] = ema;
    emaPrev = ema;
  }
  return out;
}

function lastDefined(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
}

function stdevLastN(series, n) {
  if (!Array.isArray(series) || series.length < n) return null;
  const slice = series.slice(series.length - n);
  const mean = slice.reduce((a, b) => a + b, 0) / n;
  const varsum = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  return Math.sqrt(varsum);
}

function RSI14(closes) {
  const period = 14;
  if (!Array.isArray(closes) || closes.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function normalize(str = '') {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
// ===== Sentimento agregado (Alta / Baixa / Lateralização) =====
function computeMarketSentiment({
  last, ema20, ema50, ema200, emaCross,
  macd, rsi, change24h, change7d, bbWidthPct,
  funding // { rate } ou null
}) {
  let score = 0;

  // Tendência por EMAs
  if ([last, ema20, ema50, ema200].every(Number.isFinite)) {
    if (last > ema20 && ema20 > ema50 && ema50 > ema200) score += 2;       // forte alta
    else if (last < ema20 && ema20 < ema50 && ema50 < ema200) score -= 2;  // forte baixa
  }
  if (emaCross === 'golden') score += 1;
  if (emaCross === 'death')  score -= 1;

  // MACD
  if (macd) {
    if (Number.isFinite(macd.hist)) score += macd.hist > 0 ? 0.5 : -0.5;
    if (macd.cross === 'bullish') score += 1;
    if (macd.cross === 'bearish') score -= 1;
  }

  // RSI (zona 45–55 ~ neutro)
  if (Number.isFinite(rsi)) {
    if (rsi >= 55 && rsi <= 70) score += 0.5;
    else if (rsi <= 45 && rsi >= 30) score -= 0.5;
  }

  // Retornos
  if (Number.isFinite(change24h)) score += change24h > 1 ? 0.5 : (change24h < -1 ? -0.5 : 0);
  if (Number.isFinite(change7d))  score += change7d  > 1.5 ? 0.5 : (change7d  < -1.5 ? -0.5 : 0);

  // Funding (perp bias)
  if (funding && Number.isFinite(funding.rate)) {
    score += funding.rate > 0 ? 0.5 : -0.5;
  }

  // Sinal de lateralização (bandas estreitas + pouca variação + RSI ~50)
  const isFlat =
    (Number.isFinite(bbWidthPct) && bbWidthPct < 8) &&
    (!Number.isFinite(change7d)  || Math.abs(change7d)  < 1.5) &&
    (!Number.isFinite(change24h) || Math.abs(change24h) < 1.0) &&
    (!Number.isFinite(rsi)       || Math.abs(rsi - 50) <= 5);

  let label;
  if (isFlat) label = 'Lateralização';
  else if (score >= 1) label = 'Alta';
  else if (score <= -1) label = 'Baixa';
  else label = 'Lateralização';

  return { label, score };
}
/* =========================
 *  NOVOS HELPERS (MACD / DSS / MTF)
 * ========================= */

// MACD clássico (EMA 12/26, sinal 9). Retorna { line, signal, hist, cross }
export function MACD(closes, fast = 12, slow = 26, signal = 9) {
  if (!Array.isArray(closes) || closes.length < slow + signal) {
    return { line: null, signal: null, hist: null, cross: null };
  }
  const emaFast = EMAseries(closes, fast);
  const emaSlow = EMAseries(closes, slow);
  if (!emaFast || !emaSlow) return { line: null, signal: null, hist: null, cross: null };

  // série MACD (diferença das EMAs), ignorando pontos sem EMA
  const macdSeries = [];
  for (let i = 0; i < closes.length; i++) {
    const f = emaFast[i], s = emaSlow[i];
    macdSeries.push((f != null && s != null) ? (f - s) : null);
  }
  const macdDef = macdSeries.filter(v => v != null);
  if (macdDef.length < signal) return { line: null, signal: null, hist: null, cross: null };

  const signalSeries = EMAseries(macdDef, signal);
  const line = macdDef[macdDef.length - 1];
  const sig  = signalSeries[signalSeries.length - 1];
  const hist = (line != null && sig != null) ? (line - sig) : null;

  // detecção de cruzamento (última barra vs anterior)
  let cross = null;
  if (macdDef.length >= 2 && signalSeries.length >= 2) {
    const m1 = macdDef[macdDef.length - 1], m0 = macdDef[macdDef.length - 2];
    const s1 = signalSeries[signalSeries.length - 1], s0 = signalSeries[signalSeries.length - 2];
    if (m0 <= s0 && m1 > s1) cross = 'bullish';
    else if (m0 >= s0 && m1 < s1) cross = 'bearish';
    else cross = 'flat';
  }

  return { line, signal: sig, hist, cross };
}

// DSS Bressert (Double Smoothed Stochastic). Retorna valor entre 0..100 (ou null).
export function dssBressert(closes, kLen = 13, sLen = 8) {
  if (!Array.isArray(closes) || closes.length < Math.max(kLen, sLen) + 5) return null;

  // 1) EMA do preço
  const ema1 = EMAseries(closes, sLen);
  const ema1Comp = ema1 ? ema1.filter(v => v != null) : [];
  if (ema1Comp.length < kLen) return null;

  // 2) Stochastic de ema1
  const sto1 = [];
  for (let i = kLen - 1; i < ema1Comp.length; i++) {
    const win = ema1Comp.slice(i - kLen + 1, i + 1);
    const lo = Math.min(...win), hi = Math.max(...win);
    const val = ema1Comp[i];
    const st = (hi - lo) === 0 ? 50 : 100 * (val - lo) / (hi - lo);
    sto1.push(st);
  }

  // 3) EMA do sto1
  const sto1Ema = EMAseries(sto1, sLen);
  const sto1EmaComp = sto1Ema ? sto1Ema.filter(v => v != null) : [];
  if (sto1EmaComp.length < kLen) return null;

  // 4) Stochastic de sto1Ema
  const sto2 = [];
  for (let i = kLen - 1; i < sto1EmaComp.length; i++) {
    const win = sto1EmaComp.slice(i - kLen + 1, i + 1);
    const lo = Math.min(...win), hi = Math.max(...win);
    const val = sto1EmaComp[i];
    const st = (hi - lo) === 0 ? 50 : 100 * (val - lo) / (hi - lo);
    sto2.push(st);
  }

  // 5) EMA final
  const dssEma = EMAseries(sto2, sLen);
  const final = lastDefined(dssEma) ?? (sto2.length ? sto2[sto2.length - 1] : null);
  return final != null ? Math.max(0, Math.min(100, final)) : null;
}

// Reamostragem simples p/ MTF (pega cada N-ésimo close)
export function resampleByFactorSimple(closes, factor = 4) {
  if (!Array.isArray(closes) || factor <= 1) return Array.isArray(closes) ? closes.slice() : [];
  const out = [];
  for (let i = factor - 1; i < closes.length; i += factor) out.push(closes[i]);
  return out;
}

/* =========================
 *  COINGECKO HELPERS
 * ========================= */
async function resolveCoinId(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const { data } = await cgGet('/search', { query: q });
  const results = data?.data?.coins || data?.coins || []; // compat
  const norm = (s) => s?.toLowerCase();
  const exactSymbol = results.find((c) => norm(c.symbol) === norm(q));
  if (exactSymbol) return exactSymbol.id;
  const exactId = results.find((c) => norm(c.id) === norm(q));
  if (exactId) return exactId.id;
  const exactName = results.find((c) => norm(c.name) === norm(q));
  if (exactName) return exactName.id;
  return results[0]?.id || null;
}

// status_updates agora vem em /coins/{id}
async function getStatusUpdates(id, perPage = 3) {
  try {
    const { data } = await withCache(
      `cg:coin:${id}:status`,
      45 * 60 * 1000,
      async () =>
        (await cgGet(`/coins/${id}`, {
          localization: false,
          tickers: false,
          market_data: false,
          community_data: false,
          developer_data: false,
          sparkline: false,
        })).data
    );

    const items = data?.status_updates || [];
    return items.slice(0, perPage).map((u) => ({
      title: u?.project?.name
        ? `${u.project.name}: ${u?.category || 'Atualização'}`
        : u?.category || 'Atualização',
      description: (u?.description || '').trim(),
      url: u?.article_url || u?.url || '',
      date: u?.created_at ? formatDateTimeBR(new Date(u.created_at)) : '',
      source: u?.user || 'Projeto',
    }));
  } catch {
    return [];
  }
}

/* =========================
 *  SENTIMENTO
 * ========================= */
async function getFundingRateBinance(symbol) {
  const perp = (symbol || '').toUpperCase() + 'USDT';
  try {
    const arr = await withCache(
      `bin:funding:${perp}`,
      5 * 60 * 1000,
      () => fapiGetPublic('/fapi/v1/fundingRate', { symbol: perp, limit: 1 })
    );
    const last = Array.isArray(arr) ? arr[0] : null;
    if (!last) return null;
    const rate = Number(last.fundingRate) * 100;
    const time = last.fundingTime
      ? formatDateTimeBR(new Date(Number(last.fundingTime)))
      : '';
    return { perp, rate, time };
  } catch {
    return null;
  }
}
async function getGlobalDominance() {
  try {
    const data = await withCache(
      'cg:global',
      15 * 60 * 1000,
      async () => (await cgGet('/global')).data
    );
    const perc = data?.data?.market_cap_percentage || {};
    const btc = perc?.btc;
    return isFinite(btc) ? btc : null;
  } catch {
    return null;
  }
}

/* =========================
 *  NARRATIVA
 * ========================= */
function buildNarrative({
  change24h, change7d, rsi, sma20, sma50, last, mcapRank,
  emaCross, bbWidthPct, atr14,
  macdCross, dss, dssMtf, dssThresh = { overbought: 80, oversold: 20 }
}) {
  const bullets = [];

  // Momentum 24h
  if (Number.isFinite(change24h)) {
    if (change24h > 2) bullets.push('Momentum de curto prazo positivo (24h).');
    else if (change24h < -2) bullets.push('Pressão vendedora no curto prazo (24h).');
    else bullets.push('Variação de 24h neutra/modesta.');
  }

  // Tendência simples com SMAs
  if (sma20 && sma50 && last) {
    if (sma20 > sma50 && last > sma20)
      bullets.push('Tendência técnica de alta (preço > SMA20 > SMA50).');
    else if (sma20 < sma50 && last < sma20)
      bullets.push('Tendência técnica de baixa (preço < SMA20 < SMA50).');
    else bullets.push('Estrutura técnica mista/lateral.');
  }

  // Crossover EMA 20×50
  if (emaCross === 'golden') bullets.push('Crossover de alta (EMA20 cruzou acima da EMA50).');
  if (emaCross === 'death')  bullets.push('Crossover de baixa (EMA20 cruzou abaixo da EMA50).');

  // MACD cross
  if (macdCross === 'bullish') bullets.push('MACD cruzou para alta (linha acima da sinal).');
  if (macdCross === 'bearish') bullets.push('MACD cruzou para baixa (linha abaixo da sinal).');

  // RSI
  if (rsi != null) {
    if (rsi >= 70) bullets.push(`RSI ${Math.round(rsi)} (sobrecomprado).`);
    else if (rsi <= 30) bullets.push(`RSI ${Math.round(rsi)} (sobrevendido).`);
    else bullets.push(`RSI ${Math.round(rsi)} (neutro).`);
  }

  // Bollinger squeeze
  if (bbWidthPct != null && bbWidthPct < 8)
    bullets.push('Bandas de Bollinger comprimidas (possível squeeze).');

  // ATR
  if (atr14 != null) bullets.push(`ATR(14) elevado indica maior volatilidade recente.`);

  // Bressert DSS extremos
  if (dss != null) {
    if (dss >= dssThresh.overbought) bullets.push(`DSS Bressert ${Math.round(dss)} (sobrecomprado).`);
    else if (dss <= dssThresh.oversold) bullets.push(`DSS Bressert ${Math.round(dss)} (sobrevendido).`);
  }
  if (dssMtf != null) {
    if (dssMtf >= dssThresh.overbought) bullets.push(`MTF DSS ${Math.round(dssMtf)} (sobrecomprado em TF superior).`);
    else if (dssMtf <= dssThresh.oversold) bullets.push(`MTF DSS ${Math.round(dssMtf)} (sobrevendido em TF superior).`);
  }

  if (mcapRank) bullets.push(`Ranking de mercado: #${mcapRank}.`);
  return bullets;
}

/* =========================
 *  ANÁLISE PRINCIPAL (UPGRADE)
 * ========================= */
export async function analyzeCryptoEnhanced(query, opts = {}) {
  // Padrão USD
  const currency = (opts.currency || 'usd').toLowerCase();
  const days = Number(opts.days || 30);

  const id = await resolveCoinId(query);
  if (!id) throw new Error('Ativo não encontrado.');

  // Markets (preço/variações) com cache e retry
  let marketsData;
  try {
    marketsData = await withCache(
      `cg:markets:${id}:${currency}`,
      60 * 1000,
      async () =>
        (await cgGet('/coins/markets', {
          vs_currency: currency,
          ids: id,
          price_change_percentage: '24h,7d',
          precision: 6,
          locale: 'pt',
        })).data
    );
  } catch {
    marketsData = null;
  }

  let m = Array.isArray(marketsData) && marketsData.length ? marketsData[0] : null;

  // Fallback: preço spot Binance se markets falhar (USDT ≈ USD)
  if (!m) {
    const guessSym = /^[a-z0-9-]{1,10}$/.test(query) ? query.toUpperCase() : 'BTC';
    const spot = await getBinanceSpotUSDPrice(guessSym);
    if (spot != null) {
      m = {
        id,
        symbol: guessSym.toLowerCase(),
        name: query.toUpperCase(),
        current_price: spot,
        price_change_percentage_24h: null,
        price_change_percentage_7d_in_currency: null,
        market_cap: null,
        market_cap_rank: null,
        total_volume: null,
      };
    } else {
      throw new Error('Sem dados de mercado.');
    }
  }

  // Série histórica para indicadores
  const safeDays = Math.max(2, Number(days) || 30);
  const chartParams = { vs_currency: currency, days: safeDays };
  if (safeDays > 90) chartParams.interval = 'daily'; // evita hourly (enterprise)

  const chart = await withCache(
    `cg:chart:${id}:${currency}:${safeDays}`,
    5 * 60 * 1000,
    async () => (await cgGet(`/coins/${id}/market_chart`, chartParams)).data
  );

  const closes = (chart?.prices || []).map((p) => p[1]);
  const last = closes.length ? closes[closes.length - 1] : m.current_price;

  // Indicadores básicos
  const sma20 = SMA(closes, 20);
  const sma50 = SMA(closes, 50);
  const rsi = RSI14(closes);

  // EMAs + detecção de crossover 20×50
  const ema20series = EMAseries(closes, 20);
  const ema50series = EMAseries(closes, 50);
  const ema200series = EMAseries(closes, 200);
  const ema20 = ema20series ? lastDefined(ema20series) : null;
  const ema50 = ema50series ? lastDefined(ema50series) : null;
  const ema200 = ema200series ? lastDefined(ema200series) : null;
  let emaCross = null;
  if (ema20series && ema50series) {
    const a1 = ema20series[ema20series.length - 1];
    const b1 = ema50series[ema50series.length - 1];
    const a0 = ema20series[ema20series.length - 2];
    const b0 = ema50series[ema50series.length - 2];
    if (a1 != null && b1 != null && a0 != null && b0 != null) {
      if (a0 <= b0 && a1 > b1) emaCross = 'golden';
      else if (a0 >= b0 && a1 < b1) emaCross = 'death';
    }
  }

  // MACD (12/26/9)
  const macd = MACD(closes, 12, 26, 9);

  // DSS Bressert + MTF simples
  const dss = dssBressert(closes, 13, 8);
  const mtfFactor = Number(opts.bressertMtfFactor || 4);
  const closesMtf = resampleByFactorSimple(closes, mtfFactor);
  const dssMtf = (closesMtf && closesMtf.length >= 40)
    ? dssBressert(closesMtf, 13, 8)
    : null;

  // Bandas de Bollinger (20, 2σ)
  let bbUpper = null, bbLower = null, bbMid = null, bbWidthPct = null;
  if (closes.length >= 20) {
    bbMid = SMA(closes, 20);
    const sd = stdevLastN(closes, 20);
    bbUpper = bbMid + 2 * sd;
    bbLower = bbMid - 2 * sd;
    bbWidthPct = bbMid ? ((bbUpper - bbLower) / bbMid) * 100 : null;
  }

  // ATR(14) via OHLC (se disponível)
  let atr14 = null;
  try {
    // /ohlc aceita: 1/7/14/30/90/180/365/max
    const ohlcDays = safeDays <= 7 ? 7 : safeDays <= 14 ? 14 : safeDays <= 30 ? 30 : 90;
    const ohlcArr = await withCache(
      `cg:ohlc:${id}:${currency}:${ohlcDays}`,
      5 * 60 * 1000,
      async () =>
        (await cgGet(`/coins/${id}/ohlc`, { vs_currency: currency, days: ohlcDays })).data
    );
    if (Array.isArray(ohlcArr) && ohlcArr.length >= 15) {
      // item: [ts, open, high, low, close]
      let trs = [];
      for (let i = 1; i < ohlcArr.length; i++) {
        const [, , hi, lo, cl] = ohlcArr[i];
        const prevClose = ohlcArr[i - 1][4];
        const tr = Math.max(hi - lo, Math.abs(hi - prevClose), Math.abs(lo - prevClose));
        trs.push(tr);
      }
      if (trs.length >= 14) {
        const last14 = trs.slice(trs.length - 14);
        atr14 = last14.reduce((a, b) => a + b, 0) / 14;
      }
    }
  } catch {
    atr14 = null;
  }

  const change24h = m.price_change_percentage_24h;
  const change7d = m.price_change_percentage_7d_in_currency;

  // Níveis simples (percentis) como proxy de S/R
  let support = null, resistance = null;
  if (closes.length > 10) {
    const sorted = [...closes].sort((a, b) => a - b);
    const p20 = sorted[Math.floor(0.2 * (sorted.length - 1))];
    const p80 = sorted[Math.floor(0.8 * (sorted.length - 1))];
    support = p20; resistance = p80;
  }

  // Upgrades: catalisadores, funding, dominância BTC
  const [updates, funding, btcDom] = await Promise.all([
    getStatusUpdates(id, 3),
    getFundingRateBinance(m.symbol),
    getGlobalDominance(),
  ]);

 const { label: sentimentLevel, score: sentimentScore } = computeMarketSentiment({
    last, ema20, ema50, ema200, emaCross,
    macd, rsi, change24h, change7d, bbWidthPct,
    funding
  });

  const now = new Date();

  // TL;DR com destaque de variação + novos indicadores
  const tldrLines = [
    `• *Preço:* ${fmtUSD(m.current_price)} (${fmtPctArrowBold(change24h)} 24h, ${fmtPctArrowBold(change7d)} 7d)`,
    `• *Tendência:* ${
      ema20 && ema50 && ema200 && last
        ? (last > ema20 && ema20 > ema50 && ema50 > ema200
            ? 'Alta (P>EMA20>EMA50>EMA200)'
            : last < ema20 && ema20 < ema50 && ema50 < ema200
            ? 'Baixa (P<EMA20<EMA50<EMA200)'
            : 'Mista')
        : (sma20 && sma50 && last
            ? (sma20 > sma50 && last > sma20 ? 'Alta' : sma20 < sma50 && last < sma20 ? 'Baixa' : 'Mista')
            : 'Indefinida')
    }`,
    rsi != null ? `• *RSI(14):* ${Math.round(rsi)}` : null,
    (macd && Number.isFinite(macd.hist))
      ? `• *MACD (12/26/9):* ${macd.cross || '—'} (hist ${fmtSigned(macd.hist, 4)})`
      : `• *MACD (12/26/9):* —`,
    (dss != null)
      ? `• *DSS Bressert:* ${Math.round(dss)}${dssMtf != null ? ` (MTF×${mtfFactor}: ${Math.round(dssMtf)})` : ''}`
      : `• *DSS Bressert:* —`,
    (bbUpper && bbLower && bbMid && Number.isFinite(bbWidthPct))
      ? `• *Bollinger(20):* Mid ${fmtUSD(bbMid)} | ↑ ${fmtUSD(bbUpper)} | ↓ ${fmtUSD(bbLower)} | Largura ${bbWidthPct.toFixed(1)}%`
      : null,
    Number.isFinite(atr14) ? `• *ATR(14):* ${fmtUSD(atr14)}` : null,
    support ? `• *Níveis:* *Suporte* ~ ${fmtUSD(support)} | *Resistência* ~ ${fmtUSD(resistance)}` : null,
    Number.isFinite(m.market_cap) ? `• *MCap:* ${fmtUSD(m.market_cap)} (rank #${m.market_cap_rank || '—'})` : null,
    funding ? `• *Funding* (Binance ${funding.perp}): ${fmtPct(funding.rate)} às ${funding.time}` : null,
    `• *Sentimento do Mercado:* ${sentimentLevel}`,
    Number.isFinite(btcDom) ? `• *Dominância de mercado do BTC:* ${btcDom.toFixed(1)}%` : null,
    `• *Atualizado:* ${formatDateTimeBR(now)}`,
  ].filter(Boolean);

  const bullets = buildNarrative({
    change24h,
    change7d,
    rsi,
    sma20,
    sma50,
    last,
    mcapRank: m.market_cap_rank,
    emaCross,
    bbWidthPct,
    atr14,
    macdCross: macd?.cross || null,
    dss,
    dssMtf,
  });

  return {
    id,
    symbol: (m.symbol || '').toUpperCase(),
    name: m.name,
    currency: currency.toUpperCase(), // USD
    price: m.current_price,
    change24h,
    change7d,
    marketCap: m.market_cap,
    volume24h: m.total_volume,
    rank: m.market_cap_rank,

    // Indicadores
    sma20,
    sma50,
    ema20,
    ema50,
    ema200,
    macd, // { line, signal, hist, cross }
    bressert: { value: dss, mtfFactor, mtfValue: dssMtf },
    bollinger: (bbUpper != null && bbLower != null && bbMid != null)
      ? { mid: bbMid, upper: bbUpper, lower: bbLower, widthPct: bbWidthPct }
      : null,
    atr14,
    support,
    resistance,

    // Metadados e extras
    updatedAt: now,
    tldr: tldrLines.join('\n'),
    bullets,
    catalysts: updates,
    sentiment: {
      level: sentimentLevel,       // <<< novo: Alta / Baixa / Lateralização
      levelScore: sentimentScore,  // <<< score para debug/ajuste
      funding,                     // {perp, rate, time} | null
      btcDominance: btcDom,        // number | null
    },
    source: 'CoinGecko',
    sourceUrl: `https://www.coingecko.com/pt-br/moedas/${id}`,
  };
}

/* =========================
 *  (Opcional) Self-test rápido
 * ========================= */
export async function cgSelfTest() {
  const ping = await CG.get('/ping');
  const mkt = await CG.get('/coins/markets', {
    params: { vs_currency: 'usd', ids: 'bitcoin', price_change_percentage: '24h,7d' },
  });
  return { ping: ping.data, sample: mkt.data?.[0]?.id };
}
export async function translationGoogle(text, lang) {
    try {
        const translationResponse = await translate(text, { to: lang });
        return translationResponse.text;
    }
    catch (err) {
        showConsoleLibraryError(err, 'translationGoogle');
        throw new Error(botTexts.library_error);
    }
}
export async function shortenUrl(url) {
    try {
        const URL_BASE = 'https://shorter.me/page/shorten';
        const { data: shortenResponse } = await axios.post(URL_BASE, qs.stringify({ url, alias: '', password: '' }));
        if (!shortenResponse.data) {
            return null;
        }
        return shortenResponse.data;
    }
    catch (err) {
        showConsoleLibraryError(err, 'shortenUrl');
        throw new Error(botTexts.library_error);
    }
}
export async function webSearchGoogle(texto) {
    try {
        const searchResults = await search({ query: texto, resultTypes: [OrganicResult] });
        let searchResponse = searchResults.map(search => {
            return {
                title: search.title,
                url: search.link,
                description: search.description
            };
        });
        return searchResponse;
    }
    catch (err) {
        showConsoleLibraryError(err, 'webSearchGoogle');
        throw new Error(botTexts.library_error);
    }
}
export async function wheatherInfo(location) {
    try {
        const WEATHER_API_URL = `http://api.weatherapi.com/v1/forecast.json?key=516f58a20b6c4ad3986123104242805&q=${encodeURIComponent(location)}&days=3&aqi=no&alerts=no`;
        const { data: wheatherResult } = await axios.get(WEATHER_API_URL);
        const { data: wheatherConditions } = await axios.get("https://www.weatherapi.com/docs/conditions.json", { responseType: 'json' });
        const currentCondition = wheatherConditions.find((condition) => condition.code === wheatherResult.current.condition.code).languages.find((language) => language.lang_iso == 'pt');
        let weatherResponse = {
            location: {
                name: wheatherResult.location.name,
                region: wheatherResult.location.region,
                country: wheatherResult.location.country,
                current_time: timestampToDate(wheatherResult.location.localtime_epoch * 1000)
            },
            current: {
                last_updated: timestampToDate(wheatherResult.current.last_updated_epoch * 1000),
                temp: `${wheatherResult.current.temp_c} C°`,
                feelslike: `${wheatherResult.current.feelslike_c} C°`,
                condition: wheatherResult.current.is_day ? currentCondition.day_text : currentCondition.night_text,
                wind: `${wheatherResult.current.wind_kph} Km/h`,
                humidity: `${wheatherResult.current.humidity} %`,
                cloud: `${wheatherResult.current.cloud} %`
            },
            forecast: []
        };
        wheatherResult.forecast.forecastday.forEach((forecast) => {
            const conditionDay = wheatherConditions.find((condition) => condition.code == forecast.day.condition.code).languages.find((lang) => lang.lang_iso == 'pt');
            const [year, month, day] = forecast.date.split("-");
            const forecastDay = {
                day: `${day}/${month}/${year}`,
                max: `${forecast.day.maxtemp_c} C°`,
                min: `${forecast.day.mintemp_c} C°`,
                avg: `${forecast.day.avgtemp_c} C°`,
                condition: `${conditionDay.day_text}`,
                max_wind: `${forecast.day.maxwind_kph} Km/h`,
                rain: `${forecast.day.daily_will_it_rain ? "Sim" : "Não"}`,
                chance_rain: `${forecast.day.daily_chance_of_rain} %`,
                snow: `${forecast.day.daily_will_it_snow ? "Sim" : "Não"}`,
                chance_snow: `${forecast.day.daily_chance_of_snow} %`,
                uv: forecast.day.uv
            };
            weatherResponse.forecast.push(forecastDay);
        });
        return weatherResponse;
    }
    catch (err) {
        showConsoleLibraryError(err, 'wheatherInfo');
        throw new Error(botTexts.library_error);
    }
}
export async function musicLyrics(text) {
    try {
        const geniusClient = new Genius.Client();
        const musicSearch = await geniusClient.songs.search(text).catch((err) => {
            if (err.message == "No result was found") {
                return null;
            }
            else {
                throw err;
            }
        });
        if (!musicSearch || !musicSearch.length) {
            return null;
        }
        const musicResult = {
            title: musicSearch[0].title,
            artist: musicSearch[0].artist.name,
            image: musicSearch[0].artist.image,
            lyrics: await musicSearch[0].lyrics()
        };
        return musicResult;
    }
    catch (err) {
        showConsoleLibraryError(err, 'musicLyrics');
        throw new Error(botTexts.library_error);
    }
}
const BR_TZ = "America/Sao_Paulo";
const VS = ["usd", "brl", "eur"];
const ISO = { usd: "USD", brl: "BRL", eur: "EUR" };

// cache simples p/ reduzir chamadas repetidas
const cache = new Map();
function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  const { exp, val } = hit;
  if (Date.now() > exp) { cache.delete(key); return null; }
  return val;
}
function setCache(key, val, ttlMs = 30_000) {
  cache.set(key, { val, exp: Date.now() + ttlMs });
}

// formatação monetária pt-BR
function fmt(val, ccy) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: ccy }).format(val);
}

// Resolve 1 termo (símbolo OU nome) para { id, symbol, name } via /search
async function resolveCoin(query) {
  const q = query.trim();
  const key = `search:${q.toLowerCase()}`;
  const cached = getCache(key);
  if (cached) return cached;

  const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
  const { data } = await axios.get(url, { headers: { Accept: "application/json" } });
  const coins = data?.coins || [];

  const lower = q.toLowerCase();
  // prioridade: símbolo exato -> nome exato -> começa com -> primeiro resultado
  const found =
    coins.find(c => c.symbol?.toLowerCase() === lower) ||
    coins.find(c => c.name?.toLowerCase() === lower) ||
    coins.find(c => c.symbol?.toLowerCase().startsWith(lower) || c.name?.toLowerCase().startsWith(lower)) ||
    coins[0];

  if (!found) return null;

  const res = { id: found.id, symbol: (found.symbol || "").toUpperCase(), name: found.name };
  setCache(key, res);
  return res;
}

// Pega preços para vários ids de uma vez: { [id]: {usd, brl, eur, last_updated_at} }
async function fetchPrices(ids) {
  const list = Array.from(new Set(ids)).filter(Boolean);
  if (!list.length) return {};
  const key = `prices:${list.sort().join(",")}`;
  const cached = getCache(key);
  if (cached) return cached;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(list.join(","))}&vs_currencies=${VS.join(",")}&include_last_updated_at=true`;
  const { data } = await axios.get(url, { headers: { Accept: "application/json" } });
  setCache(key, data);
  return data;
}

// Top N por market cap -> [{id,symbol,name}]
async function resolveTop(n = 10) {
  const perPage = Math.min(Math.max(Number(n) || 10, 1), 250);
  const key = `top:${perPage}`;
  const cached = getCache(key);
  if (cached) return cached;

  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false`;
  const { data } = await axios.get(url, { headers: { Accept: "application/json" } });
  const rows = (data || []).map(r => ({ id: r.id, symbol: (r.symbol || "").toUpperCase(), name: r.name }));
  setCache(key, rows, 60_000);
  return rows;
}

// ---- Handler principal ----
export async function cotacaoMoeda(messageText) {
  try {
    const m = messageText.trim().toLowerCase().match(/^!moeda(?:\s+(.+))?$/);
    if (!m) {
      return {
        ok: false,
        message:
`Use: !moeda <ativo(s)>
Ex.: !moeda bitcoin
Ex.: !moeda btc, eth, sol
Ex.: !moeda top 10`,
      };
    }

    const arg = (m[1] || "").trim();

    let coins = [];
    if (!arg || arg === "top" || arg.startsWith("top ")) {
      const n = Number(arg.replace("top", "").trim()) || 10;
      coins = await resolveTop(n);
    } else {
      // permite separar por vírgula ou espaço
      const terms = arg.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
      const uniques = Array.from(new Set(terms));
      const resolved = await Promise.all(uniques.map(resolveCoin));
      coins = resolved.filter(Boolean);
    }

    if (!coins.length) {
      return { ok: false, message: `Não encontrei ativos para "${arg || 'top'}". Tente o símbolo (ex.: btc) ou nome (ex.: bitcoin).` };
    }

    const idList = coins.map(c => c.id);
    const prices = await fetchPrices(idList);

    const linhas = [];
    let updatedAt = null;

    for (const c of coins) {
      const row = prices[c.id];
      if (!row) {
        linhas.push(`• ${c.name} (${c.symbol}): indisponível no momento`);
        continue;
      }
      const fx = [];
      for (const k of VS) {
        const v = row[k];
        if (typeof v === "number" && Number.isFinite(v)) {
          fx.push(`${k.toUpperCase()}: ${fmt(v, ISO[k])}`);
        }
      }
      if (row.last_updated_at && !updatedAt) {
        updatedAt = new Date(row.last_updated_at * 1000);
      }
      linhas.push(`• ${c.name} (${c.symbol}) → ${fx.join(" · ")}`);
    }

    const atualizado = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: BR_TZ,
    }).format(updatedAt || new Date());

    const header = coins.length === 1 ? "📊 Cotação" : `📊 Cotações (${coins.length})`;
    const msg =
`${header}
${linhas.join("\n")}
Atualizado em ${atualizado} (BRT). Fonte: CoinGecko.`;

    return { ok: true, message: msg, coins, prices };
  } catch (err) {
    if (typeof showConsoleLibraryError === "function") {
      showConsoleLibraryError(err, "cotacaoMoeda");
    }
    return { ok: false, message: (globalThis?.botTexts?.library_error) || "Erro ao obter cotações. Tente novamente." };
  }
}
export async function infoDDD(ddd) {
    try {
        const URL_BASE = 'https://gist.githubusercontent.com/victorsouzaleal/ea89a42a9f912c988bbc12c1f3c2d110/raw/af37319b023503be780bb1b6a02c92bcba9e50cc/ddd.json';
        const { data: dddResponse } = await axios.get(URL_BASE);
        const states = dddResponse.estados;
        const indexDDD = states.findIndex((state) => state.ddd.includes(ddd));
        if (indexDDD === -1) {
            return null;
        }
        const response = {
            state: states[indexDDD].nome,
            region: states[indexDDD].regiao
        };
        return response;
    }
    catch (err) {
        showConsoleLibraryError(err, 'infoDDD');
        throw new Error(botTexts.library_error);
    }
}
export async function symbolsASCI() {
    try {
        const URL_BASE = 'https://gist.githubusercontent.com/victorsouzaleal/9a58a572233167587e11683aa3544c8a/raw/aea5d03d251359b61771ec87cb513360d9721b8b/tabela.txt';
        const { data: symbolsResponse } = await axios.get(URL_BASE);
        return symbolsResponse;
    }
    catch (err) {
        showConsoleLibraryError(err, 'symbolsASCI');
        throw new Error(botTexts.library_error);
    }
}
export async function searchGame(gameTitle) {
    try {
        const LIBRARIES = [
            'https://hydralinks.cloud/sources/fitgirl.json',
            'https://hydralinks.cloud/sources/dodi.json',
            'https://hydralinks.cloud/sources/kaoskrew.json',
            'https://hydralinks.cloud/sources/onlinefix.json',
            'https://hydralinks.cloud/sources/steamrip.json',
            'https://hydralinks.cloud/sources/atop-games.json'
        ];
        let gamesList = [];
        for await (let library of LIBRARIES) {
            const libraryResponse = await axios.get(library, { responseType: 'json' });
            libraryResponse.data.downloads.forEach((game) => {
                gamesList.push({
                    uploader: libraryResponse.data.name,
                    ...game
                });
            });
        }
        const fuse = new Fuse(gamesList, { ignoreLocation: true, keys: ["title"], threshold: 0.1 });
        const resultList = fuse.search(gameTitle).map(result => result.item);
        resultList.forEach(result => {
            result.uploadDate = moment(result.uploadDate).format('DD/MM/YYYY');
        });
        return resultList;
    }
    catch (err) {
        showConsoleLibraryError(err, 'searchGame');
        throw new Error(botTexts.library_error);
    }
}
export async function simSimi(text) {
    try {
        const URL_BASE = 'https://api.simsimi.vn/v2/simtalk';
        const config = {
            url: URL_BASE,
            method: "post",
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: qs.stringify({ text, lc: 'pt' })
        };
        const { data: simiResponse } = await axios(config).catch((err) => {
            if (err.response?.data?.message) {
                return err.response;
            }
            else {
                throw err;
            }
        });
        return simiResponse.message;
    }
    catch (err) {
        showConsoleLibraryError(err, 'simSimi');
        throw new Error(botTexts.library_error);
    }
}
export async function funnyRandomPhrases() {
  try {
    const URL_BASE = "https://gist.githubusercontent.com/thebitnomad/9db307962468b94a84a7691cbb1a5a6e/raw/f459cc827e65fca62b7e21c247493fbe600d8c35/gistfile1.json";
    const { data } = await axios.get(URL_BASE, { timeout: 10000 });

    if (!data || !Array.isArray(data.frases) || data.frases.length === 0) {
      throw new Error("Estrutura inválida em frases.json");
    }

    // 1) Sorteia uma frase
    const fraseBase = data.frases[Math.floor(Math.random() * data.frases.length)];

    // 2) Identifica placeholders {pN} distintos presentes na frase (p1, p2, p3, ...)
    const matches = fraseBase.match(/\{p(\d+)\}/g) || [];
    const placeholders = [...new Set(matches)]; // remove duplicatas se {p1} aparecer mais de uma vez

    // 4) Função util para escapar o placeholder no regex
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 5) Preenche cada placeholder com um complemento aleatório e não repetido
    let resultado = fraseBase;
    for (const ph of placeholders) {
      if (pool.length === 0) break; // sem complementos restantes

      // Escolhe um complemento não usado
      let comp;
      let tentativas = 0;
      do {
        comp = pool[Math.floor(Math.random() * pool.length)];
        tentativas++;
      } while (usado.has(comp) && tentativas < 5 * (pool.length || 1));

      usado.add(comp);

      // Remove UM desse complemento do pool (correção do splice)
      const idx = pool.indexOf(comp);
      if (idx > -1) pool.splice(idx, 1);

      // Substitui TODAS as ocorrências do placeholder específico
      resultado = resultado.replace(new RegExp(esc(ph), "g"), `*${comp}*`);
    }

    // 6) Se sobrar algum placeholder sem complemento (pool acabou), limpa-os
    resultado = resultado.replace(/\{p\d+\}/g, "*...*");

    return resultado;
  } catch (err) {
    showConsoleLibraryError(err, "funnyRandomPhrases");
    throw new Error(botTexts.library_error);
  }
}
