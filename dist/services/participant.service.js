// services/participant.service.js
import { deepMerge, timestampToDate } from '../utils/general.util.js';
import moment from 'moment-timezone';
import DataStore from '@seald-io/nedb';

// ===== NeDB =====
const db = new DataStore({ filename: './storage/participants.groups.db', autoload: true });

// ===== helpers de normalização (JIDs) =====
function isGroupJid(j) {
  return typeof j === 'string' && j.endsWith('@g.us');
}

// Grupo: mantemos como vier se já for @g.us; caso contrário, não forçamos nada aqui.
// (Se você observar grupos chegando com sufixo estranho, dá para trocar para @g.us.)
function nChat(id) {
  if (!id) return id;
  const s = String(id);
  if (isGroupJid(s)) return s;
  return s; // conservador: não altera outros formatos de grupo
}

// Usuário: **força** sempre @s.whatsapp.net (independente do que vier)
function nUser(id) {
  if (!id) return id;
  const s = String(id);
  if (isGroupJid(s)) return s; // não mexe em grupos por engano
  const local = s.split('@')[0]; // remove qualquer sufixo (@lid, @xyz, ou sem @)
  return `${local}@s.whatsapp.net`;
}

// ----- normalizadores usados pelo monkey-patch -----
function normalizeDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = { ...doc };
  if (typeof out.group_id === 'string') out.group_id = nChat(out.group_id);
  if (typeof out.user_id  === 'string') out.user_id  = nUser(out.user_id);
  return out;
}
function normalizeQuery(q) {
  return normalizeDoc(q);
}
function normalizeUpdate(u) {
  if (!u || typeof u !== 'object') return u;
  const out = { ...u };
  for (const key of ['$set', '$setOnInsert', '$inc']) {
    if (out[key] && typeof out[key] === 'object') {
      out[key] = normalizeDoc(out[key]);
    }
  }
  // update "plain" (sem operadores)
  if (!('$set' in out) && !('$inc' in out) && !('$setOnInsert' in out)) {
    return normalizeDoc(out);
  }
  return out;
}

// ===== Parede de contenção no banco (defensivo) =====
const _insertAsync = db.insertAsync.bind(db);
db.insertAsync = async (doc) => _insertAsync(normalizeDoc(doc));

const _updateAsync = db.updateAsync.bind(db);
db.updateAsync = async (query, update, options) =>
  _updateAsync(normalizeQuery(query), normalizeUpdate(update), options);

// (opcional) logs para diagnosticar quem tenta gravar @lid — descomente se quiser:
// db.insertAsync = async (doc) => {
//   const nd = normalizeDoc(doc);
//   if (String(doc?.user_id || '').endsWith('@lid')) {
//     console.warn('[INSERT CORRIGIDO] era:', doc.user_id, '→ ficou:', nd.user_id, '\nCALLER:\n', new Error().stack);
//   }
//   return _insertAsync(nd);
// };
// db.updateAsync = async (q, u, opt) => {
//   const nq = normalizeQuery(q);
//   const nu = normalizeUpdate(u);
//   const beforeSet = u?.$set?.user_id || u?.user_id;
//   const afterSet  = nu?.$set?.user_id || nu?.user_id;
//   if (String(beforeSet || '').endsWith('@lid')) {
//     console.warn('[UPDATE CORRIGIDO] era:', beforeSet, '→ ficou:', afterSet, '\nCALLER:\n', new Error().stack);
//   }
//   return _updateAsync(nq, nu, opt);
// };

// ===== Service =====
export class ParticipantService {
  defaultParticipant = {
    group_id: '',
    user_id: '',
    registered_since: timestampToDate(moment.now()),
    commands: 0,
    admin: false,
    msgs: 0,
    image: 0,
    audio: 0,
    sticker: 0,
    video: 0,
    text: 0,
    other: 0,
    warnings: 0,
    antiflood: {
      expire: 0,
      msgs: 0
    }
  };

  constructor() {
    // Migração leve, assíncrona (não bloqueia o boot)
    this.#migrateSuffixes().catch(() => {});
  }

  /**
   * Sincroniza participantes a partir do metadata do Baileys.
   * - NORMALIZA sempre IDs de grupo e usuário
   * - Evita forEach assíncrono (usa for...of)
   */
  async syncParticipants(groupMeta) {
    const gId = nChat(groupMeta.id);
    const metaParticipants = Array.isArray(groupMeta.participants) ? groupMeta.participants : [];

    // Adiciona/atualiza admins
    for (const p of metaParticipants) {
      const uId = nUser(p.id || p.jid || p);
      const isAdmin = !!p.admin;

      const exists = await this.isGroupParticipant(gId, uId);
      if (!exists) {
        await this.addParticipant(gId, uId, isAdmin);
      } else {
        await db.updateAsync({ group_id: gId, user_id: uId }, { $set: { admin: isAdmin } });
      }
    }

    // Remove quem não está mais no grupo
    const current = await this.getParticipantsFromGroup(gId);
    for (const part of current) {
      const still = metaParticipants.find(mp => nUser(mp.id || mp.jid || mp) === nUser(part.user_id));
      if (!still) {
        await this.removeParticipant(gId, part.user_id);
      }
    }
  }

  async addParticipant(groupId, userId, isAdmin = false) {
    const gId = nChat(groupId);
    const uId = nUser(userId);

    const exists = await this.isGroupParticipant(gId, uId);
    if (exists) return;

    const participant = {
      ...this.defaultParticipant,
      group_id: gId,
      user_id: uId,
      admin: !!isAdmin
    };

    await db.insertAsync(participant);
  }

  async migrateParticipants() {
    const participants = await this.getAllParticipants();
    for (const participant of participants) {
      const gId = nChat(participant.group_id);
      const uId = nUser(participant.user_id);

      const merged = deepMerge(this.defaultParticipant, { ...participant, group_id: gId, user_id: uId });
      await db.updateAsync(
        { group_id: gId, user_id: uId },
        { $set: merged },
        { upsert: true }
      );
    }
  }

  async removeParticipant(groupId, userId) {
    await db.removeAsync({ group_id: nChat(groupId), user_id: nUser(userId) }, {});
  }

  async removeParticipants(groupId) {
    await db.removeAsync({ group_id: nChat(groupId) }, { multi: true });
  }

  async setAdmin(groupId, userId, status) {
    await db.updateAsync(
      { group_id: nChat(groupId), user_id: nUser(userId) },
      { $set: { admin: !!status } }
    );
  }

  async getParticipantFromGroup(groupId, userId) {
    return db.findOneAsync({ group_id: nChat(groupId), user_id: nUser(userId) });
  }

  async getParticipantsFromGroup(groupId) {
    return db.findAsync({ group_id: nChat(groupId) });
  }

  async getAllParticipants() {
    return db.findAsync({});
  }

  async getParticipantsIdsFromGroup(groupId) {
    const participants = await this.getParticipantsFromGroup(groupId);
    return participants.map(p => nUser(p.user_id));
  }

  async getAdminsFromGroup(groupId) {
    return db.findAsync({ group_id: nChat(groupId), admin: true });
  }

  async getAdminsIdsFromGroup(groupId) {
    const admins = await db.findAsync({ group_id: nChat(groupId), admin: true });
    return admins.map(a => nUser(a.user_id));
  }

  async isGroupParticipant(groupId, userId) {
    const ids = await this.getParticipantsIdsFromGroup(groupId);
    return ids.includes(nUser(userId));
  }

  async isGroupAdmin(groupId, userId) {
    const adminsIds = await this.getAdminsIdsFromGroup(groupId);
    return adminsIds.includes(nUser(userId));
  }

  async incrementParticipantActivity(groupId, userId, type, isCommand) {
    const gId = nChat(groupId);
    const uId = nUser(userId);

    const inc = { msgs: 1 };
    if (isCommand) inc.commands = 1;

    switch (type) {
      case 'conversation':
      case 'extendedTextMessage':
        inc.text = 1;
        break;
      case 'imageMessage':
        inc.image = 1;
        break;
      case 'videoMessage':
        inc.video = 1;
        break;
      case 'stickerMessage':
        inc.sticker = 1;
        break;
      case 'audioMessage':
        inc.audio = 1;
        break;
      case 'documentMessage':
        inc.other = 1;
        break;
      default:
        break;
    }

    await db.updateAsync({ group_id: gId, user_id: uId }, { $inc: inc });
  }

  async getParticipantActivityLowerThan(group, num) {
    const gId = nChat(typeof group === 'string' ? group : group.id);
    return db.findAsync({ group_id: gId, msgs: { $lt: num } }).sort({ msgs: -1 });
  }

  async getParticipantsActivityRanking(group, qty) {
    const gId = nChat(typeof group === 'string' ? group : group.id);
    let leaderboard = await db.findAsync({ group_id: gId }).sort({ msgs: -1 });
    const n = Math.min(qty, leaderboard.length);
    return leaderboard.slice(0, n);
  }

  async addWarning(groupId, userId) {
    await db.updateAsync(
      { group_id: nChat(groupId), user_id: nUser(userId) },
      { $inc: { warnings: 1 } }
    );
  }

  async removeWarning(groupId, userId, currentWarnings) {
    await db.updateAsync(
      { group_id: nChat(groupId), user_id: nUser(userId) },
      { $set: { warnings: Math.max(0, (currentWarnings ?? 1) - 1) } }
    );
  }

  async removeParticipantsWarnings(groupId) {
    await db.updateAsync(
      { group_id: nChat(groupId) },
      { $set: { warnings: 0 } },
      { multi: true }
    );
  }

  async expireParticipantAntiFlood(groupId, userId, newExpireTimestamp) {
    await db.updateAsync(
      { group_id: nChat(groupId), user_id: nUser(userId) },
      { $set: { 'antiflood.expire': newExpireTimestamp, 'antiflood.msgs': 1 } }
    );
  }

  async incrementAntiFloodMessage(groupId, userId) {
    await db.updateAsync(
      { group_id: nChat(groupId), user_id: nUser(userId) },
      { $inc: { 'antiflood.msgs': 1 } }
    );
  }

  // ===== migração leve (executada no construtor) =====
  async #migrateSuffixes() {
    // 1) troca @lid -> @s.whatsapp.net
    const withLid = await db.findAsync({ user_id: /@lid$/ });
    for (const r of withLid) {
      const fixed = nUser(r.user_id);
      if (fixed && fixed !== r.user_id) {
        await db.updateAsync({ _id: r._id }, { $set: { user_id: fixed } }, {});
      }
    }
    // 2) corrige qualquer sufixo de usuário que não seja @s.whatsapp.net
    const wrong = await db.findAsync({ user_id: /@(?!(s\.whatsapp\.net)$)[^@]+$/ });
    for (const r of wrong) {
      const fixed = nUser(r.user_id);
      if (fixed && fixed !== r.user_id) {
        await db.updateAsync({ _id: r._id }, { $set: { user_id: fixed } }, {});
      }
    }
  }
}
