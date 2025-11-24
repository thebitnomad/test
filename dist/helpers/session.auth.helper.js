import DataStore from "@seald-io/nedb";
import { initAuthCreds, WAProto, BufferJSON } from "baileys";
const db = new DataStore({ filename: './storage/session.db', autoload: true });
export async function useNeDBAuthState() {
    const write = async (data, key) => {
        await db.updateAsync({ key }, { $set: { data: JSON.stringify(data, BufferJSON.replacer) } }, { upsert: true });
    };
    const read = async (key) => {
        const result = await db.findOneAsync({ key });
        return result ? JSON.parse(result.data, BufferJSON.reviver) : null;
    };
    const remove = async (key) => {
        await db.removeAsync({ key }, { multi: false });
    };
    const creds = await read("creds") || initAuthCreds();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await read(`${type}-${id}`);
                        if (type === "app-state-sync-key" && value) {
                            value = WAProto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? write(value, key) : remove(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await write(creds, "creds");
        }
    };
}
export async function cleanCreds() {
    await db.removeAsync({}, { multi: true });
}
