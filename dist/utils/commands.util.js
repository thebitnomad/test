import infoCommands from "../commands/info.list.commands.js";
import utilityCommands from "../commands/utility.list.commands.js";
import miscCommands from "../commands/misc.list.commands.js";
import groupCommands from "../commands/group.list.commands.js";
import adminCommands from "../commands/admin.list.commands.js";
import stickerCommands from "../commands/sticker.list.commands.js";
import downloadCommands from "../commands/download.list.commands.js";
import botTexts from "../helpers/bot.texts.helper.js";
import { removePrefix } from "./whatsapp.util.js";
import { buildText } from "./general.util.js";
const COMMAND_CATEGORIES = ['info', 'utility', 'download', 'sticker', 'misc', 'group', 'admin'];
export function commandExist(prefix, command, category) {
    if (!category) {
        return getCommands(prefix).includes(command);
    }
    else {
        return getCommandsByCategory(prefix, category).includes(command);
    }
}
export function getCommands(prefix) {
    const commands = [
        ...Object.keys(utilityCommands),
        ...Object.keys(miscCommands),
        ...Object.keys(infoCommands),
        ...Object.keys(groupCommands),
        ...Object.keys(adminCommands),
        ...Object.keys(stickerCommands),
        ...Object.keys(downloadCommands),
    ].map(command => prefix + command);
    return commands;
}
export function getCommandsByCategory(prefix, category) {
    switch (category) {
        case 'info':
            return Object.keys(infoCommands).map(command => prefix + command);
        case 'utility':
            return Object.keys(utilityCommands).map(command => prefix + command);
        case 'download':
            return Object.keys(downloadCommands).map(command => prefix + command);
        case 'sticker':
            return Object.keys(stickerCommands).map(command => prefix + command);
        case 'misc':
            return Object.keys(miscCommands).map(command => prefix + command);
        case 'group':
            return Object.keys(groupCommands).map(command => prefix + command);
        case 'admin':
            return Object.keys(adminCommands).map(command => prefix + command);
    }
}
export function getCommandCategory(prefix, command) {
    let foundCategory = null;
    const categories = COMMAND_CATEGORIES;
    for (let category of categories) {
        if (getCommandsByCategory(prefix, category).includes(command)) {
            foundCategory = category;
        }
    }
    return foundCategory;
}
export function getCommandGuide(prefix, command) {
    const commandCategory = getCommandCategory(prefix, command);
    const { guide_header_text, no_guide_found } = botTexts;
    let guide_text;
    switch (commandCategory) {
        case 'info':
            const info = infoCommands;
            guide_text = guide_header_text + info[removePrefix(prefix, command)].guide;
            break;
        case 'utility':
            const utility = utilityCommands;
            guide_text = guide_header_text + utility[removePrefix(prefix, command)].guide;
            break;
        case 'download':
            const download = downloadCommands;
            guide_text = guide_header_text + download[removePrefix(prefix, command)].guide;
            break;
        case 'sticker':
            const sticker = stickerCommands;
            guide_text = guide_header_text + sticker[removePrefix(prefix, command)].guide;
            break;
        case 'misc':
            const misc = miscCommands;
            guide_text = guide_header_text + misc[removePrefix(prefix, command)].guide;
            break;
        case 'group':
            const group = groupCommands;
            guide_text = guide_header_text + group[removePrefix(prefix, command)].guide;
            break;
        case 'admin':
            const admin = adminCommands;
            guide_text = guide_header_text + admin[removePrefix(prefix, command)].guide;
            break;
        default:
            guide_text = no_guide_found;
    }
    return buildText(guide_text);
}
