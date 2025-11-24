// helpers/groups.sync.helper.js
import { BotController } from '../controllers/bot.controller.js';
import { buildText, showConsoleError, colorText } from '../utils/general.util.js';
import { GroupController } from '../controllers/group.controller.js';
import botTexts from '../helpers/bot.texts.helper.js';
import * as waUtil from '../utils/whatsapp.util.js';
import { jidNormalizedUser } from 'baileys'; // ou '@whiskeysockets/baileys'

// ----- helpers de normalização -----
function nChat(id) {
  if (!id) return id;
  try { return jidNormalizedUser(id); } catch { return id; } // grupos permanecem @g.us
}
function nUser(id) {
  if (!id) return id;
  try { return jidNormalizedUser(id); } catch { return id; } // usuários => ...@s.whatsapp.net
}
function phoneFromJid(jid) {
  return (jid || '').replace(/@.*/, ''); // "5599..."
}

/**
 * Busca os grupos do cliente, normaliza os IDs e sincroniza no banco.
 * Depois roda a verificação de recursos (blacklist / antifake).
 */
export async function syncGroupsOnStart(client) {
  try {
    const raw = await waUtil.getAllGroups(client);
    // raw pode ser array ou objeto {id: meta}
    const groupsMetadata = Array.isArray(raw) ? raw : Object.values(raw || []);

    if (groupsMetadata.length) {
      const groupController = new GroupController();

      // normaliza id dos grupos ANTES de sincronizar
      const normalized = groupsMetadata.map(g => ({
        ...g,
        id: nChat(g?.id || g?.group_id || g?.jid || ''),
      }));

      await groupController.syncGroups(normalized);
      await syncResources(client);
      console.log(colorText(botTexts.groups_loaded));
    }
    return true;
  } catch (err) {
    showConsoleError(err, 'GROUPS-START-UPDATE');
    client.end(new Error('fatal_error'));
  }
  return true;
}

/**
 * Para cada grupo atual:
 * - Normaliza hostId, blacklist, exceções do antifake
 * - Varre participantes para ban por blacklist/antifake
 * - Envia avisos agregados
 */
async function syncResources(client) {
  const groupController = new GroupController();
  const currentGroups = await groupController.getAllGroups();
  const botInfo = new BotController().getBot();

  // hostId canônico
  const hostId = botInfo?.host_number ? nUser(botInfo.host_number) : undefined;

  for (const g of currentGroups) {
    const groupId = nChat(g.id);

    // participantes do grupo (ParticipantService já deve normalizar, mas garantimos)
    const participants = await groupController.getParticipants(groupId);
    const partJids = participants.map(p => nUser(p.user_id));

    // é admin?
    const isBotAdmin = hostId ? await groupController.isParticipantAdmin(groupId, hostId) : false;

    let bannedByBlackList = 0;
    let bannedByAntiFake = 0;

    if (isBotAdmin) {
      // normalize blacklist (ids e telefones salvos em formatos variados)
      const rawBlacklist = Array.isArray(g.blacklist) ? g.blacklist : [];
      const blacklist = rawBlacklist.map(x => {
        // se vier número puro, transforme em JID s.whatsapp.net
        if (typeof x === 'string' && !x.includes('@')) {
          try {
            return nUser(waUtil.addWhatsappSuffix ? waUtil.addWhatsappSuffix(x) : `${x}@s.whatsapp.net`);
          } catch {
            return `${x}@s.whatsapp.net`;
          }
        }
        try { return nUser(x); } catch { return x; }
      });

      // antifake config
      const anti = g.antifake || {};
      const allowedPrefixes = Array.isArray(anti?.exceptions?.prefixes) ? anti.exceptions.prefixes : [];
      const allowedNumbers  = Array.isArray(anti?.exceptions?.numbers)  ? anti.exceptions.numbers  : [];

      // normaliza allowedNumbers para JID
      const allowedJids = allowedNumbers.map(num => {
        if (typeof num !== 'string') return '';
        const asJid = num.includes('@')
          ? num
          : (waUtil.addWhatsappSuffix ? waUtil.addWhatsappSuffix(num) : `${num}@s.whatsapp.net`);
        try { return nUser(asJid); } catch { return asJid; }
      });

      for (let i = 0; i < partJids.length; i++) {
        const uid = partJids[i];
        const phone = phoneFromJid(uid);
        const isBotNumber = hostId && uid === hostId;

        // SYNC LISTA NEGRA
        const isUserBlacklisted = blacklist.includes(uid);
        if (isUserBlacklisted) {
          await waUtil.removeParticipant(client, groupId, uid);
          bannedByBlackList++;
          continue;
        }

        // SYNC ANTI-FAKE
        if (anti.status) {
          // allowedPrefixes é por prefixo de número, então compare no phone (sem @s.whatsapp.net)
          const isAllowedPrefix = allowedPrefixes.some(prefix => phone.startsWith(prefix));
          const isAllowedNumber = allowedJids.includes(uid);

          // estado admin do participante (participants já traz admin, mas garanta via service se quiser)
          const isGroupAdmin = await groupController.isParticipantAdmin(groupId, uid);

          if (!isAllowedPrefix && !isAllowedNumber && !isBotNumber && !isGroupAdmin) {
            await waUtil.removeParticipant(client, groupId, uid);
            bannedByAntiFake++;
            continue;
          }
        }
      }

      if (bannedByBlackList) {
        const replyText = buildText(botTexts.sync_blacklist, bannedByBlackList);
        await waUtil.sendText(client, groupId, replyText, { expiration: g.expiration });
      }
      if (bannedByAntiFake) {
        const replyText = buildText(botTexts.sync_antifake, bannedByAntiFake);
        await waUtil.sendText(client, groupId, replyText, { expiration: g.expiration });
      }
    } else {
      // sem permissão — desliga antifake para evitar falsos positivos
      if (g.antifake?.status) {
        await groupController.setAntiFake(groupId, false);
      }
    }
  }
}
