import { buildText, messageErrorCommandUsage } from "../utils/general.util.js";
import * as waUtil from "../utils/whatsapp.util.js";
import * as downloadUtil from '../utils/download.util.js';
import * as convertUtil from '../utils/convert.util.js';
import { imageSearchGoogle } from '../utils/image.util.js';
import format from 'format-duration';
import downloadCommands from "./download.list.commands.js";
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let err = '';
    p.stderr.on('data', d => (err += d.toString()));
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
  });
}

async function ytDlpDownload(url, outDir, basename = 'video') {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${basename}.mp4`);
  const ytdlp = process.env.YTDLP_BIN || 'yt-dlp';
  const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
  const args = [
    url,
    '-f', 'bv*+ba/b',
    '--merge-output-format', 'mp4',
    '-o', outPath,
    '--ffmpeg-location', ffmpeg,
    '--user-agent', UA
  ];
  await run(ytdlp, args);
  return outPath;
}

export async function ytCommand(client, botInfo, message, group) {
  try {
    if (!message.args.length) {
      throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }

    const videoInfo = await downloadUtil.youtubeMedia(message.text_command);
    if (!videoInfo) {
      throw new Error(downloadCommands.yt.msgs.error_not_found);
    } else if (videoInfo.is_live) {
      throw new Error(downloadCommands.yt.msgs.error_live);
    } else if (videoInfo.duration && videoInfo.duration > 9000) {
      throw new Error(downloadCommands.yt.msgs.error_limit);
    }

    const waitReply = buildText(
      downloadCommands.yt.msgs.wait,
      videoInfo.title || '',
      videoInfo.duration_formatted || ''
    );
    await waUtil.replyText(
      client,
      message.chat_id,
      waitReply,
      message.wa_message,
      { expiration: message.expiration }
    );

    // 1ª tentativa: enviar pela URL direta (se houver)
    if (videoInfo.url) {
      try {
        await waUtil.replyFileFromUrl(
          client,
          message.chat_id,
          'videoMessage',
          videoInfo.url,
          '',
          message.wa_message,
          {
            expiration: message.expiration,
            mimetype: 'video/mp4',
            requestOptions: { headers: { 'User-Agent': UA, 'Referer': 'https://www.youtube.com/' } }
          }
        );
        return;
      } catch (e) {
        console.error('[ytCommand] envio por URL falhou; caindo para yt-dlp:', e.message || e);
      }
    }

    // Fallback: baixa com yt-dlp e envia por arquivo
    const baseDir = path.join(
      process.env.STORAGE_DIR || path.join(process.cwd(), 'storage'),
      'yt',
      (message.sender || 'anon').split('@')[0]
    );
    const url = videoInfo.id_video
      ? `https://www.youtube.com/watch?v=${videoInfo.id_video}`
      : message.text_command;

    const filePath = await ytDlpDownload(url, baseDir, 'video');

    await waUtil.replyFileFromPath(
      client,
      message.chat_id,
      'videoMessage',
      filePath,
      '',
      message.wa_message,
      { expiration: message.expiration, mimetype: 'video/mp4' }
    );
  } catch (err) {
    console.error('[!yt]', err);
    await waUtil.replyText(
      client,
      message.chat_id,
      botTexts.library_error || '❌ Não consegui baixar este vídeo agora. Tente novamente mais tarde.',
      message.wa_message
    );
  }
}
export async function fbCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const fbInfo = await downloadUtil.facebookMedia(message.text_command);
    if (fbInfo.duration > 360) {
        throw new Error(downloadCommands.fb.msgs.error_limit);
    }
    const waitReply = buildText(downloadCommands.fb.msgs.wait, fbInfo.title, format(fbInfo.duration * 1000));
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration });
    await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', fbInfo.sd, '', message.wa_message, { expiration: message.expiration, mimetype: 'video/mp4' });
}
export async function igCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const igInfo = await downloadUtil.instagramMedia(message.text_command);
    const waitReply = buildText(downloadCommands.ig.msgs.wait, igInfo.author_fullname, igInfo.author_username, igInfo.caption, igInfo.likes);
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration });
    for await (let media of igInfo.media) {
        if (media.type == "image") {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', media.url, '', message.wa_message, { expiration: message.expiration });
        }
        else if (media.type == "video") {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', media.url, '', message.wa_message, { expiration: message.expiration, mimetype: 'video/mp4' });
        }
    }
}
export async function xCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const xInfo = await downloadUtil.xMedia(message.text_command);
    if (!xInfo) {
        throw new Error(downloadCommands.x.msgs.error_not_found);
    }
    const waitReply = buildText(downloadCommands.x.msgs.wait, xInfo.text);
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration });
    for await (let media of xInfo.media) {
        if (media.type == "image") {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', media.url, '', message.wa_message, { expiration: message.expiration });
        }
        else if (media.type == "video") {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', media.url, '', message.wa_message, { expiration: message.expiration, mimetype: 'video/mp4' });
        }
    }
}
export async function tkCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const tiktok = await downloadUtil.tiktokMedia(message.text_command);
    if (!tiktok) {
        throw new Error(downloadCommands.tk.msgs.error_not_found);
    }
    const waitReply = buildText(downloadCommands.tk.msgs.wait, tiktok.author_profile, tiktok.description);
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, { expiration: message.expiration });
    if (!Array.isArray(tiktok.url)) {
        if (tiktok.type == 'image') {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', tiktok.url, '', message.wa_message, { expiration: message.expiration });
        }
        else if (tiktok.type == 'video') {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', tiktok.url, '', message.wa_message, { expiration: message.expiration, mimetype: 'video/mp4' });
        }
    }
    else {
        for await (const url of tiktok.url) {
            if (tiktok.type == 'image') {
                await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', url, '', message.wa_message, { expiration: message.expiration });
            }
            else if (tiktok.type == 'video') {
                await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', url, '', message.wa_message, { expiration: message.expiration, mimetype: 'video/mp4' });
            }
        }
    }
}
export async function imgCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const MAX_SENT = 5;
    const MAX_RESULTS = 50;
    let imagesSent = 0;
    let images = await imageSearchGoogle(message.text_command);
    const maxImageResults = images.length > MAX_RESULTS ? MAX_RESULTS : images.length;
    images = images.splice(0, maxImageResults);
    for (let i = 0; i < maxImageResults; i++) {
        let randomIndex = Math.floor(Math.random() * images.length);
        let chosenImage = images[randomIndex].url;
        await waUtil.sendFileFromUrl(client, message.chat_id, 'imageMessage', chosenImage, '', { expiration: message.expiration, mimetype: 'image/jpeg' }).then(() => {
            imagesSent++;
        }).catch(() => {
            //Ignora se não for possível enviar essa imagem
        });
        images.splice(randomIndex, 1);
        if (imagesSent == MAX_SENT) {
            break;
        }
    }
    if (!imagesSent) {
        throw new Error(downloadCommands.img.msgs.error);
    }
}
