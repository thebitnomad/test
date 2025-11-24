// Node 18+ (tem fetch global). Em Node 16, instale `node-fetch@2` e importe.
// npm i luxon
import { DateTime } from "luxon";

const BRT = "America/Sao_Paulo";
const GAMMA = "https://gamma-api.polymarket.com";
const COINGECKO = "https://api.coingecko.com/api/v3";

// =========================
// Utilidades de data/HTTP
// =========================
function todayRangeBRT() {
  const start = DateTime.now().setZone(BRT).startOf("day");
  const end = start.plus({ days: 1 });
  return { start, end };
}
async function getJSON(url, params = {}) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${url}?${qs.toString()}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.json();
}
function parseISO(s) {
  if (!s) return null;
  const dt = DateTime.fromISO(s);
  return dt.isValid ? dt : null;
}

// =====================================
// Resolver universal: ticker -> termos
// =====================================
// cache simples em memória para reduzir chamadas
const CACHE = {
  cgSearch: new Map(),   // key: lower(query) -> result
  terms: new Map(),      // key: ticker -> { name, symbol, terms }
};
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 min

function setCache(map, key, val) {
  map.set(key, { val, t: Date.now() });
}
function getCache(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return hit.val;
}

/**
 * Usa CoinGecko para resolver ticker -> (name, symbol) e sinônimos.
 * Aceita também nomes ("solana") diretamente. Faz melhor esforço.
 */
async function resolveAssetTermsDynamic(queryOrTicker) {
  const raw = (queryOrTicker || "").trim();
  if (!raw) throw new Error("Ticker/nome vazio");

  const key = raw.toLowerCase();
  const cache = getCache(CACHE.terms, key);
  if (cache) return cache;

  // 1) tenta busca do CoinGecko
  let cg;
  const cacheCG = getCache(CACHE.cgSearch, key);
  if (cacheCG) {
    cg = cacheCG;
  } else {
    try {
      cg = await getJSON(`${COINGECKO}/search`, { query: raw });
      setCache(CACHE.cgSearch, key, cg);
    } catch {
      cg = null;
    }
  }

  let coin = null;
  if (cg?.coins?.length) {
    // heurística: prioriza symbol match exato, depois nome parecido
    const exactBySymbol = cg.coins.find(
      (c) => (c.symbol || "").toLowerCase() === key
    );
    const containsInName = cg.coins.find(
      (c) => (c.name || "").toLowerCase().includes(key)
    );
    coin = exactBySymbol || containsInName || cg.coins[0];
  }

  // fallback: se não achou, usa o próprio termo
  const name = coin?.name || raw.toUpperCase();
  const symbol = (coin?.symbol || raw).toUpperCase();

  // termos de busca para Polymarket
  const terms = [
    name,                            // "Solana"
    ` ${symbol.toLowerCase()} `,     // " sol "
    ` ${symbol.toLowerCase()}/`,     // " sol/"
    `${symbol.toLowerCase()}/usdt`,  // "sol/usdt"
    `${symbol.toLowerCase()}usdt`,   // "solusdt"
    ` ${symbol.toLowerCase()}-usd`,
    ` ${symbol.toLowerCase()}-usdt`,
  ];

  const out = { name, symbol, terms };
  setCache(CACHE.terms, key, out);
  return out;
}

// =====================================
// Polymarket: busca e sentimento
// =====================================
async function searchMarketsByTerms(terms, displayName) {
  // A) tentar public-search com nome canônico
  let markets = [];
  try {
    const data = await getJSON(`${GAMMA}/public-search`, { q: displayName });
    for (const ev of data?.events || []) {
      for (const m of ev?.markets || []) markets.push(m);
    }
  } catch {
    // segue pro fallback
  }

  // B) se pouco resultado, varrer /events abertos e filtrar
  if (markets.length < 2) {
    let offset = 0;
    while (offset < 400) {
      const evs = await getJSON(`${GAMMA}/events`, {
        closed: "false",
        order: "id",
        ascending: "false",
        limit: 50,
        offset,
      });
      if (!evs?.length) break;
      for (const ev of evs) {
        const blob = [ev.title, ev.subtitle, ev.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (terms.some((t) => blob.includes(t.toLowerCase()))) {
          for (const m of ev.markets || []) markets.push(m);
        }
      }
      offset += 50;
    }
  }

  // dedup
  const seen = new Set();
  const out = [];
  for (const m of markets) {
    const key = m.slug || m.id;
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

function marketProbabilities(market) {
  let prices = market.outcomePrices;
  let outcomes = market.shortOutcomes || market.outcomes || market.outcomeAssets || [];
  if (typeof prices === "string") prices = prices.split(",").map((x) => x.trim()).filter(Boolean);
  if (typeof outcomes === "string") outcomes = outcomes.split(",").map((x) => x.trim()).filter(Boolean);
  if (!Array.isArray(prices) || !Array.isArray(outcomes) || prices.length !== outcomes.length) return {};
  const probs = {};
  for (let i = 0; i < outcomes.length; i++) {
    const p = Number(prices[i]);
    if (Number.isFinite(p)) probs[outcomes[i]] = p;
  }
  return probs;
}

const BULL_KEYS = ["up or down", "updown", " all time high", " ath", " above ", " hit ", " reach ", " >"];
const BEAR_KEYS = [" down ", " below ", " crash", " drop", " dump", " <"];

function classifyMarket(market) {
  const title = (
    market.question ||
    market.groupItemTitle ||
    market.slug ||
    ""
  ).toLowerCase().replace(/\s+/g, " ") + " ";

  const probs = marketProbabilities(market);
  const pUp   = probs.Up   ?? probs.YES ?? probs.Yes ?? null;
  const pDown = probs.Down ?? probs.NO  ?? probs.No  ?? null;

  if (
    title.includes("up or down") ||
    title.includes("updown") ||
    (title.includes(" up ") && title.includes(" down "))
  ) {
    const label = pUp != null && (pDown == null || pUp >= pDown) ? "altista" : "baixista";
    const strength = pUp != null ? pUp : 0.5;
    return { label, strength };
  }
  if (BULL_KEYS.some((k) => title.includes(k))) {
    return { label: "altista", strength: pUp ?? probs.YES ?? 0.5 };
  }
  if (BEAR_KEYS.some((k) => title.includes(k))) {
    return { label: "baixista", strength: pDown ?? probs.NO ?? 0.5 };
  }
  return { label: "neutro", strength: 0.5 };
}

function isTodayBRT(market) {
  const { start } = todayRangeBRT();
  const s = parseISO(market.startDateIso) || parseISO(market.startDate) || parseISO(market.createdAt);
  const e = parseISO(market.endDateIso)   || parseISO(market.endDate);
  if (s && s.setZone(BRT).hasSame(start, "day")) return true;
  if (e && e.setZone(BRT).hasSame(start, "day")) return true;
  if (!s && !e) return true; // mercados intradiários às vezes não trazem datas
  return false;
}

function computeSentiment(markets) {
  const buckets = { altista: [], baixista: [], neutro: [] };

  for (const m of markets) {
    if (!isTodayBRT(m)) continue;
    const { label, strength } = classifyMarket(m);
    const oi = Number(m.openInterest ?? m.openInterestNum ?? 0) || 0;
    const vol = Number(m.volumeNum ?? m.volume ?? 0) || 0;
    const weight = oi > 0 ? oi : vol > 0 ? vol : 1;
    buckets[label].push({ strength, weight, m });
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

  const examples = []
    .concat(buckets.altista, buckets.baixista, buckets.neutro)
    .slice(0, 8)
    .map(({ m }) => {
      const probs = marketProbabilities(m);
      return {
        title: m.question || m.groupItemTitle || m.slug,
        up: probs.Up ?? probs.YES ?? null,
        down: probs.Down ?? probs.NO ?? null,
        end: m.endDateIso || m.endDate || null,
      };
    });

  return {
    score,
    counts: {
      altistas: buckets.altista.length,
      baixistas: buckets.baixista.length,
      neutros: buckets.neutro.length,
    },
    examples,
  };
}

// ===============================
// API principal para o seu bot
// ===============================
export async function polymarketSentimentUniversal(queryOrTicker) {
  const resolved = await resolveAssetTermsDynamic(queryOrTicker);
  const markets = await searchMarketsByTerms(resolved.terms, resolved.name);
  const { score, counts, examples } = computeSentiment(markets);

  const today = DateTime.now().setZone(BRT).toFormat("dd/LL/yyyy");
  const title = `🧠 Sentimento Polymarket — ${resolved.name} (${resolved.symbol}) — ${today}`;

  const lines = [
    title,
    "",
    `Índice (0-100): ${score}`,
    `Mercados hoje → Altistas: ${counts.altistas} | Baixistas: ${counts.baixistas} | Neutros: ${counts.neutros}`,
  ];

  if (examples.length) {
    lines.push("", "Exemplos:");
    for (const ex of examples) {
      const up = ex.up != null ? `Up≈${ex.up.toFixed(2)}` : "";
      const dn = ex.down != null ? ` Down≈${ex.down.toFixed(2)}` : "";
      const end = ex.end ? ` | fim: ${ex.end}` : "";
      lines.push(`• ${ex.title}${up || dn ? ` | ${up}${dn}` : ""}${end}`);
    }
  }

  lines.push("", "Fonte: Polymarket");
  return lines.join("\n");
}

// ============================================
// Handler: aceita QUALQUER !<ticker> (2-10)
// ============================================
export async function handleAnyTickerPolymarketCommand(client, message, waUtil) {
  try {
    const text = (message.text || message.body || "").trim();
    // Captura !abc, !btc, !sol, !wif, !bonk, !doge, !arb, !tia, ...
    const m = text.match(/^!([a-z0-9]{2,10})\b/i);
    if (!m) return false; // não é comando deste handler

    const ticker = m[1];

    const reply = await polymarketSentimentUniversal(ticker);

    await waUtil.replyText(
      client,
      message.chat_id,
      reply,
      message.wa_message,
      { expiration: message.expiration }
    );
    return true;
  } catch (err) {
    console.error("Erro no handleAnyTickerPolymarketCommand:", err);
    const msg =
      "Não consegui obter o sentimento do Polymarket agora. " +
      "Tente novamente mais tarde ou experimente outro ticker.";
    try {
      await waUtil.replyText(
        client,
        message.chat_id,
        msg,
        message.wa_message,
        { expiration: message.expiration }
      );
    } catch {}
    return true;
  }
}
