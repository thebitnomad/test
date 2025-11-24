// socket.js
import { makeWASocket, fetchLatestBaileysVersion } from 'baileys';
import NodeCache from 'node-cache';
import configSocket from './config.js';
import { BotController } from './controllers/bot.controller.js';
import { connectionClose, connectionOpen, connectionPairingCode, connectionQr } from './events/connection.event.js';
import { messageReceived } from './events/message-received.event.js';
import { addedOnGroup } from './events/group-added.event.js';
import { groupParticipantsUpdated } from './events/group-participants-updated.event.js';
import { partialGroupUpdate } from './events/group-partial-update.event.js';
import { syncGroupsOnStart } from './helpers/groups.sync.helper.js';
import { executeEventQueue, queueEvent } from './helpers/events.queue.helper.js';
import botTexts from './helpers/bot.texts.helper.js';
import { askQuestion, colorText } from './utils/general.util.js';
import { useNeDBAuthState } from './helpers/session.auth.helper.js';

// ===== caches ================================================================
const retryCache = new NodeCache();
const eventsCache = new NodeCache();
const messagesCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

// ===== estado global do socket ==============================================
let __currentClient = null;
let __connecting = false;        // evita múltiplos connects concorrentes
let __firstReadyResolved = false;

// ===== exports utilitários ==================================================
export function getCurrentClient() {
  return __currentClient;
}
export function isSocketOpen(sock = __currentClient) {
  return !!(sock?.ws && sock.ws.readyState === 'open');
}

// ============================================================================
// connect(): cria um novo socket e resolve com o client quando ficar "ready"
// - Garante que apenas 1 conexão seja criada por vez (__connecting).
// - Atualiza __currentClient SEMPRE que um novo socket for criado.
// - Na primeira vez que abrir, resolve a Promise para o app inicializar o resto.
//   Depois, em reconexões, consumidores devem usar getCurrentClient().
// ============================================================================
export default async function connect() {
  if (__connecting) {
    // já há um connect em andamento: aguarda ele terminar
    return new Promise((resolve) => {
      const int = setInterval(() => {
        if (!__connecting && __currentClient) {
          clearInterval(int);
          resolve(__currentClient);
        }
      }, 250);
    });
  }

  __connecting = true;

  const { state, saveCreds } = await useNeDBAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const client = makeWASocket(
    configSocket(state, retryCache, version, messagesCache)
  );

  // aponta o client atual para fora
  __currentClient = client;

  let connectionType = null;
  let isBotReady = false;
  eventsCache.set('events', []);

  let resolveReady;
  const readyPromise = new Promise((res) => (resolveReady = res));

  // listener principal de eventos
  client.ev.process(async (events) => {
    const botInfo = new BotController().getBot();

    // ----- estado de conexão -----
    if (events['connection.update']) {
      const connectionState = events['connection.update'];
      const { connection, qr, receivedPendingNotifications } = connectionState;
      let needReconnect = false;

      if (!receivedPendingNotifications) {
        if (qr) {
          if (!connectionType) {
            console.log(colorText(botTexts.not_connected, '#e0e031'));
            connectionType = await askQuestion(botTexts.input_connection_method);
            if (connectionType === '2') {
              connectionPairingCode(client);
            } else {
              connectionQr(qr);
            }
          } else if (connectionType !== '2') {
            connectionQr(qr);
          }
        } else if (connection === 'connecting') {
          console.log(colorText(botTexts.connecting));
        } else if (connection === 'close') {
          // conexão caiu: marca como não pronto e decide se reconecta
          isBotReady = false;
          needReconnect = await connectionClose(connectionState);
        }
      } else {
        // conexão aberta + notificações recebidas => "ready"
        try {
          await client.waitForSocketOpen();
        } catch {}
        connectionOpen(client);
        await syncGroupsOnStart(client);
        isBotReady = true;
        await executeEventQueue(client, eventsCache);
        console.log(colorText(botTexts.server_started));

        if (!__firstReadyResolved && resolveReady) {
          __firstReadyResolved = true;
          resolveReady(client);
          resolveReady = null;
        }
      }

      if (needReconnect) {
        // pequeno backoff para evitar tempestade de reconexões
        setTimeout(async () => {
          try {
            __connecting = false; // libera para o próximo connect
            await connect();      // cria novo socket e atualiza __currentClient
          } catch (e) {
            console.error('[socket] erro ao reconectar:', e);
          }
        }, 1500);
      }
    }

    // ----- credenciais -----
    if (events['creds.update']) {
      try {
        await saveCreds();
      } catch (e) {
        console.error('[socket] erro ao salvar credenciais:', e);
      }
    }

    // ----- mensagens -----
    if (events['messages.upsert']) {
      const message = events['messages.upsert'];
      if (isBotReady) {
        try {
          await messageReceived(client, message, botInfo, messagesCache);
        } catch (e) {
          console.error('[socket] erro em messageReceived:', e);
        }
      } else {
        // se quiser enfileirar mensagens pré-ready, adapte aqui
      }
    }

    // ----- participantes de grupo atualizados -----
    if (events['group-participants.update']) {
      const participantsUpdate = events['group-participants.update'];
      if (isBotReady) {
        try {
          await groupParticipantsUpdated(client, participantsUpdate, botInfo);
        } catch (e) {
          console.error('[socket] erro em groupParticipantsUpdated:', e);
        }
      } else {
        queueEvent(eventsCache, 'group-participants.update', participantsUpdate);
      }
    }

    // ----- novo grupo -----
    if (events['groups.upsert']) {
      const groups = events['groups.upsert'];
      if (isBotReady) {
        try {
          await addedOnGroup(client, groups, botInfo);
        } catch (e) {
          console.error('[socket] erro em addedOnGroup:', e);
        }
      } else {
        queueEvent(eventsCache, 'groups.upsert', groups);
      }
    }

    // ----- atualização parcial de grupo -----
    if (events['groups.update']) {
      const groups = events['groups.update'];
      if (groups.length === 1 && groups[0].participants === undefined) {
        if (isBotReady) {
          try {
            await partialGroupUpdate(groups[0]);
          } catch (e) {
            console.error('[socket] erro em partialGroupUpdate:', e);
          }
        } else {
          queueEvent(eventsCache, 'groups.update', groups);
        }
      }
    }
  });

  __connecting = false;
  return readyPromise;
}
