import { messageErrorCommand, showCommandConsole } from "../utils/general.util.js";
import { autoSticker } from "../commands/sticker.functions.commands.js";
import * as waUtil from "../utils/whatsapp.util.js";
import botTexts from "../helpers/bot.texts.helper.js";
import infoCommands from "../commands/info.list.commands.js";
import utilityCommands from "../commands/utility.list.commands.js";
import stickerCommands from "../commands/sticker.list.commands.js";
import downloadCommands from "../commands/download.list.commands.js";
import miscCommands from "../commands/misc.list.commands.js";
import groupCommands from "../commands/group.list.commands.js";
import adminCommands from "../commands/admin.list.commands.js";
import { getCommandCategory, getCommandGuide } from "../utils/commands.util.js";
export async function commandInvoker(client, botInfo, message, group) {
    const isGuide = (!message.args.length) ? false : message.args[0] === 'guia';
    const categoryCommand = getCommandCategory(botInfo.prefix, message.command);
    const commandName = waUtil.removePrefix(botInfo.prefix, message.command);
    try {
        if (isGuide) {
            return sendCommandGuide(client, botInfo.prefix, message);
        }
        switch (categoryCommand) {
            case 'info':
                //Categoria INFO
                if (Object.keys(infoCommands).includes(commandName)) {
                    const commands = infoCommands;
                    await commands[commandName].function(client, botInfo, message, group || undefined);
                    showCommandConsole(message.isGroupMsg, "INFO", message.command, "#8ac46e", message.t, message.pushname, group?.name);
                }
                break;
            case 'utility':
                //Categoria UTILIDADE
                if (Object.keys(utilityCommands).includes(commandName)) {
                    const commands = utilityCommands;
                    await commands[commandName].function(client, botInfo, message, group || undefined);
                    showCommandConsole(message.isGroupMsg, "UTILIDADE", message.command, "#de9a07", message.t, message.pushname, group?.name);
                }
                break;
            case 'sticker':
                //Categoria STICKER
                if (Object.keys(stickerCommands).includes(commandName)) {
                    const commands = stickerCommands;
                    await commands[commandName].function(client, botInfo, message, group || undefined);
                    showCommandConsole(message.isGroupMsg, "STICKER", message.command, "#ae45d1", message.t, message.pushname, group?.name);
                }
                break;
            case 'download':
                //Categoria DOWNLOAD
                if (Object.keys(downloadCommands).includes(commandName)) {
                    const commands = downloadCommands;
                    await commands[commandName].function(client, botInfo, message, group || undefined);
                    showCommandConsole(message.isGroupMsg, "DOWNLOAD", message.command, "#2195cf", message.t, message.pushname, group?.name);
                }
                break;
            case 'misc':
                //Categoria VARIADO
                if (Object.keys(miscCommands).includes(commandName)) {
                    const commands = miscCommands;
                    await commands[commandName].function(client, botInfo, message, group || undefined);
                    showCommandConsole(message.isGroupMsg, "VARIADO", message.command, "#22e3dd", message.t, message.pushname, group?.name);
                }
                break;
            case 'group':
                //Categoria GRUPO
                if (!message.isGroupMsg || !group) {
                    throw new Error(botTexts.permission.group);
                }
                else if (Object.keys(groupCommands).includes(commandName)) {
                    const commands = groupCommands;
                    await commands[commandName].function(client, botInfo, message, group);
                    showCommandConsole(message.isGroupMsg, "GRUPO", message.command, "#e0e031", message.t, message.pushname, group?.name);
                }
                break;
            case 'admin':
                //Categoria ADMIN
                if (!message.isBotAdmin) {
                    throw new Error(botTexts.permission.admin_bot_only);
                }
                else if (Object.keys(adminCommands).includes(commandName)) {
                    const commands = adminCommands;
                    await commands[commandName].function(client, botInfo, message, group || undefined);
                    showCommandConsole(message.isGroupMsg, "ADMINISTRAÇÃO", message.command, "#d1d1d1", message.t, message.pushname, group?.name);
                }
                break;
            default:
                //Outros - Autosticker
                if ((message.isGroupMsg && group?.autosticker) || (!message.isGroupMsg && botInfo.autosticker)) {
                    await autoSticker(client, botInfo, message, group || undefined);
                    showCommandConsole(message.isGroupMsg, "STICKER", "AUTO-STICKER", "#ae45d1", message.t, message.pushname, group?.name);
                }
                break;
        }
    }
    catch (err) {
        await waUtil.replyText(client, message.chat_id, messageErrorCommand(message.command, err.message), message.wa_message, { expiration: message.expiration });
    }
}
async function sendCommandGuide(client, prefix, message) {
    await waUtil.replyText(client, message.chat_id, getCommandGuide(prefix, message.command), message.wa_message, { expiration: message.expiration });
}
