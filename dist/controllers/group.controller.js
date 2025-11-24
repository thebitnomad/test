// controllers/group.controller.js
import { jidNormalizedUser } from 'baileys'; // ou '@whiskeysockets/baileys'
import { GroupService } from "../services/group.service.js";
import { ParticipantService } from "../services/participant.service.js";

function nChat(id) {
  if (!id) return id;
  try { return jidNormalizedUser(id); } catch { return id; }  // @g.us permanece
}
function nUser(id) {
  if (!id) return id;
  try { return jidNormalizedUser(id); } catch { return id; }  // ...@s.whatsapp.net
}

export class GroupController {
  groupService;
  participantService;

  constructor() {
    this.groupService = new GroupService();
    this.participantService = new ParticipantService();
  }

  // ***** Grupo *****
  registerGroup(group) {
    // se o objeto já tiver id, normaliza
    const g = { ...group };
    if (g.id) g.id = nChat(g.id);
    if (g.group_id) g.group_id = nChat(g.group_id);
    return this.groupService.registerGroup(g);
  }

  migrateGroups() {
    return this.groupService.migrateGroups();
  }

  getGroup(groupId) {
    return this.groupService.getGroup(nChat(groupId));
  }

  getAllGroups() {
    return this.groupService.getAllGroups();
  }

  setNameGroup(groupId, name) {
    return this.groupService.setName(nChat(groupId), name);
  }

  setRestrictedGroup(groupId, status) {
    return this.groupService.setRestricted(nChat(groupId), status);
  }

  syncGroups(groups) {
    // Se seu service aceita um array, normalize ids dentro
    const list = Array.isArray(groups)
      ? groups.map(g => ({ ...g, id: g?.id ? nChat(g.id) : g?.group_id ? nChat(g.group_id) : g?.jid ? nChat(g.jid) : g }))
      : groups;
    return this.groupService.syncGroups(list);
  }

  updatePartialGroup(group) {
    const g = { ...group };
    if (g.id) g.id = nChat(g.id);
    if (g.group_id) g.group_id = nChat(g.group_id);
    return this.groupService.updatePartialGroup(g);
  }

  removeGroup(groupId) {
    return this.groupService.removeGroup(nChat(groupId));
  }

  incrementGroupCommands(groupId) {
    return this.groupService.incrementGroupCommands(nChat(groupId));
  }

  async setWordFilter(groupId, word, operation) {
    return this.groupService.setWordFilter(nChat(groupId), word, operation);
  }

  setWelcome(groupId, status, message = '') {
    return this.groupService.setWelcome(nChat(groupId), status, message);
  }

  setAutoReply(groupId, status) {
    return this.groupService.setAutoReply(nChat(groupId), status);
  }

  async setReplyConfig(groupId, word, reply, operation) {
    return this.groupService.setReplyConfig(nChat(groupId), word, reply, operation);
  }

  setAntiLink(groupId, status) {
    return this.groupService.setAntilink(nChat(groupId), status);
  }

  async setLinkException(groupId, exception, operation) {
    return this.groupService.setLinkException(nChat(groupId), exception, operation);
  }

  setAutoSticker(groupId, status = true) {
    return this.groupService.setAutosticker(nChat(groupId), status);
  }

  setAntiFake(groupId, status) {
    return this.groupService.setAntifake(nChat(groupId), status);
  }

  async setFakePrefixException(groupId, numberPrefix, operation) {
    return this.groupService.setFakePrefixException(nChat(groupId), numberPrefix, operation);
  }

  async setFakeNumberException(groupId, userNumber, operation) {
    return this.groupService.setFakeNumberException(nChat(groupId), userNumber, operation);
  }

  setMuted(groupId, status = true) {
    return this.groupService.setMuted(nChat(groupId), status);
  }

  setAntiFlood(groupId, status = true, maxMessages = 10, interval = 10) {
    return this.groupService.setAntiFlood(nChat(groupId), status, maxMessages, interval);
  }

  async setBlacklist(groupId, userId, operation) {
    return this.groupService.setBlacklist(nChat(groupId), nUser(userId), operation);
  }

  async setBlockedCommands(groupId, prefix, commands, operation) {
    return this.groupService.setBlockedCommands(nChat(groupId), prefix, commands, operation);
  }

  // ***** Participantes *****
  addParticipant(groupId, userId, isAdmin = false) {
    return this.participantService.addParticipant(nChat(groupId), nUser(userId), isAdmin);
  }

  removeParticipant(groupId, userId) {
    return this.participantService.removeParticipant(nChat(groupId), nUser(userId));
  }

  async setAdmin(groupId, userId, status) {
    return this.participantService.setAdmin(nChat(groupId), nUser(userId), status);
  }

  migrateParticipants() {
    return this.participantService.migrateParticipants();
  }

  getParticipant(groupId, userId) {
    return this.participantService.getParticipantFromGroup(nChat(groupId), nUser(userId));
  }

  getParticipants(groupId) {
    return this.participantService.getParticipantsFromGroup(nChat(groupId));
  }

  getParticipantsIds(groupId) {
    return this.participantService.getParticipantsIdsFromGroup(nChat(groupId));
  }

  getAdmins(groupId) {
    return this.participantService.getAdminsFromGroup(nChat(groupId));
  }

  getAdminsIds(groupId) {
    return this.participantService.getAdminsIdsFromGroup(nChat(groupId));
  }

  isParticipant(groupId, userId) {
    return this.participantService.isGroupParticipant(nChat(groupId), nUser(userId));
  }

  isParticipantAdmin(groupId, userId) {
    return this.participantService.isGroupAdmin(nChat(groupId), nUser(userId));
  }

  getParticipantsActivityLowerThan(group, num) {
    // se chamar por id, normalize; se vier objeto, preserve
    const g = typeof group === 'string' ? nChat(group) : group;
    return this.participantService.getParticipantActivityLowerThan(g, num);
  }

  getParticipantsActivityRanking(group, num) {
    const g = typeof group === 'string' ? nChat(group) : group;
    return this.participantService.getParticipantsActivityRanking(g, num);
  }

  incrementParticipantActivity(groupId, userId, type, isCommand) {
    return this.participantService.incrementParticipantActivity(nChat(groupId), nUser(userId), type, isCommand);
  }

  addParticipantWarning(groupId, userId) {
    return this.participantService.addWarning(nChat(groupId), nUser(userId));
  }

  removeParticipantWarning(groupId, userId, currentWarnings) {
    return this.participantService.removeWarning(nChat(groupId), nUser(userId), currentWarnings);
  }

  removeParticipantsWarnings(groupId) {
    return this.participantService.removeParticipantsWarnings(nChat(groupId));
  }

  async expireParticipantAntiFlood(groupId, userId, newExpireTimestamp) {
    return this.participantService.expireParticipantAntiFlood(nChat(groupId), nUser(userId), newExpireTimestamp);
  }

  async incrementAntiFloodMessage(groupId, userId) {
    return this.participantService.incrementAntiFloodMessage(nChat(groupId), nUser(userId));
  }
}