import { removePrefix } from "../utils/whatsapp.util.js";
import DataStore from "@seald-io/nedb";
import { ParticipantService } from "./participant.service.js";
import { deepMerge } from "../utils/general.util.js";
const db = new DataStore({ filename: './storage/groups.db', autoload: true });
export class GroupService {
    participantService;
    defaultGroup = {
        id: '',
        name: '',
        description: undefined,
        commands_executed: 0,
        owner: undefined,
        restricted: false,
        expiration: undefined,
        muted: false,
        welcome: {
            status: false,
            msg: ''
        },
        antifake: {
            status: false,
            exceptions: {
                prefixes: ['55'],
                numbers: []
            }
        },
        antilink: {
            status: false,
            exceptions: []
        },
        antiflood: {
            status: false,
            max_messages: 10,
            interval: 10
        },
        auto_reply: {
            status: false,
            config: [],
        },
        autosticker: false,
        block_cmds: [],
        blacklist: [],
        word_filter: []
    };
    constructor() {
        this.participantService = new ParticipantService();
    }
    async registerGroup(groupMetadata) {
        const group = await this.getGroup(groupMetadata.id);
        if (group)
            return;
        const groupData = {
            ...this.defaultGroup,
            id: groupMetadata.id,
            name: groupMetadata.subject,
            description: groupMetadata.desc,
            owner: groupMetadata.owner,
            restricted: groupMetadata.announce,
            expiration: groupMetadata.ephemeralDuration
        };
        const newGroup = await db.insertAsync(groupData);
        for (let participant of groupMetadata.participants) {
            const isAdmin = (participant.admin) ? true : false;
            await this.participantService.addParticipant(groupMetadata.id, participant.id, isAdmin);
        }
        return newGroup;
    }
    async migrateGroups() {
        const groups = await this.getAllGroups();
        for (const group of groups) {
            const oldGroupData = group;
            const updatedGroupData = deepMerge(this.defaultGroup, oldGroupData);
            await db.updateAsync({ id: group.id }, { $set: updatedGroupData }, { upsert: true });
        }
    }
    async syncGroups(groupsMeta) {
        //Deletando grupos em que o bot não está mais
        const currentGroups = await this.getAllGroups();
        currentGroups.forEach(async (group) => {
            if (!groupsMeta.find(groupMeta => groupMeta.id == group.id)) {
                await this.removeGroup(group.id);
            }
        });
        //Atualizando grupos em que o bot está
        for (let groupMeta of groupsMeta) {
            const group = await this.getGroup(groupMeta.id);
            if (group) { // Se o grupo já estiver registrado sincronize os dados do grupo e os participantes.
                await db.updateAsync({ id: groupMeta.id }, { $set: {
                        name: groupMeta.subject,
                        description: groupMeta.desc,
                        owner: groupMeta.owner,
                        restricted: groupMeta.announce,
                        expiration: groupMeta.ephemeralDuration
                    } });
                await this.participantService.syncParticipants(groupMeta);
            }
            else { // Se o grupo não estiver registrado, faça o registro.
                await this.registerGroup(groupMeta);
            }
        }
    }
    async updatePartialGroup(group) {
        if (group.id) {
            if (group.desc)
                await this.setDescription(group.id, group.desc);
            else if (group.subject)
                await this.setName(group.id, group.subject);
            else if (group.announce)
                await this.setRestricted(group.id, group.announce);
            else if (group.ephemeralDuration)
                await this.setExpiration(group.id, group.ephemeralDuration);
        }
    }
    async getGroup(groupId) {
        const group = await db.findOneAsync({ id: groupId });
        return group;
    }
    async getAllGroups() {
        const groups = await db.findAsync({});
        return groups;
    }
    async removeGroup(groupId) {
        await this.participantService.removeParticipants(groupId);
        await db.removeAsync({ id: groupId }, { multi: true });
    }
    async setName(groupId, name) {
        await db.updateAsync({ id: groupId }, { $set: { name } });
    }
    async setRestricted(groupId, restricted) {
        await db.updateAsync({ id: groupId }, { $set: { restricted } });
    }
    async setExpiration(groupId, expiration) {
        await db.updateAsync({ id: groupId }, { $set: { expiration } });
    }
    async setDescription(groupId, description) {
        await db.updateAsync({ id: groupId }, { $set: { description } });
    }
    async incrementGroupCommands(groupId) {
        await db.updateAsync({ id: groupId }, { $inc: { commands_executed: 1 } });
    }
    async setWordFilter(groupId, word, operation) {
        if (operation == 'add') {
            await db.updateAsync({ id: groupId }, { $push: { word_filter: word } });
        }
        else {
            await db.updateAsync({ id: groupId }, { $pull: { word_filter: word } });
        }
    }
    async setWelcome(groupId, status, msg) {
        await db.updateAsync({ id: groupId }, { $set: { "welcome.status": status, "welcome.msg": msg } });
    }
    async setAutoReply(groupId, status) {
        await db.updateAsync({ id: groupId }, { $set: { "auto_reply.status": status } });
    }
    async setReplyConfig(groupId, word, reply, operation) {
        if (operation == 'add') {
            await db.updateAsync({ id: groupId }, { $push: { "auto_reply.config": { word, reply } } });
        }
        else {
            await db.updateAsync({ id: groupId }, { $pull: { "auto_reply.config": { word, reply } } });
        }
    }
    async setAntifake(groupId, status) {
        await db.updateAsync({ id: groupId }, { $set: { "antifake.status": status } });
    }
    async setFakePrefixException(groupId, numberPrefix, operation) {
        if (operation == 'add') {
            await db.updateAsync({ id: groupId }, { $push: { "antifake.exceptions.prefixes": numberPrefix } });
        }
        else {
            await db.updateAsync({ id: groupId }, { $pull: { "antifake.exceptions.prefixes": numberPrefix } });
        }
    }
    async setFakeNumberException(groupId, userNumber, operation) {
        if (operation == 'add') {
            await db.updateAsync({ id: groupId }, { $push: { "antifake.exceptions.numbers": userNumber } });
        }
        else {
            await db.updateAsync({ id: groupId }, { $pull: { "antifake.exceptions.numbers": userNumber } });
        }
    }
    async setMuted(groupId, status) {
        await db.updateAsync({ id: groupId }, { $set: { muted: status } });
    }
    async setAntilink(groupId, status) {
        await db.updateAsync({ id: groupId }, { $set: { 'antilink.status': status } });
    }
    async setLinkException(groupId, exception, operation) {
        if (operation == 'add') {
            await db.updateAsync({ id: groupId }, { $push: { "antilink.exceptions": exception } });
        }
        else {
            await db.updateAsync({ id: groupId }, { $pull: { "antilink.exceptions": exception } });
        }
    }
    async setAutosticker(groupId, status) {
        await db.updateAsync({ id: groupId }, { $set: { autosticker: status } });
    }
    async setAntiFlood(groupId, status, maxMessages, interval) {
        await db.updateAsync({ id: groupId }, { $set: { 'antiflood.status': status, 'antiflood.max_messages': maxMessages, 'antiflood.interval': interval } });
    }
    async setBlacklist(groupId, userId, operation) {
        if (operation == 'add') {
            await db.updateAsync({ id: groupId }, { $push: { blacklist: userId } });
        }
        else {
            await db.updateAsync({ id: groupId }, { $pull: { blacklist: userId } });
        }
    }
    async setBlockedCommands(groupId, prefix, commands, operation) {
        const group = await this.getGroup(groupId);
        const commandsWithoutPrefix = commands.map(command => removePrefix(prefix, command));
        if (operation == 'add') {
            const blockCommands = commandsWithoutPrefix.filter(command => !group?.block_cmds.includes(command));
            await db.updateAsync({ id: groupId }, { $push: { block_cmds: { $each: blockCommands } } });
            return blockCommands.map(command => prefix + command);
        }
        else {
            const unblockCommands = commandsWithoutPrefix.filter(command => group?.block_cmds.includes(command));
            await db.updateAsync({ id: groupId }, { $pull: { block_cmds: { $in: unblockCommands } } });
            return unblockCommands.map(command => prefix + command);
        }
    }
}
