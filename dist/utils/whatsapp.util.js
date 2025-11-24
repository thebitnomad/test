import { S_WHATSAPP_NET, generateWAMessageFromContent, getContentType, jidNormalizedUser } from "baileys";
import { randomDelay } from "./general.util.js";
import * as convertLibrary from './convert.util.js';
import { removeBold } from "./general.util.js";
import { GroupController } from "../controllers/group.controller.js";
import { UserController } from "../controllers/user.controller.js";

function getAuthorJid(m, hostId) {
  const raw = m.key.fromMe ? hostId : (m.key.participant || m.key.remoteJid);
  return jidNormalizedUser(raw);
}
async function updatePresence(client, chatId, presence) {
    await client.presenceSubscribe(chatId);
    await randomDelay(200, 400);
    await client.sendPresenceUpdate(presence, chatId);
    await randomDelay(300, 1000);
    await client.sendPresenceUpdate('paused', chatId);
}
export function addWhatsappSuffix(userNumber) {
    const userId = userNumber.replace(/\W+/g, "") + S_WHATSAPP_NET;
    return userId;
}
export function removeWhatsappSuffix(userId) {
    const userNumber = userId.replace(S_WHATSAPP_NET, '');
    return userNumber;
}
export function removePrefix(prefix, command) {
    const commandWithoutPrefix = command.replace(prefix, '');
    return commandWithoutPrefix;
}
export function ensureMessageParticipant(message, sender, remoteJid) {
    if (!message || typeof message !== 'object') {
        return message;
    }
    const normalizedSender = sender ? jidNormalizedUser(sender) : undefined;
    const messageKey = message.key || (message.key = {});
    const keyRemoteJid = messageKey.remoteJid || remoteJid;
    const isGroupMessage = keyRemoteJid?.endsWith('@g.us');
    if (isGroupMessage) {
        if (normalizedSender && !messageKey.participant) {
            messageKey.participant = normalizedSender;
        }
        if (remoteJid && !messageKey.remoteJid) {
            messageKey.remoteJid = remoteJid;
        }
    }
    return message;
}
export function getGroupParticipantsByMetadata(group) {
    const { participants } = group;
    let groupParticipants = [];
    participants.forEach((participant) => {
        groupParticipants.push(participant.id);
    });
    return groupParticipants;
}
export function getGroupAdminsByMetadata(group) {
    const { participants } = group;
    const admins = participants.filter(user => (user.admin != null));
    let groupAdmins = [];
    admins.forEach((admin) => {
        groupAdmins.push(admin.id);
    });
    return groupAdmins;
}
export function deleteMessage(client, message, deleteQuoted) {
    let deletedMessage;
    let chatId = message.key.remoteJid;
    if (!chatId)
        return;
    if (deleteQuoted) {
        deletedMessage = {
            remoteJid: message.key.remoteJid,
            fromMe: message.key.participant === message?.message?.extendedTextMessage?.contextInfo?.participant,
            id: message.message?.extendedTextMessage?.contextInfo?.stanzaId,
            participant: message?.message?.extendedTextMessage?.contextInfo?.participant
        };
    }
    else {
        deletedMessage = message.key;
    }
    return client.sendMessage(chatId, { delete: deletedMessage });
}
export function readMessage(client, chatId, sender, messageId) {
    return client.sendReceipt(chatId, sender, [messageId], 'read');
}
export function updateProfilePic(client, chatId, image) {
    return client.updateProfilePicture(chatId, image);
}
export function updateProfileStatus(client, text) {
    return client.updateProfileStatus(text);
}
export function shutdownBot(client) {
    return client.end(new Error("admin_command"));
}
export function getProfilePicUrl(client, chatId) {
    return client.profilePictureUrl(chatId, "image");
}
export function blockContact(client, userId) {
    return client.updateBlockStatus(userId, "block");
}
export function unblockContact(client, userId) {
    return client.updateBlockStatus(userId, "unblock");
}
export function getHostNumber(client) {
    let id = client.user?.id.replace(/:[0-9]+/ism, '');
    return id || '';
}
export function getBlockedContacts(client) {
    return client.fetchBlocklist();
}
export async function sendText(client, chatId, text, options) {
    await updatePresence(client, chatId, "composing");
    return client.sendMessage(chatId, { text, linkPreview: null }, { ephemeralExpiration: options?.expiration });
}
export function sendLinkWithPreview(client, chatId, text, options) {
    return client.sendMessage(chatId, { text }, { ephemeralExpiration: options?.expiration });
}
export async function sendTextWithMentions(client, chatId, text, mentions, options) {
    await updatePresence(client, chatId, "composing");
    return client.sendMessage(chatId, { text, mentions }, { ephemeralExpiration: options?.expiration });
}
export function sendSticker(client, chatId, sticker, options) {
    return client.sendMessage(chatId, { sticker }, { ephemeralExpiration: options?.expiration });
}
export async function sendFileFromUrl(client, chatId, type, url, caption, options) {
    if (type === "imageMessage") {
        return client.sendMessage(chatId, { image: { url }, caption }, { ephemeralExpiration: options?.expiration });
    }
    else if (type === 'videoMessage') {
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('url', url);
        return client.sendMessage(chatId, { video: { url }, mimetype: options?.mimetype, caption, jpegThumbnail: base64Thumb }, { ephemeralExpiration: options?.expiration });
    }
    else if (type === 'audioMessage') {
        return client.sendMessage(chatId, { audio: { url }, mimetype: options?.mimetype }, { ephemeralExpiration: options?.expiration });
    }
}
export async function replyText(client, chatId, text, quoted, options) {
    await updatePresence(client, chatId, "composing");
    return client.sendMessage(chatId, { text, linkPreview: null }, { quoted, ephemeralExpiration: options?.expiration });
}
export async function replyFile(client, chatId, type, url, caption, quoted, options) {
    if (type == "imageMessage") {
        return client.sendMessage(chatId, { image: { url }, caption }, { quoted, ephemeralExpiration: options?.expiration });
    }
    else if (type == "videoMessage") {
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('file', url);
        return client.sendMessage(chatId, { video: { url }, mimetype: options?.mimetype, caption, jpegThumbnail: base64Thumb }, { quoted, ephemeralExpiration: options?.expiration });
    }
    else if (type == "audioMessage") {
        return client.sendMessage(chatId, { audio: { url }, mimetype: options?.mimetype }, { quoted, ephemeralExpiration: options?.expiration });
    }
}
export async function replyFileFromUrl(client, chatId, type, url, caption, quoted, options) {
    if (type == "imageMessage") {
        return client.sendMessage(chatId, { image: { url }, caption }, { quoted, ephemeralExpiration: options?.expiration });
    }
    else if (type == "videoMessage") {
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('url', url);
        return client.sendMessage(chatId, { video: { url }, mimetype: options?.mimetype, caption, jpegThumbnail: base64Thumb }, { quoted, ephemeralExpiration: options?.expiration });
    }
    else if (type == "audioMessage") {
        return client.sendMessage(chatId, { audio: { url }, mimetype: options?.mimetype }, { quoted, ephemeralExpiration: options?.expiration });
    }
}
export async function replyFileFromBuffer(client, chatId, type, buffer, caption, quoted, options) {
    if (type == "videoMessage") {
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('buffer', buffer);
        return client.sendMessage(chatId, { video: buffer, caption, mimetype: options?.mimetype, jpegThumbnail: base64Thumb }, { quoted, ephemeralExpiration: options?.expiration });
    }
    else if (type == "imageMessage") {
        return client.sendMessage(chatId, { image: buffer, caption }, { quoted, ephemeralExpiration: options?.expiration });
    }
    else if (type == "audioMessage") {
        return client.sendMessage(chatId, { audio: buffer, mimetype: options?.mimetype }, { quoted, ephemeralExpiration: options?.expiration });
    }
}
export async function replyWithMentions(client, chatId, text, mentions, quoted, options) {
    await updatePresence(client, chatId, "composing");
    return client.sendMessage(chatId, { text, mentions }, { quoted, ephemeralExpiration: options?.expiration });
}
export function joinGroupInviteLink(client, linkGroup) {
    return client.groupAcceptInvite(linkGroup);
}
export function revokeGroupInvite(client, groupId) {
    return client.groupRevokeInvite(groupId);
}
export async function getGroupInviteLink(client, groupId) {
    let inviteCode = await client.groupInviteCode(groupId);
    return inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : undefined;
}
export function leaveGroup(client, groupId) {
    return client.groupLeave(groupId);
}
export function getGroupInviteInfo(client, linkGroup) {
    return client.groupGetInviteInfo(linkGroup);
}
export function updateGroupRestriction(client, groupId, status) {
    let config = status ? "announcement" : "not_announcement";
    return client.groupSettingUpdate(groupId, config);
}
export async function getAllGroups(client) {
    let groups = await client.groupFetchAllParticipating();
    let groupsInfo = [];
    for (let [key, value] of Object.entries(groups)) {
        groupsInfo.push(value);
    }
    return groupsInfo;
}
export async function removeParticipant(client, groupId, participant) {
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "remove");
    return response;
}
export async function addParticipant(client, groupId, participant) {
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "add");
    return response;
}
export async function promoteParticipant(client, groupId, participant) {
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "promote");
    return response;
}
export async function demoteParticipant(client, groupId, participant) {
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "demote");
    return response;
}
export function storeMessageOnCache(message, messageCache) {
    if (message.key.remoteJid && message.key.id && message.message) {
        messageCache.set(message.key.id, message.message);
    }
}
export function getMessageFromCache(messageId, messageCache) {
    let message = messageCache.get(messageId);
    return message;
}
const ALLOWED_TYPES = new Set([
  'conversation',
  'extendedTextMessage',
  'audioMessage',
  'imageMessage',
  'documentMessage',
  'stickerMessage',
  'videoMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension'
]);

export async function formatWAMessage(m, group, hostId) {
  if (!m?.message) return;

  const type = getContentType(m.message);
  if (!type || !ALLOWED_TYPES.has(type) || !m.message[type]) return;

  const groupController = new GroupController();
  const userController  = new UserController();

  // Normaliza hostId (id do bot) pois pode vir com @lid
  const hostIdNorm = hostId ? jidNormalizedUser(hostId) : undefined;

  // Admins do bot normalizados para comparação correta
  const botAdminsRaw = await userController.getAdmins(); // [{ id, owner, ... }]
  const botAdmins = botAdminsRaw.map(a => ({ ...a, id: jidNormalizedUser(a.id) }));

  const node = m.message[type];
  const ctx  = (typeof node !== 'string' && node && 'contextInfo' in node) ? node.contextInfo : undefined;

  const isQuoted = !!ctx?.quotedMessage;

  // Em grupo: autor está em participant; em DM: remoteJid
  const rawSender = m.key.fromMe ? hostIdNorm : (m.key.participant || m.key.remoteJid);
  const sender    = rawSender ? jidNormalizedUser(rawSender) : undefined;       // => ...@s.whatsapp.net

  const pushName = m.pushName || '';
  const body     = m.message.conversation || m.message.extendedTextMessage?.text || undefined;
  const caption  = (typeof node !== 'string' && node && 'caption' in node) ? node.caption : undefined;

  const text = (caption || body || '').trim();
  const [command, ...args] = text.length ? text.split(' ') : [''];

  const chat_id_raw = m.key.remoteJid;
  const chat_id     = chat_id_raw ? jidNormalizedUser(chat_id_raw) : undefined; // grupo normaliza p/ ...@g.us
  const isGroupMsg  = chat_id?.endsWith('@g.us') ?? false;

  const message_id = m.key.id;
  const t          = m.messageTimestamp;

  // Admin do grupo: compara com sender normalizado
  const isGroupAdmin = (sender && group)
    ? await groupController.isParticipantAdmin(group.id, sender)
    : false;

  if (!message_id || !t || !sender || !chat_id) return;

  // Mentions normalizadas
  const mentioned = Array.isArray(ctx?.mentionedJid)
    ? ctx.mentionedJid.map(j => jidNormalizedUser(j)).filter(Boolean)
    : [];

  const formattedMessage = {
    message_id,
    sender,                            // ...@s.whatsapp.net
    type,
    t,
    chat_id,                           // ...@g.us para grupos
    expiration: ctx?.expiration || undefined,
    pushname: pushName,
    body: body || '',
    caption: caption || '',
    mentioned,
    text_command: args.join(' ').trim(),
    command: removeBold((command || '').toLowerCase().trim()),
    args,
    isQuoted,
    isGroupMsg,
    isGroupAdmin,
    isBotAdmin: botAdmins.some(a => a.id === sender),
    isBotOwner: botAdmins.find(a => a.owner === true)?.id === sender,
    isBotMessage: !!m.key.fromMe,
    isBroadcast: chat_id === 'status@broadcast',
    isMedia: type !== 'conversation' && type !== 'extendedTextMessage',
    wa_message: m,
  };

  // ---- mídia da mensagem principal (sem descartar se faltar algum campo) ----
  if (formattedMessage.isMedia) {
    const mimetype    = (typeof node !== 'string' && node && 'mimetype'   in node) ? node.mimetype   : undefined;
    const url         = (typeof node !== 'string' && node && 'url'        in node) ? node.url        : undefined;
    const seconds     = (typeof node !== 'string' && node && 'seconds'    in node) ? node.seconds    : undefined;
    const file_length = (typeof node !== 'string' && node && 'fileLength' in node) ? node.fileLength : undefined;

    formattedMessage.media = {
      mimetype,
      url,
      seconds: seconds ?? undefined,
      file_length
    };
  }

  // ---- mensagem citada ----
  if (isQuoted) {
    const quotedMessage = ctx?.quotedMessage;
    if (quotedMessage) {
      const typeQuoted     = getContentType(quotedMessage);
      const quotedStanzaId = ctx?.stanzaId ?? undefined;

      const rawSenderQuoted = ctx?.participant || ctx?.remoteJid;
      const senderQuoted    = rawSenderQuoted ? jidNormalizedUser(rawSenderQuoted) : undefined;

      if (typeQuoted && senderQuoted) {
        const nodeQuoted    = quotedMessage[typeQuoted];
        const captionQuoted = (typeof nodeQuoted !== 'string' && nodeQuoted && 'caption' in nodeQuoted)
          ? nodeQuoted.caption
          : undefined;

        const quotedWAMessage = generateWAMessageFromContent(
          chat_id,
          quotedMessage,
          { userJid: senderQuoted, messageId: quotedStanzaId }
        );
        quotedWAMessage.key.fromMe = (hostIdNorm && hostIdNorm === senderQuoted);
        if (isGroupMsg && senderQuoted) {
          quotedWAMessage.key.participant = senderQuoted;
        }

        const bodyQuoted = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';

        formattedMessage.quotedMessage = {
          type: typeQuoted,
          sender: senderQuoted,         // normalizado
          body: bodyQuoted,
          caption: captionQuoted || '',
          isMedia: typeQuoted !== 'conversation' && typeQuoted !== 'extendedTextMessage',
          wa_message: quotedWAMessage,
        };

        if (formattedMessage.quotedMessage.isMedia) {
          const urlQuoted        = (typeof nodeQuoted !== 'string' && nodeQuoted && 'url'        in nodeQuoted) ? nodeQuoted.url        : undefined;
          const mimetypeQuoted   = (typeof nodeQuoted !== 'string' && nodeQuoted && 'mimetype'   in nodeQuoted) ? nodeQuoted.mimetype   : undefined;
          const fileLengthQuoted = (typeof nodeQuoted !== 'string' && nodeQuoted && 'fileLength' in nodeQuoted) ? nodeQuoted.fileLength : undefined;
          const secondsQuoted    = (typeof nodeQuoted !== 'string' && nodeQuoted && 'seconds'    in nodeQuoted) ? nodeQuoted.seconds    : undefined;

          formattedMessage.quotedMessage.media = {
            url: urlQuoted,
            mimetype: mimetypeQuoted,
            file_length: fileLengthQuoted,
            seconds: secondsQuoted ?? undefined,
          };
        }
      }
    }
  }

  return formattedMessage;
}