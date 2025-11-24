import { pino } from 'pino';
import { isJidBroadcast } from 'baileys';
import { getMessageFromCache } from './utils/whatsapp.util.js';
export default function configSocket(state, retryCache, version, messageCache) {
    const config = {
        auth: state,
        version,
        msgRetryCounterCache: retryCache,
        defaultQueryTimeoutMs: 45000,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        qrTimeout: undefined,
        logger: pino({ level: 'silent' }),
        shouldIgnoreJid: jid => isJidBroadcast(jid) || jid?.endsWith('@newsletter'),
        getMessage: async (key) => {
            const message = (key.id) ? getMessageFromCache(key.id, messageCache) : undefined;
            return message;
        }
    };
    return config;
}
