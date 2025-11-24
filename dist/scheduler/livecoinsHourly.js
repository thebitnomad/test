// scheduler/livecoinsHourly.js
import fs from 'node:fs';
import path from 'node:path';

const GROUP_IDS = [
  ''
];

const STORE_PATH = path.join(process.cwd(), 'data', 'sent_livecoins.json');

function ensureStoreDir() {
  const dir = path.dirname(STORE_PATH);
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
}
function loadStore() {
  ensureStoreDir();
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[LivecoinsHourly] Erro lendo STORE:', e);
  }
  return {};
}
function saveStore(store) {
  try {
    ensureStoreDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('[LivecoinsHourly] Erro salvando STORE:', e);
  }
}

export function startLivecoinsHourly(
  getClient,
  { miscUtil, waUtil, utilityCommands },
  opts = {}
) {
  const intervalMinutes = Number.isFinite(opts.intervalMinutes) ? opts.intervalMinutes : 60;
  const intervalMs = intervalMinutes * 60 * 1000;
  const maxPerTick = Number.isFinite(opts.maxPerTick) ? opts.maxPerTick : 5;
  const filters = Array.isArray(opts.filters) ? opts.filters : [];
  const alignToHour = opts.alignToHour ?? false;
  const resendIfNoNewAfterMinutes = Number.isFinite(opts.resendIfNoNewAfterMinutes)
    ? opts.resendIfNoNewAfterMinutes
    : null;
  const initialDelayMs = Number.isFinite(opts.initialDelayMs) ? opts.initialDelayMs : 15000;

  const dbg = (...a) => console.log('[LivecoinsHourly]', ...a);
  const titleTpl = utilityCommands?.noticias?.msgs?.reply_title ?? '📰 *Últimas do Livecoins:*';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fetchImageToBuffer(url, { maxBytes = 8 * 1024 * 1024 } = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    try {
      const fetchImpl = globalThis.fetch || (await import('node-fetch')).default;
      const res = await fetchImpl(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: 'https://livecoins.com.br/',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
      const ctype = res.headers.get('content-type') || 'image/jpeg';
      if (!/^image\//i.test(ctype)) throw new Error(`Tipo não suportado: ${ctype}`);

      const chunks = [];
      let received = 0;
      for await (const chunk of res.body) {
        chunks.push(chunk);
        received += chunk.length;
        if (received > maxBytes) throw new Error('Imagem muito grande');
      }
      return { buffer: Buffer.concat(chunks), mime: ctype };
    } finally {
      clearTimeout(t);
    }
  }

  function clamp(str, max = 600) {
    if (!str) return '';
    let s = String(str).replace(/\s+/g, ' ').trim();
    if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
    return s;
  }

  const appendUtm = (url) => {
    try {
      const u = new URL(url);
      if (!u.searchParams.has('utm_source')) {
        u.searchParams.append('utm_source', 'whatsapp');
      }
      return u.toString();
    } catch {
      if (typeof url === 'string' && !url.includes('utm_source=whatsapp')) {
        return url + (url.includes('?') ? '&' : '?') + 'utm_source=whatsapp';
      }
      return url;
    }
  };

  const tick = async () => {
    try {
      const newsList = await miscUtil.newsLivecoins(filters);
      const store = loadStore();
      const now = Date.now();
      const PRUNE_MS = 72 * 60 * 60 * 1000;

      store._lastSendTs = store._lastSendTs || {};
      store._lastItemByGroup = store._lastItemByGroup || {};

      for (const groupId of GROUP_IDS) {
        const sock = typeof getClient === 'function' ? getClient() : null;
        if (!sock) {
          dbg(`(grupo ${groupId}) Sem socket; pulando tick.`);
          continue;
        }

        const sentEntries = (store[groupId] || []).filter((e) => now - e.ts < PRUNE_MS);
        const already = new Set(sentEntries.map((e) => e.url));

        const toSend = [];
        for (const n of newsList || []) {
          if (!n?.url) continue;
          n.url = appendUtm(n.url);
          if (already.has(n.url)) continue;
          toSend.push(n);
          if (toSend.length >= maxPerTick) break;
        }

        if (toSend.length === 0) {
          const lastTs = store._lastSendTs[groupId] || 0;
          const minsSinceLast = (now - lastTs) / 60000;

          if (resendIfNoNewAfterMinutes && minsSinceLast >= resendIfNoNewAfterMinutes) {
            const fallback = newsList?.[0] || store._lastItemByGroup[groupId];
            if (fallback?.url) {
              const caption = (() => {
                const title = clamp(fallback.title) || 'Sem título';
                const summary = clamp(fallback.summary);
                const link = appendUtm(fallback.url);
                let c = `*${title}*`;
                if (summary) c += `\n\n*Resumo:* ${summary}`;
                c += `\n\n*• Link:* ${link}`;
                return c;
              })();
              try {
                await waUtil.replyText(sock, groupId, `${titleTpl}`, null, {});
                await sock.sendMessage(groupId, { text: caption });
                store._lastSendTs[groupId] = now;
                store._lastItemByGroup[groupId] = fallback;
                saveStore(store);
                dbg(`(grupo ${groupId}) Reenvio de fallback após ${minsSinceLast.toFixed(1)}min.`);
              } catch (sendErr) {
                console.error(`[LivecoinsHourly] Falha ao enviar fallback para ${groupId}:`, sendErr?.message || sendErr);
              }
            } else {
              dbg(`(grupo ${groupId}) Sem novos e sem fallback disponível.`);
            }
          } else {
            dbg(`(grupo ${groupId}) Nada novo. (mins desde última: ${minsSinceLast?.toFixed?.(1) ?? '—'})`);
          }

          store[groupId] = sentEntries;
          continue;
        }

        try {
          await waUtil.replyText(sock, groupId, `${titleTpl}`, null, {});
        } catch (sendErr) {
          console.error(`[LivecoinsHourly] Falha ao enviar título para ${groupId}:`, sendErr?.message || sendErr);
          continue;
        }

        const updatedSent = [...sentEntries];

        for (const n of toSend) {
          const title = clamp(n.title) || 'Sem título';
          const summary = clamp(n.summary);
          const link = appendUtm(n.url);

          let caption = `*${title}*`;
          if (summary) caption += `\n\n*Resumo:* ${summary}`;
          caption += `\n\n*• Link:* ${link}`;

          dbg(`(grupo ${groupId}) Preparando envio: ${title}, img: ${n.image ? 'sim' : 'não'}`);

          try {
            if (n.image) {
              const got = await fetchImageToBuffer(n.image);
              await sock.sendMessage(groupId, { image: got.buffer, mimetype: got.mime, caption });
            } else {
              await sock.sendMessage(groupId, { text: caption });
            }
          } catch (e) {
            console.error(`[LivecoinsHourly] Falha ao enviar notícia para ${groupId} (${title}):`, e?.message || e);
            await sock.sendMessage(groupId, { text: caption });
          }

          updatedSent.push({ url: n.url, ts: now });
          await sleep(1500);
        }

        store[groupId] = updatedSent;
        store._lastSendTs[groupId] = now;
        store._lastItemByGroup[groupId] = toSend[0];
        dbg(`(grupo ${groupId}) Enviados ${toSend.length} itens.`);
      }

      saveStore(store);
    } catch (err) {
      console.error('[LivecoinsHourly] Erro no tick:', err);
    }
  };

  const startAfter = async (ms) => {
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    if (alignToHour) {
      const now = new Date();
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      if (now.getMinutes() !== 0 || now.getSeconds() !== 0) next.setHours(now.getHours() + 1);
      const delay = next - now;
      await tick();
      setTimeout(() => {
        tick();
        setInterval(tick, intervalMs);
      }, delay);
      dbg(`Agendado com alinhamento (cada ${intervalMinutes} min).`);
    } else {
      await tick();
      setInterval(tick, intervalMs);
      dbg(`Agendado a cada ${intervalMinutes} min.`);
    }
  };

  startAfter(initialDelayMs);
}
