// message-received.event.js
import { jidNormalizedUser } from 'baileys'; // ou '@whiskeysockets/baileys'
import { showConsoleError /*, colorText */ } from '../utils/general.util.js';
import { UserController } from '../controllers/user.controller.js';
import { GroupController } from '../controllers/group.controller.js';
import { handleGroupMessage, handlePrivateMessage } from '../helpers/message.handler.helper.js';
import { storeMessageOnCache, formatWAMessage } from '../utils/whatsapp.util.js';
import { commandInvoker } from '../helpers/command.invoker.helper.js';

export async function messageReceived(client, messages, botInfo, messageCache) {
  try {
    const list = messages?.messages || [];
    if (!Array.isArray(list) || list.length === 0) return;

    // 1) POPULA cache com TODAS as mensagens do lote (não só fromMe)
    try {
      for (const m of list) {
        if (m?.key?.id) storeMessageOnCache(m, messageCache);
      }
    } catch (e) {
      // console.warn('[messages.cache] falhou ao popular cache:', e?.message || e);
    }

    // trabalharemos apenas com a primeira (notify costuma vir uma por vez)
    const first = list[0];

    // 2) Normaliza IDs de host e chat
    const hostIdRaw = botInfo?.host_number || botInfo?.host_jid || botInfo?.hostId;
    const hostId = hostIdRaw ? jidNormalizedUser(hostIdRaw) : undefined;

    const chatIdRaw = first?.key?.remoteJid;
    const chatId = chatIdRaw ? jidNormalizedUser(chatIdRaw) : undefined;
    const isGroupMsg = !!chatId && chatId.endsWith('@g.us');

    switch (messages.type) {
      case 'notify': {
        const userController = new UserController();
        const groupController = new GroupController();

        // 3) Busca metadados do grupo (se for grupo)
        const group = (isGroupMsg && chatId) ? await groupController.getGroup(chatId) : null;

        // 4) Formata mensagem já com JIDs normalizados (sender/chat_id/etc.)
        const message = await formatWAMessage(first, group, hostId);
        if (!message) return;

        // (Opcional) debug rápido:
        // console.log('[DEBUG message]', {
        //   sender: message.sender,      // deve terminar com @s.whatsapp.net
        //   chat: message.chat_id,       // deve terminar com @g.us em grupo
        //   isGroupMsg: message.isGroupMsg,
        //   cmd: message.command
        // });

        // 5) Garante cadastro/atualização do usuário pelo JID normalizado
        try {
          await userController.registerUser(message.sender, message.pushname || '');
        } catch (e) {
          // não bloqueia o fluxo de comando por falha de registro
          // console.warn('[users.register] falhou:', e?.message || e);
        }

        // 6) Roteia para privado ou grupo
        if (!isGroupMsg) {
          const needCallCommand = await handlePrivateMessage(client, botInfo, message);
          if (needCallCommand) {
            await commandInvoker(client, botInfo, message, null);
          }
        } else if (group) {
          const needCallCommand = await handleGroupMessage(client, group, botInfo, message);
          if (needCallCommand) {
            await commandInvoker(client, botInfo, message, group);
          }
        }
        break;
      }
    }
  } catch (err) {
    showConsoleError(err, 'MESSAGES.UPSERT');
  }
}
