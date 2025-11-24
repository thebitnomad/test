// controllers/user.controller.js
import { jidDecode } from 'baileys';
import { UserService } from '../services/user.service.js';

/**
 * Converte qualquer JID de usuário (incluindo user:device@s.whatsapp.net)
 * para o formato "bare" (user@s.whatsapp.net) e força sufixo correto.
 * Não mexe em grupos (@g.us).
 */
function toBareJid(jid) {
  if (!jid) return jid;
  const s = String(jid);

  // grupos ficam como estão
  if (s.endsWith('@g.us')) return s;

  // tenta decodificar user:device
  const d = jidDecode(s);
  if (d?.user) return `${d.user}@s.whatsapp.net`;

  // fallback: remove ":<device>" antes do @
  const semDevice = s.replace(/:\d+@s\.whatsapp\.net$/, '@s.whatsapp.net');

  // força sufixo @s.whatsapp.net para qualquer usuário
  const local = semDevice.split('@')[0];
  return `${local}@s.whatsapp.net`;
}

export class UserController {
  userService;

  constructor() {
    this.userService = new UserService();
  }

  // ---------- helper público (útil no messages.upsert) ----------
  /**
   * Garante que o usuário exista a partir de um objeto "msg" do formatWAMessage.
   * - Normaliza o JID para bare
   * - Busca no banco
   * - Se não existir, registra com pushname
   */
  async ensureByMsg(msg) {
    const id = toBareJid(msg?.sender);
    if (!id) return null;
    let user = await this.userService.getUser(id);
    if (!user) {
      await this.userService.registerUser(id, msg?.pushname || '');
      user = await this.userService.getUser(id);
    }
    return user;
  }

  // ---------- API com normalização SEMPRE ----------
  registerUser(userId, name) {
    return this.userService.registerUser(toBareJid(userId), name);
  }

  migrateUsers() {
    // deixe a migração “pesada” no service para varrer a base toda
    return this.userService.migrateUsers();
  }

  setName(userId, name) {
    return this.userService.setName(toBareJid(userId), name);
  }

  promoteUser(userId) {
    return this.userService.setAdmin(toBareJid(userId), true);
  }

  demoteUser(userId) {
    return this.userService.setAdmin(toBareJid(userId), false);
  }

  registerOwner(userId) {
    return this.userService.setOwner(toBareJid(userId));
  }

  async getUsers() {
    const list = await this.userService.getUsers();
    return Array.isArray(list)
      ? list.map(u => ({ ...u, id: toBareJid(u.id) }))
      : list;
  }

  async getUser(userId) {
    const u = await this.userService.getUser(toBareJid(userId));
    return u ? { ...u, id: toBareJid(u.id) } : u;
  }

  async getOwner() {
    const o = await this.userService.getOwner();
    return o ? { ...o, id: toBareJid(o.id) } : o;
  }

  async getAdmins() {
    const admins = await this.userService.getAdmins();
    return Array.isArray(admins)
      ? admins.map(a => ({ ...a, id: toBareJid(a.id) }))
      : admins;
  }

  setReceivedWelcome(userId, status = true) {
    return this.userService.setReceivedWelcome(toBareJid(userId), status);
  }

  increaseUserCommandsCount(userId) {
    return this.userService.increaseUserCommandsCount(toBareJid(userId));
  }

  async expireCommandsRate(userId, currentTimestamp) {
    return this.userService.expireCommandsRate(toBareJid(userId), currentTimestamp);
  }

  async incrementCommandRate(userId) {
    return this.userService.incrementCommandRate(toBareJid(userId));
  }

  setLimitedUser(userId, isLimited, botInfo, currentTimestamp) {
    return this.userService.setLimitedUser(
      toBareJid(userId),
      isLimited,
      botInfo,
      currentTimestamp
    );
  }
}
