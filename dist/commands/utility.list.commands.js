import * as utilityFunctions from './utility.functions.commands.js';
const utilityCommands = {
    ouvir: {
        guide: `Ex: Responda um áudio com *{$p}ouvir* para transformar em texto.\n`,
        msgs: {
            error_audio_limit: "Houve um erro na transcrição, o áudio ultrapassa *1m30s*",
            reply: "🔤 *Transcrição de áudio*\n\n" +
                "*Texto*: {$1}"
        },
        function: utilityFunctions.ouvirCommand
    },
    polymarket: {
    guide: 'Sentimento do Polymarket:\n• *{$p}polymarket <ticker>*\nEx.: *{$p}polymarket btc*, *{$p}polymarket sol*',
    msgs: { error_generic: 'Não foi possível obter o sentimento do Polymarket.' },
    function: utilityFunctions.polymarketExplicitCommand, // <-- referência de função
  },
    qualmusica: {
        guide: `Ex: Envie/responda um audio/video com *{$p}qualmusica* - Procura a música tocada no audio/video.\n\n` +
            `*Obs*: Este comando funciona apenas com *AUDIO/VIDEO*.\n`,
        msgs: {
            error_message: "Houve um erro ao obter os dados da mensagem.",
            wait: "⏳ Em andamento , estou procurando sua música.",
            reply: "💿 *Reconhecimento de música*\n\n" +
                "*Título*: {$1}\n" +
                "*Produtora*: {$2}\n" +
                "*Duração*: {$3}\n" +
                "*Lançamento*: {$4}\n" +
                "*Album*: {$5}\n" +
                "*Artistas*: {$6}\n",
            error_not_found: 'Nenhuma música compatível foi encontrada'
        },
        function: utilityFunctions.qualmusicaCommand
    },
    steamverde: {
        guide: `Ex: *{$p}steamverde GTA* - Exibe os downloads disponíveis do jogo GTA.\n`,
        msgs: {
            reply_title: '🏴‍☠️ *STEAM VERDE*\n\n',
            reply_item: '*{$1}*\n' +
                '- *Enviado por*: {$2}\n' +
                '- *Data do envio*: {$3}\n' +
                '{$4}' +
                '- *Tamanho*: {$5}\n\n',
            link_torrent: '- *Torrent*: {$1}\n',
            link_direct: '- *Link direto*: {$1}\n',
            error_not_found: 'Nenhum jogo foi encontrado, tente pesquisar novamente com outros termos.'
        },
        function: utilityFunctions.steamverdeCommand
    },
    animes: {
        guide: `Ex: *{$p}animes* - Exibe os ultimos lançamentos de episódios de anime.\n`,
        msgs: {
            reply_title: '🇯🇵 *Lançamento de animes*\n\n',
            reply_item: '*{$1}*\n' +
                '- *Episódio*: {$2} \n' +
                '- *Link*: {$3} \n\n'
        },
        function: utilityFunctions.animesCommand
    },
    mangas: {
        guide: `Ex: *{$p}mangas* - Exibe os ultimos lançamentos de capitulos de mangá.\n`,
        msgs: {
            reply_title: '🇯🇵 *Lançamento de mangás*\n\n',
            reply_item: '*{$1}*\n' +
                '- *Capítulo*: {$2} \n' +
                '- *Link*: {$3} \n\n',
        },
        function: utilityFunctions.mangasCommand
    },
    brasileirao: {
        guide: `Ex: *{$p}brasileirao* - Exibe a tabela e a rodada atual do Brasileirão Serie A.\n` +
            `Ex: *{$p}brasileirao* B - Exibe a tabela e a rodada atual do Brasileirão Serie B.\n`,
        msgs: {
            error: '[❗] A série digitada não é suportada, atualmente são suportados apenas A e B.',
            error_rounds_not_found: 'Não foram encontradas rodadas para este campeonato',
            reply_title: '⚽ *Brasileirão série {$1}*\n\n',
            reply_table_title: '🗒️ *Tabela*:\n\n',
            reply_table_item: '- {$1}° {$2} - P:{$3} J:{$4} V:{$5}\n',
            reply_round_title: '\n📆 *Rodada Atual*:\n\n',
            reply_match_item: '- Partida: {$1} x {$2}\n' +
                '- Data: {$3}\n' +
                '- Local: {$4}\n' +
                '- Resultado: {$5}\n\n'
        },
        function: utilityFunctions.brasileiraoCommand
    },
    encurtar: {
        guide: `Ex: *{$p}encurtar* link - Encurta o link digitado.\n`,
        msgs: {
            reply: "✂️ *Encurtador de link*\n\n" +
                "*Link*: {$1}\n",
            error: "Não foi possível encurtar este link, tente novamente com outro."
        },
        function: utilityFunctions.encurtarCommand
    },
    upimg: {
        guide: `Ex: Envie/responda uma *imagem* com *{$p}upimg* - Faz upload da imagem e retorna o link.\n`,
        msgs: {
            reply: "🖼️ *Upload de imagem*\n\n" +
                "*Link*: {$1}\n"
        },
        function: utilityFunctions.upimgCommand
    },
    filmes: {
        guide: `Ex: *{$p}filmes* - Exibe as tendências atuais de filmes.\n`,
        msgs: {
            reply: "🎬 *Têndencias de filmes*\n\n" +
                "{$1}\n"
        },
        function: utilityFunctions.filmesCommand
    },
    series: {
        guide: `Ex: *{$p}series* - Exibe as tendências atuais de séries.\n`,
        msgs: {
            reply: "📺 *Têndencias de séries*\n\n" +
                "{$1}\n"
        },
        function: utilityFunctions.seriesCommand
    },
    tabela: {
        guide: `Ex: *{$p}tabela* - Exibe a tabela de caracteres para criação de nicks.\n`,
        msgs: {
            reply: "🔠 *Tabela de caracteres*\n\n" +
                "{$1}"
        },
        function: utilityFunctions.tabelaCommand
    },
    rbg: {
        guide: `Ex: Envie/responda uma *imagem* com *{$p}rbg* - Retira o fundo da imagem.\n`,
        msgs: {
            error_message: "Houve um erro ao obter os dados da mensagem.",
            error_only_image: "Este comando só funciona com *IMAGENS*.",
            wait: "[AGUARDE] 📸 O fundo da imagem está sendo removido.",
        },
        function: utilityFunctions.rbgCommand
    },
    audio: {
        guide: 'Ex: Envie/responda um vídeo com *{$p}audio* - Extrai o áudio do video e envia.\n',
        msgs: {
            error_message: "Houve um erro ao obter os dados da mensagem.",
            error_only_video: 'Este comando funciona apenas com *VÍDEOS*.'
        },
        function: utilityFunctions.audioCommand
    },
    efeitoaudio: {
        guide: `Responda um aúdio com um desses comandos:\n\n` +
            `Ex: *{$p}efeitoaudio* grave - Torna audio mais grave e lento\n\n` +
            `Ex: *{$p}efeitoaudio* agudo - Torna o audio mais agudo e rapido\n\n` +
            `Ex: *{$p}efeitoaudio* estourar - Deixa o audio estourado\n\n` +
            `Ex: *{$p}efeitoaudio* volume  - Aumenta o volume em 4 vezes\n\n` +
            `Ex: *{$p}efeitoaudio* x2 - Acelera o audio em 2 vezes\n\n` +
            `Ex: *{$p}efeitoaudio* reverso - Reverte o audio\n\n` +
            `*Obs*: Este comando funciona apenas com *AUDIOS*.\n`,
        msgs: {
            error: "[❗] Houve um erro na conversão de audio"
        },
        function: utilityFunctions.efeitoaudioCommand
    },
    traduz: {
        guide: `Ex: *{$p}traduz* pt texto - Traduz o texto que foi digitado para *Português*.\n\n` +
            `Ex: *{$p}traduz* en texto - Traduz o texto que foi digitado para *Inglês*.\n\n` +
            `Ex: Responda um *texto* com *{$p}traduz* pt - Traduz o resto respondido para *Português*.\n\n` +
            `Ex: Responda um *texto* com *{$p}traduz* en - Traduz o resto respondido para *Inglês*.\n\n` +
            `Idiomas suportados: \n` +
            `- 🇧🇷 Português (pt)\n` +
            `- 🇺🇸 Inglês (en)\n` +
            `- 🇯🇵 Japonês (ja)\n` +
            `- 🇮🇹 Italiano (it)\n` +
            `- 🇪🇸 Espanhol (es)\n` +
            `- 🇷🇺 Russo (ru)\n` +
            `- 🇰🇷 Coreano (ko)\n`,
        msgs: {
            error: "Sem dados do idioma ou idioma não suportado. Atualmente suportamos:\n\n" +
                `- 🇧🇷 Português - {$p}traduz pt\n` +
                `- 🇺🇸 Inglês - {$p}traduz en\n` +
                `- 🇯🇵 Japonês - {$p}traduz ja\n` +
                `- 🇮🇹 Italiano - {$p}traduz it\n` +
                `- 🇪🇸 Espanhol - {$p}traduz es\n` +
                `- 🇷🇺 Russo - {$p}traduz ru\n` +
                `- 🇰🇷 Coreano - {$p}traduz ko\n`,
            reply: "🔠 *Tradução* 🔠:\n\n" +
                "*Texto*: {$1}\n" +
                "*Tradução*: {$2}"
        },
        function: utilityFunctions.traduzCommand
    },
    voz: {
        guide: `Ex: *{$p}voz* pt texto - Manda um audio falando o texto digitado com a voz do Google em Português-Brasil.\n\n` +
            `Ex: Responda um texto com *{$p}voz* pt - Manda um audio falando o texto respondido com a voz do Google em Português-Brasil.\n\n` +
            `Idiomas suportados: \n` +
            `- 🇧🇷 Português (pt)\n` +
            `- 🇺🇸 Inglês (en)\n` +
            `- 🇯🇵 Japonês (jp)\n` +
            `- 🇮🇹 Italiano (it)\n` +
            `- 🇪🇸 Espanhol (es)\n` +
            `- 🇷🇺 Russo (ru)\n` +
            `- 🇰🇷 Coreano (ko)\n` +
            `- 🇸🇪 Sueco (sv)\n`,
        msgs: {
            error_text: 'O texto para ser transformado em áudio está vazio.',
            error_text_long: 'O texto muito longo, há um limite de 500 caracteres.',
            error_not_supported: "O idioma escolhido não é suportado. Atualmente suportamos:\n\n" +
                `- 🇧🇷 Português - {$p}voz pt\n` +
                `- 🇺🇸 Inglês - {$p}voz en\n` +
                `- 🇯🇵 Japonês - {$p}voz ja\n` +
                `- 🇮🇹 Italiano - {$p}voz it\n` +
                `- 🇪🇸 Espanhol - {$p}voz es\n` +
                `- 🇷🇺 Russo - {$p}voz ru\n` +
                `- 🇰🇷 Coreano - {$p}voz ko\n` +
                `- 🇸🇪 Sueco - {$p}voz sv\n`
        },
        function: utilityFunctions.vozCommand
    },
    letra: {
        guide: `Ex: *{$p}letra* nome-musica - Exibe a letra da música que você digitou.\n`,
        msgs: {
            reply: "🎼 *Letra de música*\n\n" +
                "*Música*: {$1}\n" +
                "*Artista*: {$2}\n" +
                "*Letra*:\n" +
                "{$3}",
            error_not_found: 'A letra dessa música não foi encontrada'
        },
        function: utilityFunctions.letraCommand
    },
    noticias: {
  guide: `Ex: *{$p}noticias* - Exibe as notícias atuais.\n`,
  msgs: {
    reply_title: "🗞️ *Notícias da última hora by Livecoins*"
    // sem reply_item (não é mais necessário)
  },
  function: utilityFunctions.noticiasCommand
},
    analise: {
    guide: [
      `Ex: *{$p}analise btc* — Análise do BTC em BRL nos últimos 30d.`,
      `Ex: *{$p}analise bitcoin 90d* — Muda o período para 90 dias.`,
      `Ex: *{$p}analise eth usd 30d* — Moeda base USD e 30 dias.`,
      `Retorno inclui TL;DR, pontos rápidos, catalisadores, sentimento e 2 notícias.`
    ].join('\n'),
    // O comando monta a resposta internamente; msgs podem ficar vazias ou para uso futuro
    msgs: {
      // placeholders caso queira padronizar depois:
      title: "📊 *Análise — {$1} ({$2}) em {$3}*",
      tldr_title: "TL;DR",
      bullets_title: "Pontos rápidos:",
      catalysts_title: "Catalisadores/Atualizações recentes:",
      sentiment_title: "Sentimento de mercado:",
      news_title: "Últimas notícias relacionadas:",
      source_footer: "Fonte: {$1}\n{$2}\n"
    },
    function: utilityFunctions.analiseCommand
},
    calc: {
        guide: `Ex: *{$p}calc* 8x8 - Exibe o resultado do cálculo.\n\n` +
            `Ex: *{$p}calc* 1mm em 1km - Exibe o resultado do conversão de medidas.\n`,
        msgs: {
            reply: "🧮 *Calculadora*\n\n" +
                "*Resultado*: {$1}",
            error_invalid_result: 'O cálculo não pode ser feito porque deu um valor inválido, verifique se não digitou nenhum caractere inválido para o cálculo.'
        },
        function: utilityFunctions.calcCommand
    },
    pesquisa: {
        guide: `Ex: *{$p}pesquisa* tema - Faz uma pesquisa com o tema que você digitar.\n`,
        msgs: {
            reply_title: "🔎 *Pesquisa*\n\n" +
                "*Você pesquisou por*: {$1}\n\n",
            reply_item: "*{$1}*\n" +
                "- *Link*: {$2}\n\n",
            error_not_found: "Nenhum resultado foi encontrado para essa pesquisa"
        },
        function: utilityFunctions.pesquisaCommand
    },
    moeda: {
        guide: `Ex: *{$p}moeda* real 20 - Converte 20 reais para outras moedas\n` +
            `Ex: *{$p}moeda* dolar 20 - Converte 20 dólares para outras moedas.\n` +
            `Ex: *{$p}moeda* euro 20 - Converte 20 euros para outras moedas.\n`,
        msgs: {
            reply_title: "💵 *Conversão de moeda*\n\n" +
                "*Tipo da moeda*: {$1}\n" +
                "*Valor*: {$2}\n\n",
            reply_item: "- *Conversão*: {$1}\n" +
                "- *Valor convertido*: *{$2}* {$3}\n" +
                "- *Última atualização*: {$4}\n\n",
            error_invalid_value: "O valor inserido não é um número válido"
        },
        function: utilityFunctions.moedaCommand
    },
    clima: {
        guide: `Ex: *{$p}clima* Rio de Janeiro - Mostra o clima atual e dos próximos dias para o Rio de Janeiro.\n`,
        msgs: {
            reply: "☀️ *Clima atual*\n\n" +
                '*Local escolhido*: {$1}\n\n' +
                "- *Nome*: {$2}\n" +
                "- *Estado*: {$3}\n" +
                "- *País*: {$4}\n" +
                "- *Horário atual*: {$5}\n" +
                "- *Temperatura atual*: {$6}\n" +
                "- *Sensação térmica*: {$7}\n" +
                "- *Condição*: {$8}\n" +
                "- *Vento*: {$9}\n" +
                "- *Umidade*: {$10}\n" +
                "- *Nuvens*: {$11}\n\n",
            reply_forecast: "🗓️ Previsão *{$1}*\n" +
                "- *Max*: {$2}\n" +
                "- *Min*: {$3}\n" +
                "- *Condição*: {$4}\n" +
                "- *Vento máximo*: {$5}\n" +
                "- *Chuva?* {$6} de chance\n" +
                "- *Neve?* {$7} de chance\n" +
                "- *Nível UV*: {$8}\n\n"
        },
        function: utilityFunctions.climaCommand
    },
    ddd: {
        guide: `Ex: *{$p}ddd* 21 - Exibe qual estado e região do DDD 21.\n\n` +
            `Ex: Responda com *{$p}ddd* - Exibe qual estado e região do membro respondido.\n`,
        msgs: {
            error: "Esse comando só é aceito com números brasileiros.",
            reply: "📱 *Informação do DDD*\n\n" +
                "*Estado*: {$1}\n" +
                "*Região*: {$2}\n",
            error_not_found: 'Nenhum resultado foi encontrado para esse DDD'
        },
        function: utilityFunctions.dddCommand
    },
    qualanime: {
        guide: `Ex: Envie/responda uma imagem com *{$p}qualanime* - Procura o anime pela imagem.\n\n` +
            `*Obs*: Este comando funciona apenas com *IMAGENS* e deve ser uma *CENA VÁLIDA DE ANIME*, *NÃO* podendo ser imagens com *baixa qualidade*, *wallpappers*, *imagens editadas/recortadas*.\n`,
        msgs: {
            wait: "⏳ Estou processando a imagem e pesquisando o anime.",
            error_similarity: "Nível de similaridade é muito baixo, certifique se enviar uma cena VÁLIDA de anime (Não funciona com imagens não oficiais, Wallpapers ou imagens recortadas e/ou baixa qualidade).",
            error_message: "Houve um erro ao obter os dados da mensagem",
            reply: "🔎 *Reconhecimento de anime*\n\n" +
                "*Título*: {$1}\n" +
                "*Episódio*: {$2}\n" +
                "*Tempo da cena*: {$3} - {$4}\n" +
                "*Similaridade*: {$5}%\n" +
                "*Prévia*: {$6}",
            error_not_found: 'Nenhum anime compatível foi encontrado'
        },
        function: utilityFunctions.qualanimeCommand
    }
};
export default utilityCommands;
