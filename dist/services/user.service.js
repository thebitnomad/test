import DataStore from "@seald-io/nedb";
import moment from "moment";
import { deepMerge } from "../utils/general.util.js";
const db = new DataStore({ filename: './storage/users.db', autoload: true });
export class UserService {
    defaultUser = {
        id: '',
        name: '',
        commands: 0,
        receivedWelcome: false,
        owner: false,
        admin: false,
        command_rate: {
            limited: false,
            expire_limited: 0,
            cmds: 1,
            expire_cmds: Math.round(moment.now() / 1000) + 60
        }
    };
    async registerUser(userId, name) {
        const user = await this.getUser(userId);
        if (user || !userId.endsWith('@s.whatsapp.net'))
            return;
        const userData = {
            ...this.defaultUser,
            id: userId,
            name
        };
        await db.insertAsync(userData);
    }
    async migrateUsers() {
        const users = await this.getUsers();
        for (let user of users) {
            const oldUserData = user;
            const updatedUserData = deepMerge(this.defaultUser, oldUserData);
            await db.updateAsync({ id: user.id }, { $set: updatedUserData }, { upsert: true });
        }
    }
    async getUser(userId) {
        const user = await db.findOneAsync({ id: userId });
        return user;
    }
    async getUsers() {
        const users = await db.findAsync({});
        return users;
    }
    async setAdmin(userId, admin) {
        await db.updateAsync({ id: userId }, { $set: { admin } });
    }
    async getAdmins() {
        const admins = await db.findAsync({ admin: true });
        return admins;
    }
    async setOwner(userId) {
        await db.updateAsync({ id: userId }, { $set: { owner: true, admin: true } });
    }
    async getOwner() {
        const owner = await db.findOneAsync({ owner: true });
        return owner;
    }
    async setName(userId, name) {
        await db.updateAsync({ id: userId }, { $set: { name } });
    }
    async setReceivedWelcome(userId, status = true) {
        await db.updateAsync({ id: userId }, { $set: { receivedWelcome: status } });
    }
    async increaseUserCommandsCount(userId) {
        await db.updateAsync({ id: userId }, { $inc: { commands: 1 } });
    }
    async expireCommandsRate(userId, currentTimestamp) {
        const expireTimestamp = currentTimestamp + 60;
        await db.updateAsync({ id: userId }, { $set: { 'command_rate.expire_cmds': expireTimestamp, 'command_rate.cmds': 1 } });
    }
    async incrementCommandRate(userId) {
        await db.updateAsync({ id: userId }, { $inc: { "command_rate.cmds": 1 } });
    }
    async setLimitedUser(userId, isLimited, botInfo, currentTimestamp) {
        if (isLimited) {
            await db.updateAsync({ id: userId }, { $set: { 'command_rate.limited': isLimited, 'command_rate.expire_limited': currentTimestamp + botInfo.command_rate.block_time } });
        }
        else {
            await db.updateAsync({ id: userId }, { $set: { 'command_rate.limited': isLimited, 'command_rate.expire_limited': 0, 'command_rate.cmds': 1, 'command_rate.expire_cmds': currentTimestamp + 60 } });
        }
    }
}
