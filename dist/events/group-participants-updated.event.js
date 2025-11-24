// events/group-participants-updated.event.js
import { buildText, showConsoleError } from '../utils/general.util.js';
import { GroupController } from '../controllers/group.controller.js';
import botTexts from '../helpers/bot.texts.helper.js';
import { removeParticipant, sendTextWithMentions, removeWhatsappSuffix, addWhatsappSuffix } from '../utils/whatsapp.util.js';
import { jidNormalizedUser } from 'baileys'; // ou '@whiskeysockets/baileys'

export async function groupParticipantsUpdated(client, event, botInfo) {
  try {
    const groupController = new GroupController();

    // --- NORMALIZA TUDO AO ENTRAR ---
    const groupId = jidNormalizedUser(event.id);
    const participants = (event.participants || []).map(j => jidNormalizedUser(j));
    const userId = participants[0];
    const hostId = botInfo?.host_number ? jidNormalizedUser(botInfo.host_number) : undefined;
    const isBotUpdate = hostId ? participants.includes(hostId) : false;

    const group = await groupController.getGroup(groupId);
    if (!group) return;

    if (event.action === 'add') {
      const isParticipant = await groupController.isParticipant(groupId, userId);
      if (isParticipant) return;

      if (await isParticipantBlacklisted(client, botInfo, group, userId)) return;
      if (await isParticipantFake(client, botInfo, group, userId)) return;

      await sendWelcome(client, { ...group, id: groupId }, botInfo, userId);
      await groupController.addParticipant(groupId, userId);
    }
    else if (event.action === 'remove') {
      const isParticipant = await groupController.isParticipant(groupId, userId);
      if (!isParticipant) return;

      if (isBotUpdate) {
        await groupController.removeGroup(groupId);
      } else {
        await groupController.removeParticipant(groupId, userId);
      }
    }
    else if (event.action === 'promote') {
      const isAdmin = await groupController.isParticipantAdmin(groupId, userId);
      if (isAdmin) return;
      await groupController.setAdmin(groupId, userId, true);
    }
    else if (event.action === 'demote') {
      const isAdmin = await groupController.isParticipantAdmin(groupId, userId);
      if (!isAdmin) return;
      await groupController.setAdmin(groupId, userId, false);
    }
  } catch (err) {
    showConsoleError(err, 'GROUP-PARTICIPANTS-UPDATE');
    client.end(new Error('fatal_error'));
  }
}

async function isParticipantBlacklisted(client, botInfo, group, userId) {
  const groupController = new GroupController();
  const hostId = botInfo?.host_number ? jidNormalizedUser(botInfo.host_number) : undefined;

  // normaliza a blacklist (compat com registros antigos)
  const bl = Array.isArray(group.blacklist) ? group.blacklist.map(j => {
    try { return jidNormalizedUser(j); } catch { return j; }
  }) : [];

  const isUserBlacklisted = bl.includes(userId);
  const isBotAdmin = hostId ? await groupController.isParticipantAdmin(group.id, hostId) : false;

  if (isBotAdmin && isUserBlacklisted) {
    const replyText = buildText(botTexts.blacklist_ban_message, removeWhatsappSuffix(userId), botInfo.name);
    await removeParticipant(client, group.id, userId);
    await sendTextWithMentions(client, group.id, replyText, [userId], { expiration: group.expiration });
    return true;
  }
  return false;
}

async function isParticipantFake(client, botInfo, group, userId) {
  if (!group.antifake?.status) return false;

  const groupController = new GroupController();
  const hostId = botInfo?.host_number ? jidNormalizedUser(botInfo.host_number) : undefined;
  const isBotAdmin = hostId ? await groupController.isParticipantAdmin(group.id, hostId) : false;
  const isGroupAdmin = await groupController.isParticipantAdmin(group.id, userId);
  const isBotNumber = hostId && userId === hostId;

  if (!isBotAdmin) {
    await groupController.setAntiFake(group.id, false);
    return false;
  }

  const allowedPrefixes = group.antifake?.exceptions?.prefixes || [];
  const allowedNumbers  = group.antifake?.exceptions?.numbers  || [];

  const isAllowedPrefix = allowedPrefixes.some(prefix => userId.startsWith(prefix));
  const isAllowedNumber = allowedNumbers.some(num => {
    const jid = num.includes('@') ? num : addWhatsappSuffix(num); // seu helper
    try { return jidNormalizedUser(jid) === userId; } catch { return false; }
  });

  if (!isAllowedPrefix && !isAllowedNumber && !isBotNumber && !isGroupAdmin) {
    const replyText = buildText(botTexts.antifake_ban_message, removeWhatsappSuffix(userId), botInfo.name);
    await sendTextWithMentions(client, group.id, replyText, [userId], { expiration: group.expiration });
    await removeParticipant(client, group.id, userId);
    return true;
  }
  return false;
}

async function sendWelcome(client, group, botInfo, userId) {
  if (!group?.welcome?.status) return;
  const customMessage = group.welcome.msg ? group.welcome.msg + '\n\n' : '';
  const welcomeMessage = buildText(
    botTexts.group_welcome_message,
    removeWhatsappSuffix(userId),
    group.name,
    customMessage
  );
  await sendTextWithMentions(client, group.id, welcomeMessage, [userId], { expiration: group.expiration });
}
