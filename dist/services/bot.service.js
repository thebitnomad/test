import path from "node:path";
import fs from "fs-extra";
import moment from "moment-timezone";
import { removePrefix } from "../utils/whatsapp.util.js";
import { deepMerge } from "../utils/general.util.js";

export class BotService {
  pathJSON = path.resolve("storage/bot.json");

  defaultBot = {
    started: 0,
    host_number: "",
    name: "DEATH'WISHES",
    prefix: "!",
    executed_cmds: 0,
    db_migrated: true,
    autosticker: false,
    commands_pv: true,
    admin_mode: false,
    block_cmds: [],
    command_rate: {
      status: false,
      max_cmds_minute: 5,
      block_time: 60,
    },
  };

  constructor() {
    const storageDir = path.resolve("storage");
    // Garante diretório
    fs.ensureDirSync(storageDir);

    // Se o JSON não existir, inicializa
    if (!fs.existsSync(this.pathJSON)) {
      this.initBot();
    } else {
      // Se existir, tenta ler; se quebrado, regrava default com merge seguro
      try {
        // Força uma leitura inicial para validar
        const _ = this.getBot();
      } catch {
        this.updateBot(this.defaultBot);
      }
    }
  }

  // --- Utilitários privados -----------------------------------------------

  /**
   * Escrita atômica: grava em arquivo temporário e faz rename.
   * O rename no mesmo volume é atômico. Em Windows, se o alvo existe,
   * removemos antes para evitar erro de EEXIST.
   */
  #writeFileAtomic(targetPath, dataString) {
    const tmpPath = `${targetPath}.tmp`;

    // Grava tmp
    fs.writeFileSync(tmpPath, dataString, { encoding: "utf-8" });

    // Em alguns ambientes Windows, renomear por cima pode falhar
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch {
        // Se não conseguiu remover, tentamos sobrescrever com rename mesmo
      }
    }

    fs.renameSync(tmpPath, targetPath);
  }

  /**
   * Lê JSON do disco de forma resiliente e retorna objeto.
   * - Remove BOM se houver
   * - Retorna {} em caso de erro
   */
  #readJsonSafe(filePath) {
    try {
      let raw = fs.readFileSync(filePath, { encoding: "utf-8" });

      if (!raw || !raw.trim()) {
        return {};
      }

      // Remove BOM
      raw = raw.replace(/^\uFEFF/, "");
      return JSON.parse(raw);
    } catch (err) {
      // Log opcional:
      // console.error("Falha ao ler/parsear bot.json:", err);
      return {};
    }
  }

  // --- Fluxo de inicialização/migração ------------------------------------

  initBot() {
    this.updateBot(this.defaultBot);
  }

  migrateBot() {
    const oldBotData = this.getBot(); // já retorna mergeado e válido
    const newBotData = deepMerge(this.defaultBot, oldBotData);
    this.updateBot(newBotData);
  }

  // --- Operações de leitura/escrita ---------------------------------------

  updateBot(bot) {
    const payload = JSON.stringify(bot, null, 2);
    this.#writeFileAtomic(this.pathJSON, payload);
  }

  deleteBotData() {
    // Mantemos um objeto vazio válido ao invés de arquivo vazio
    const payload = JSON.stringify({}, null, 2);
    this.#writeFileAtomic(this.pathJSON, payload);
  }

  getBot() {
    // Lê o que tiver no arquivo; se vazio/quebrado, retorna {}
    const fromDisk = this.#readJsonSafe(this.pathJSON);
    // Garante presença de todas as chaves padrão
    const merged = deepMerge(this.defaultBot, fromDisk);

    // Se o arquivo estava inválido/incompleto, persistimos o estado saneado
    // (opcional, mas ajuda a "auto-corrigir" o arquivo)
    this.updateBot(merged);

    return merged;
  }

  // --- Setters e mutadores -------------------------------------------------

  startBot(hostNumber) {
    const bot = this.getBot();
    bot.started = moment.now();
    bot.host_number = hostNumber;
    this.updateBot(bot);
  }

  setNameBot(name) {
    const bot = this.getBot();
    bot.name = name;
    this.updateBot(bot);
  }

  setDbMigrated(status) {
    const bot = this.getBot();
    bot.db_migrated = Boolean(status);
    this.updateBot(bot);
  }

  setPrefix(prefix) {
    const bot = this.getBot();
    bot.prefix = String(prefix ?? "").trim() || "!";
    this.updateBot(bot);
  }

  incrementExecutedCommands() {
    const bot = this.getBot();
    bot.executed_cmds = Number(bot.executed_cmds || 0) + 1;
    this.updateBot(bot);
  }

  setAutosticker(status) {
    const bot = this.getBot();
    bot.autosticker = Boolean(status);
    this.updateBot(bot);
  }

  setAdminMode(status) {
    const bot = this.getBot();
    bot.admin_mode = Boolean(status);
    this.updateBot(bot);
  }

  setCommandsPv(status) {
    const bot = this.getBot();
    bot.commands_pv = Boolean(status);
    this.updateBot(bot);
  }

  async setCommandRate(status, maxCommandsMinute, blockTime) {
    const bot = this.getBot();
    bot.command_rate.status = Boolean(status);
    bot.command_rate.max_cmds_minute =
      Number.isFinite(Number(maxCommandsMinute)) ? Number(maxCommandsMinute) : bot.command_rate.max_cmds_minute;
    bot.command_rate.block_time =
      Number.isFinite(Number(blockTime)) ? Number(blockTime) : bot.command_rate.block_time;
    this.updateBot(bot);
  }

  async setBlockedCommands(prefix, commands, operation) {
    const botInfo = this.getBot();

    const commandsWithoutPrefix = (commands || []).map((cmd) => removePrefix(prefix, cmd));

    if (operation === "add") {
      const blockCommands = commandsWithoutPrefix.filter(
        (cmd) => !botInfo.block_cmds.includes(cmd)
      );
      botInfo.block_cmds.push(...blockCommands);
      this.updateBot(botInfo);
      return blockCommands.map((cmd) => prefix + cmd);
    } else {
      const unblockCommands = commandsWithoutPrefix.filter((cmd) =>
        botInfo.block_cmds.includes(cmd)
      );
      unblockCommands.forEach((cmd) => {
        const idx = botInfo.block_cmds.indexOf(cmd);
        if (idx !== -1) botInfo.block_cmds.splice(idx, 1);
      });
      this.updateBot(botInfo);
      return unblockCommands.map((cmd) => prefix + cmd);
    }
  }
}