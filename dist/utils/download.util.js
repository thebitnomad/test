import { formatSeconds, showConsoleLibraryError } from './general.util.js';
import { instagramGetUrl } from 'instagram-url-direct';
import { getFbVideoInfo } from 'fb-downloader-scrapper';
import Tiktok from '@tobyg74/tiktok-api-dl';
import axios from 'axios';
import yts from 'yt-search';
import ytdl from '@distube/ytdl-core';
import botTexts from '../helpers/bot.texts.helper.js';
const FORCE_YTDLP = process.env.FORCE_YTDLP === '1';
export async function xMedia(url) {
    try {
        const newURL = url.replace(/twitter\.com|x\.com/g, 'api.vxtwitter.com');
        const { data: xResponse } = await axios.get(newURL);
        if (!xResponse.media_extended) {
            return null;
        }
        const xMedia = {
            text: xResponse.text,
            media: xResponse.media_extended.map((media) => {
                return {
                    type: (media.type === 'video') ? 'video' : 'image',
                    url: media.url
                };
            })
        };
        return xMedia;
    }
    catch (err) {
        showConsoleLibraryError(err, 'xMedia');
        throw new Error(botTexts.library_error);
    }
}
export async function tiktokMedia(url) {
    try {
        const tiktokResponse = await Tiktok.Downloader(url, { version: "v1" });
        let mediaUrl;
        if (tiktokResponse.status === 'error') {
            return null;
        }
        if (tiktokResponse.result?.type == 'video') {
            if (tiktokResponse.result?.video?.playAddr?.length) {
                mediaUrl = tiktokResponse.result?.video?.playAddr[0];
            }
            else {
                return null;
            }
        }
        else if (tiktokResponse.result?.type == 'image') {
            if (tiktokResponse.result?.images) {
                mediaUrl = tiktokResponse.result?.images;
            }
            else {
                return null;
            }
        }
        else {
            return null;
        }
        const tiktokMedia = {
            author_profile: tiktokResponse.result?.author?.nickname,
            description: tiktokResponse.result?.desc,
            type: tiktokResponse.result?.type,
            duration: tiktokResponse.result?.type == "video" ? parseInt((tiktokResponse.result?.video?.duration / 1000).toFixed(0)) : null,
            url: mediaUrl
        };
        return tiktokMedia;
    }
    catch (err) {
        showConsoleLibraryError(err, 'tiktokMedia');
        throw new Error(botTexts.library_error);
    }
}
export async function facebookMedia(url) {
    try {
        const facebookResponse = await getFbVideoInfo(url);
        const facebookMedia = {
            url: facebookResponse.url,
            duration: parseInt((facebookResponse.duration_ms / 1000).toFixed(0)),
            sd: facebookResponse.sd,
            hd: facebookResponse.hd,
            title: facebookResponse.title,
            thumbnail: facebookResponse.thumbnail
        };
        return facebookMedia;
    }
    catch (err) {
        showConsoleLibraryError(err, 'facebookMedia');
        throw new Error(botTexts.library_error);
    }
}
export async function instagramMedia(url) {
    try {
        const instagramResponse = await instagramGetUrl(url);
        let instagramMedia = {
            author_username: instagramResponse.post_info.owner_username,
            author_fullname: instagramResponse.post_info.owner_fullname,
            caption: instagramResponse.post_info.caption,
            likes: instagramResponse.post_info.likes,
            media: []
        };
        for (const url of instagramResponse.url_list) {
            const { headers } = await axios.head(url);
            const type = headers['content-type'] === 'video/mp4' ? 'video' : 'image';
            instagramMedia.media.push({ type, url });
        }
        return instagramMedia;
    }
    catch (err) {
        showConsoleLibraryError(err, 'instagramMedia');
        throw new Error(botTexts.library_error);
    }
}
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Executa um comando e retorna stdout em string */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || `exit ${code}`))));
  });
}

/** Fallback: tenta obter URL direta via yt-dlp -g */
async function ytDlpGetDirectUrl(videoUrl) {
  const ytdlp = process.env.YTDLP_BIN || 'yt-dlp';
  const args = [
    '-g',
    '-f', 'bv*+ba/b',              // melhor mux ou melhor disponível
    '--user-agent', UA,
    videoUrl
  ];
  const out = await run(ytdlp, args);
  // yt-dlp -g pode retornar 1 ou 2 linhas (vídeo e áudio separados). Preferimos a última (geralmente mux/best).
  const lines = out.split(/\r?\n/).filter(Boolean);
  return lines.pop();
}

/** Monta agente com UA e (opcional) cookies do .env */
function makeAgent() {
  const headers = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8' };
  if (process.env.YT_COOKIES) headers['Cookie'] = process.env.YT_COOKIES;
  // createAgent é suportado pelo @distube/ytdl-core
  return ytdl.createAgent([{ name: 'headers', value: headers }]);
}

/** Normaliza texto para URL ou ID */
async function resolveVideoId(text) {
  if (ytdl.validateURL(text)) {
    return ytdl.getURLVideoID(text);
  }
  const { videos } = await yts(text);
  return videos?.[0]?.videoId;
}

/** === AQUI: função que você chama no comando !yt === */
export async function youtubeMedia(text) {
  try {
    const videoId = await resolveVideoId(text);
    if (!videoId) return null;

    if (FORCE_YTDLP) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const direct = await ytDlpGetDirectUrl(url); // sua função fallback -g
  return {
    id_video: videoId,
    title: '',                 // se quiser, pegue com yt-search
    description: '',
    duration: null,            // idem
    channel: '',
    is_live: false,
    duration_formatted: '',
    url: direct || null
  };
}
    // 1) tenta via ytdl-core (rápido)
    let info;
    try {
      info = await ytdl.getInfo(url, { agent, requestOptions: { headers: { 'User-Agent': UA } } });
    } catch (e) {
      // se o decipher quebrou, pula pro fallback
      info = null;
    }

    let directUrl = null;
    if (info) {
      // tenta formato com vídeo+áudio (mux). Se não tiver, aceita qualquer melhor disponível.
      const va = ytdl.filterFormats(info.formats, 'videoandaudio');
      const chosen = ytdl.chooseFormat(va.length ? va : info.formats, { quality: 'highest' });
      directUrl = chosen?.url || null;
    }

    // 2) fallback robusto: yt-dlp -g
    if (!directUrl) {
      try {
        directUrl = await ytDlpGetDirectUrl(url);
      } catch (_) {
        directUrl = null;
      }
    }

    // Se ainda não temos URL, devolve metadados (sem url) para o caller decidir baixar com yt-dlp direto
    const details = info?.videoDetails;
    const ytInfo = {
      id_video: details?.videoId || videoId,
      title: details?.title || '',
      description: details?.description || '',
      duration: details?.lengthSeconds ? Number(details.lengthSeconds) : null,
      channel: details?.author?.name || '',
      is_live: !!details?.isLive,
      duration_formatted: details?.lengthSeconds ? formatSeconds(Number(details.lengthSeconds)) : '',
      url: directUrl || null
    };

    // opcional: tente thumb estática confiável (não 403)
    // ytInfo.thumb = `https://img.youtube.com/vi/${ytInfo.id_video}/maxresdefault.jpg`;

    return ytInfo;
  } catch (err) {
    showConsoleLibraryError(err, 'youtubeMedia');
    throw new Error(botTexts.library_error);
  }
}