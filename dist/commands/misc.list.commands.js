import * as miscFunctions from './misc.functions.commands.js';
const miscCommands = {
    sorteio: {
        guide: `Ex: *{$p}sorteio* 100 - Sorteia um número aleatório de 1 a 100.\n`,
        msgs: {
            reply: `🎲 *Sorteio (Número)*: \n\n` +
                `O número sorteado foi *{$1}*`,
            error_invalid_value: 'O valor do número inserido é inválido, escolha um número maior que 1.'
        },
        function: miscFunctions.sorteioCommand
    },
    sorteiomembro: {
        guide: `Ex: *{$p}sorteiomembro* - Sorteia um membro aleatório do grupo.\n`,
        msgs: {
            reply: `🎲 *Sorteio (Membro)*: \n\n` +
                `O membro sorteado foi @{$1}`,
        },
        function: miscFunctions.sorteiomembroCommand
    },
    mascote: {
        guide: `Ex: *{$p}satoshi* - Exibe o inigualável e onipotente Satoshi Nakamoto\n`,
        msgs: {
            reply: 'Satoshi Nakamoto'
        },
        function: miscFunctions.mascoteCommand
    },
    /*
    simi: {
        guide: `Ex: *{$p}simi* frase  - Envia um texto para o SimSimi responder.\n`,
        msgs: {
            reply: `🐤 *SimSimi*: \n\n`+
            `{$1}: {$2}`,
        },
        function: miscFunctions.simiCommand
    },*/
    detector: {
        guide: `Ex: Responder com *{$p}detector* - Exibe o resultado da máquina da verdade.\n`,
        msgs: {
            wait: "⏳ Calibrando a máquina da verdade",
            error_message: "Houve um erro ao obter os dados da mensagem."
        },
        function: miscFunctions.detectorCommand
    },
    roletarussa: {
        guide: `Ex: *{$p}roletarussa* - Teste sua sorte na roleta russa.\n\n`,
        msgs: {
            reply_alive: '🔫 *Roleta russa*\n\n' +
                "😁 A arma não disparou, você sobreviveu a roleta russa.",
            reply_dead: '🔫 *Roleta russa*\n\n' +
                "💀 A arma disparou, você morreu.",
        },
        function: miscFunctions.roletarussaCommand
    },
    caracoroa: {
        guide: `Ex: *{$p}caracoroa* cara - Escolhe cara e joga a moeda.\n\n` +
            `Ex: *{$p}caracoroa* coroa - Escolhe coroa e joga a moeda.\n`,
        msgs: {
            wait: "🪙 Lançando a moeda ",
            reply_victory: "😁 *Vitória!*\n\n" +
                "O resultado caiu *{$1}*\n",
            reply_defeat: "😭 *Derrota!*\n\n" +
                "O resultado caiu *{$1}*\n"
        },
        function: miscFunctions.caracoroaCommand
    },
    ppt: {
        guide: `Ex: *{$p}ppt* pedra - Escolhe pedra, para jogar pedra, papel ou tesoura.\n\n` +
            `Ex: *{$p}ppt* papel - Escolhe papel, para jogar pedra, papel ou tesoura.\n\n` +
            `Ex: *{$p}ppt* tesoura - Escolhe tesoura, para jogar pedra, papel ou tesoura.\n`,
        msgs: {
            error: "[❗] Você deve escolher entre *pedra*, *papel*  ou *tesoura*",
            reply_victory: "😁 *Vitória!*\n\n" +
                "Você escolheu {$1} e o bot escolheu {$2}\n",
            reply_defeat: "😭 *Derrota!*\n\n" +
                "Você escolheu {$1} e o bot escolheu {$2}\n",
            reply_draw: "😐 *Empate!*\n\n" +
                "Você escolheu {$1} e o bot escolheu {$2}\n"
        },
        function: miscFunctions.pptCommand
    },
    top5: {
        guide: `Ex: *{$p}top5* tema - Exibe uma ranking de 5 membros aleatórios com o tema que você escolher.\n`,
        msgs: {
            error_members: "O grupo deve ter no mínimo 5 membros para usar este comando.",
            reply_title: "🏆 *TOP 5 {$1}*\n\n",
            reply_item: "{$1} {$2}° Lugar - @{$3}\n"
        },
        function: miscFunctions.top5Command
    },
    chance: {
        guide: `Ex: *{$p}chance ficar rico* - Calcula sua chance de um tema aleatório a sua escolha.\n`,
        msgs: {
            reply: "📊 *Chance*\n\n" +
                'Você tem *{$1}%* de chance de *{$2}*',
        },
        function: miscFunctions.chanceCommand
    }
};
export default miscCommands;
