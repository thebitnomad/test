import { BotService } from "../services/bot.service.js";
export class BotController {
    botService;
    constructor() {
        this.botService = new BotService();
    }
    startBot(hostNumber) {
        return this.botService.startBot(hostNumber);
    }
    migrateBot() {
        return this.botService.migrateBot();
    }
    getBot() {
        return this.botService.getBot();
    }
    setName(name) {
        return this.botService.setNameBot(name);
    }
    setPrefix(prefix) {
        return this.botService.setPrefix(prefix);
    }
    setDbMigrated(status) {
        return this.botService.setDbMigrated(status);
    }
    incrementExecutedCommands() {
        return this.botService.incrementExecutedCommands();
    }
    setAutosticker(status) {
        return this.botService.setAutosticker(status);
    }
    setAdminMode(status) {
        return this.botService.setAdminMode(status);
    }
    setCommandsPv(status) {
        return this.botService.setCommandsPv(status);
    }
    setCommandRate(status = true, maxCommandsMinute = 5, blockTime = 60) {
        return this.botService.setCommandRate(status, maxCommandsMinute, blockTime);
    }
    async setBlockedCommands(prefix, commands, operation) {
        return this.botService.setBlockedCommands(prefix, commands, operation);
    }
}
