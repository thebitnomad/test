// app.js
import moment from "moment-timezone";
moment.tz.setDefault("America/Sao_Paulo");

import ffmpeg from "fluent-ffmpeg";
import("@ffmpeg-installer/ffmpeg")
  .then((ffmpegInstaller) => ffmpeg.setFfmpegPath(ffmpegInstaller.path))
  .catch(() => { /* ignore */ });

import { botUpdater } from "./helpers/bot.updater.helper.js";
import { buildText, getCurrentBotVersion } from "./utils/general.util.js";
import botTexts from "./helpers/bot.texts.helper.js";

// WhatsApp socket (com getter do client atual)
import connect, { getCurrentClient } from "./socket.js";

// Deps usadas pelo scheduler
import * as miscUtil from "./utils/misc.util.js";
import * as waUtil from "./utils/whatsapp.util.js";
import { utilityCommands } from "./commands/utility.functions.commands.js";

import { startLivecoinsHourly } from "./scheduler/livecoinsHourly.js";

async function init() {
  console.log(buildText(botTexts.starting, getCurrentBotVersion()));

  const hasBotUpdated = await botUpdater();
  if (hasBotUpdated) return;

  // Conecta e aguarda a primeira conexão abrir
  await connect();

  // --- Adapter para newsLivecoins (aceita algumas variações de nome) ---
  const newsFetcher =
    miscUtil.newsLivecoins ||
    miscUtil.newsLiveCoins ||
    miscUtil.fetchLivecoins ||
    miscUtil.fetchLiveCoins;

  if (typeof newsFetcher !== "function") {
    console.error("[LivecoinsHourly] Exports em misc.util.js:", Object.keys(miscUtil));
    throw new Error("[LivecoinsHourly] newsFetcher não encontrado (esperado 'newsLivecoins' ou variações).");
  }

  // criamos um objeto misc compatível com o scheduler
  const misc = { ...miscUtil, newsLivecoins: newsFetcher };

  // Inicia o agendador de notícias (1x por hora), usando SEMPRE o client atual
  startLivecoinsHourly(
    () => getCurrentClient(),                      // pega o socket válido a cada tick
    { miscUtil: misc, waUtil, utilityCommands, buildText },
    {
      intervalMinutes: 60,
      maxPerTick: 5,
      filters: [],
      alignToHour: false,                          // envia a cada X minutos a partir de agora
      //initialDelayMs: 15000,                       // espera 15s após restart p/ 1º tick
      //resendIfNoNewAfterMinutes: 180               // opcional: reenvia 1 item se 3h sem novidades
    }
  );
}

init().catch((err) => {
  console.error("Falha ao iniciar o bot:", err);
  process.exitCode = 1;
});
