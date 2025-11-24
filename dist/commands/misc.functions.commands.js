import { funnyRandomPhrases } from '../utils/misc.util.js';
import * as waUtil from '../utils/whatsapp.util.js';
import { buildText, messageErrorCommandUsage, uppercaseFirst } from "../utils/general.util.js";
import botTexts from "../helpers/bot.texts.helper.js";
import miscCommands from "./misc.list.commands.js";
import { GroupController } from "../controllers/group.controller.js";
import path from 'path';
export async function sorteioCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const chosenNumber = Number(message.text_command);
    if (!chosenNumber || chosenNumber <= 1) {
        throw new Error(miscCommands.sorteio.msgs.error_invalid_value);
    }
    const randomNumber = Math.floor(Math.random() * chosenNumber) + 1;
    const replyText = buildText(miscCommands.sorteio.msgs.reply, randomNumber);
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function sorteiomembroCommand(client, botInfo, message, group) {
    const groupController = new GroupController();
    if (!message.isGroupMsg || !group) {
        throw new Error(botTexts.permission.group);
    }
    const currentParticipantsIds = await groupController.getParticipantsIds(group.id);
    const randomParticipant = currentParticipantsIds[Math.floor(Math.random() * currentParticipantsIds.length)];
    const replyText = buildText(miscCommands.sorteiomembro.msgs.reply, waUtil.removeWhatsappSuffix(randomParticipant));
    await waUtil.replyWithMentions(client, message.chat_id, replyText, [randomParticipant], message.wa_message, { expiration: message.expiration });
}
export async function mascoteCommand(client, botInfo, message, group) {
    const imagePath = path.resolve('dist/media/mascote.png');
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', imagePath, 'WhatsApp Jr.', message.wa_message, { expiration: message.expiration });
}
/*
export async function simiCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const miscCommands = commandsMisc(botInfo)

    if (!message.args.length) throw new Error(messageErrorCommandUsage(botInfo.prefix, message))

    const simiResult = await miscLib.simSimi(message.text_command)
    const replyText = buildText(miscCommands.simi.msgs.reply, timestampToDate(Date.now()), simiResult)
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}*/
export async function detectorCommand(client, botInfo, message, group) {
    if (!message.isGroupMsg) {
        throw new Error(botTexts.permission.group);
    }
    else if (!message.isQuoted) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const quotedMessage = message.quotedMessage?.wa_message;
    if (!quotedMessage) {
        throw new Error(miscCommands.detector.msgs.error_message);
    }
    const imagePathCalibration = path.resolve('dist/media/calibrando.png');
    const imagePathsResult = [
        path.resolve('dist/media/estressealto.png'),
        path.resolve('dist/media/incerteza.png'),
        path.resolve('dist/media/kao.png'),
        path.resolve('dist/media/meengana.png'),
        path.resolve('dist/media/mentiroso.png'),
        path.resolve('dist/media/vaipra.png'),
        path.resolve('dist/media/verdade.png')
    ];
    const randomIndex = Math.floor(Math.random() * imagePathsResult.length);
    const waitReply = miscCommands.detector.msgs.wait;
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', imagePathCalibration, waitReply, quotedMessage, { expiration: message.expiration });
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', imagePathsResult[randomIndex], '', quotedMessage, { expiration: message.expiration });
}
export async function roletarussaCommand(client, botInfo, message, group) {
    const bulletPosition = Math.floor(Math.random() * 6) + 1;
    const currentPosition = Math.floor(Math.random() * 6) + 1;
    const hasShooted = (bulletPosition == currentPosition);
    let replyText;
    if (hasShooted) {
        replyText = miscCommands.roletarussa.msgs.reply_dead;
    }
    else {
        replyText = miscCommands.roletarussa.msgs.reply_alive;
    }
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function caracoroaCommand(client, botInfo, message, group) {
    const coinSides = ['cara', 'coroa'];
    const userChoice = message.text_command.toLowerCase();
    if (!message.args.length || !coinSides.includes(userChoice)) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const chosenSide = coinSides[Math.floor(Math.random() * coinSides.length)];
    const imagePath = chosenSide === 'cara' ? path.resolve('dist/media/cara.png') : path.resolve('dist/media/coroa.png');
    const waitText = miscCommands.caracoroa.msgs.wait;
    await waUtil.replyText(client, message.chat_id, waitText, message.wa_message, { expiration: message.expiration });
    const isUserVictory = chosenSide == userChoice;
    let replyText;
    if (isUserVictory) {
        replyText = buildText(miscCommands.caracoroa.msgs.reply_victory, uppercaseFirst(chosenSide));
    }
    else {
        replyText = buildText(miscCommands.caracoroa.msgs.reply_defeat, uppercaseFirst(chosenSide));
    }
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', imagePath, replyText, message.wa_message, { expiration: message.expiration });
}
export async function pptCommand(client, botInfo, message, group) {
    const validChoices = ["pedra", "papel", "tesoura"];
    const userChoice = message.text_command.toLocaleLowerCase();
    const randomIndex = Math.floor(Math.random() * validChoices.length);
    if (!message.args.length || !validChoices.includes(userChoice)) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    let botChoice = validChoices[randomIndex];
    let botIconChoice;
    let userIconChoice;
    let isUserVictory;
    if (botChoice == "pedra") {
        botIconChoice = "✊";
        if (userChoice == "pedra")
            userIconChoice = "✊";
        else if (userChoice == "tesoura")
            isUserVictory = false, userIconChoice = "✌️";
        else
            isUserVictory = true, userIconChoice = "✋";
    }
    else if (botChoice == "papel") {
        botIconChoice = "✋";
        if (userChoice == "pedra")
            isUserVictory = false, userIconChoice = "✊";
        else if (userChoice == "tesoura")
            isUserVictory = true, userIconChoice = "✌️";
        else
            userIconChoice = "✋";
    }
    else {
        botIconChoice = "✌️";
        if (userChoice == "pedra")
            isUserVictory = true, userIconChoice = "✊";
        else if (userChoice == "tesoura")
            userIconChoice = "✌️";
        else
            isUserVictory = false, userIconChoice = "✋";
    }
    let replyText;
    if (isUserVictory === true) {
        replyText = buildText(miscCommands.ppt.msgs.reply_victory, userIconChoice, botIconChoice);
    }
    else if (isUserVictory === false) {
        replyText = buildText(miscCommands.ppt.msgs.reply_defeat, userIconChoice, botIconChoice);
    }
    else {
        replyText = buildText(miscCommands.ppt.msgs.reply_draw, userIconChoice, botIconChoice);
    }
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, { expiration: message.expiration });
}
export async function top5Command(client, botInfo, message, group) {
    const groupController = new GroupController();
    if (!message.isGroupMsg || !group) {
        throw new Error(botTexts.permission.group);
    }
    else if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    let rankingTheme = message.text_command;
    let currentParticipantsIds = await groupController.getParticipantsIds(group.id);
    if (currentParticipantsIds.length < 5) {
        throw new Error(miscCommands.top5.msgs.error_members);
    }
    let replyText = buildText(miscCommands.top5.msgs.reply_title, rankingTheme);
    let mentionList = [];
    for (let i = 1; i <= 5; i++) {
        let icon;
        switch (i) {
            case 1:
                icon = '🥇';
                break;
            case 2:
                icon = '🥈';
                break;
            case 3:
                icon = '🥉';
                break;
            default:
                icon = '';
        }
        let randomIndex = Math.floor(Math.random() * currentParticipantsIds.length);
        let chosenParticipant = currentParticipantsIds[randomIndex];
        replyText += buildText(miscCommands.top5.msgs.reply_item, icon, i, waUtil.removeWhatsappSuffix(chosenParticipant));
        mentionList.push(chosenParticipant);
        currentParticipantsIds.splice(currentParticipantsIds.indexOf(chosenParticipant), 1);
    }
    await waUtil.sendTextWithMentions(client, message.chat_id, replyText, mentionList, { expiration: message.expiration });
}
export async function chanceCommand(client, botInfo, message, group) {
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message));
    }
    const randomNumber = Math.floor(Math.random() * 100);
    const replyText = buildText(miscCommands.chance.msgs.reply, randomNumber, message.text_command);
    const messageToReply = (message.isQuoted && message.quotedMessage) ? message.quotedMessage?.wa_message : message.wa_message;
    await waUtil.replyText(client, message.chat_id, replyText, messageToReply, { expiration: message.expiration });
}
