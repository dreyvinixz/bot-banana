const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const config = require("../core/config");
const { getCoins, addCoins, removeCoins } = require("../economy/economy");
const { getGameMultiplier } = require("../economy/boosts");
const { gerarImagemNoForge } = require("../ai/image");
const { traduzirParaIngles } = require("../core/utils");
const { getPerguntaAleatoria } = require("./quizbank");
const { getCenarioAleatorio } = require("./improvisobank");
const { shuffle, choice } = require("../core/random");

// Estado dos jogos em andamento (channelId -> estado)
const activeAventuras = new Map();

const triviaData = config.static.games.trivia;
const improvisoConfig = config.static.games.improviso;
const THEMES = triviaData.themes || {};
const DIFFICULTIES = triviaData.difficulties || {};

async function handleAventuraCommandMenu(interaction, ownerId) {
  const channelId = interaction.channelId;
  const uid = ownerId || interaction.user.id;

  if (activeAventuras.has(channelId)) {
    return interaction.reply({ content: "❌ Já existe uma aventura acontecendo neste canal! Termine a atual primeiro.", flags: MessageFlags.Ephemeral });
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`rpg_mode_improviso_${uid}`)
        .setLabel('🎭 Improviso (Escrita)')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rpg_mode_enigma_${uid}`)
        .setLabel('🧠 Show do Milhão (Trivia)')
        .setStyle(ButtonStyle.Success)
    );

  await interaction.update({
    content: `🌌 **O MULTIVERSO DA LOUCURA** 🌌\n\nEscolha qual modo vocês querem jogar no canal:\n\n**1. Improviso:** A IA cria o cenário e VOCÊS escrevem as ações. As melhores respostas ganham pontos!\n**2. Show do Milhão (Trivia):** A IA atua como apresentador de Trivia, gerando uma dica visual e uma pergunta para vocês acertarem!`,
    embeds: [],
    components: [row]
  });

  const message = await interaction.fetchReply();

  // Salvar no estado para ouvir o clique inicial
  activeAventuras.set(channelId, {
    type: 'menu',
    messageId: message.id,
    ownerId: uid
  });
}

async function handleRpgInteraction(interaction) {
  const channelId = interaction.channelId;
  const state = activeAventuras.get(channelId);
  if (!state) return;

  // Lógica de Modais (Improviso)
  if (interaction.isModalSubmit() && interaction.customId === 'rpg_imp_modal') {
    if (state.type === 'improviso_writing') {
      const input = interaction.fields.getTextInputValue('rpg_imp_input');
      state.respostas.set(interaction.user.id, input);
      return interaction.reply({ content: `✅ Sua ação foi enviada secretamente!`, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // Restante exige que seja botão
  if (!interaction.isButton()) return;
  const customId = interaction.customId;
  if (!customId.startsWith('rpg_')) return;

  if (state.type === 'menu') {
    const ownerId = state.ownerId;

    if (customId.startsWith('rpg_mode_improviso')) {
      if (ownerId && interaction.user.id !== ownerId) {
        return interaction.reply({ content: "❌ Apenas quem abriu o menu pode escolher o modo!", flags: MessageFlags.Ephemeral });
      }
      state.type = 'rounds';
      state.selectedMode = 'rpg_mode_improviso';

      const rowRounds = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rpg_rounds_1_${ownerId}`).setLabel('1 Rodada').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rpg_rounds_3_${ownerId}`).setLabel('3 Rodadas').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rpg_rounds_5_${ownerId}`).setLabel('5 Rodadas').setStyle(ButtonStyle.Danger)
      );

      return interaction.update({
        components: [rowRounds],
        content: `🌌 Modo **Improviso** selecionado!\n\nQuantas rodadas vamos jogar para definir o campeão?`
      });
    }
    
    if (customId.startsWith('rpg_mode_enigma')) {
      if (ownerId && interaction.user.id !== ownerId) {
        return interaction.reply({ content: "❌ Apenas quem abriu o menu pode escolher o modo!", flags: MessageFlags.Ephemeral });
      }
      state.type = 'enigma_rounds';
      state.selectedMode = 'rpg_mode_enigma';

      const rowRounds = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rpg_enigma_rounds_1_${ownerId}`).setLabel('1 Rodada').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rpg_enigma_rounds_3_${ownerId}`).setLabel('3 Rodadas').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rpg_enigma_rounds_5_${ownerId}`).setLabel('5 Rodadas').setStyle(ButtonStyle.Danger)
      );

      return interaction.update({
        components: [rowRounds],
        content: `🌌 Modo **Show do Milhão** selecionado!\n\nQuantas rodadas vamos jogar?`
      });
    }
  }

  // Menu de Rodadas (Improviso)
  if (state.type === 'rounds' && customId.startsWith('rpg_rounds_')) {
    const parts = customId.split('_');
    const ownerId = state.ownerId;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ content: "❌ Apenas quem abriu o menu pode configurar!", flags: MessageFlags.Ephemeral });
    }
    const nRounds = parseInt(parts[2], 10);
    await interaction.update({ components: [], content: `🔥 Modo Improviso com **${nRounds} Rodada(s)** selecionado!\nPreparando o palco do caos interdimensional...` });
    return iniciarTurnoImproviso(channelId, interaction.channel, nRounds, 1, new Map());
  }

  // Menu de Rodadas (Enigma/Show do Milhão)
  if (state.type === 'enigma_rounds' && customId.startsWith('rpg_enigma_rounds_')) {
    const parts = customId.split('_');
    const ownerId = state.ownerId;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ content: "❌ Apenas quem abriu o menu pode configurar!", flags: MessageFlags.Ephemeral });
    }
    const nRounds = parseInt(parts[3], 10);
    state.type = 'theme';
    state.enigmaMaxRounds = nRounds;
    state.enigmaCurrentRound = 1;

    const rowTheme1 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId(`rpg_theme_geral_${ownerId}`).setLabel('🧠 Geral').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rpg_theme_historia_${ownerId}`).setLabel('📜 História').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rpg_theme_ciencia_${ownerId}`).setLabel('🔬 Ciências').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rpg_theme_geek_${ownerId}`).setLabel('👾 Geek').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`rpg_theme_esportes_${ownerId}`).setLabel('⚽ Esportes').setStyle(ButtonStyle.Primary)
      );
    const rowTheme2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId(`rpg_theme_musica_${ownerId}`).setLabel('🎵 Música').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rpg_theme_filmes_${ownerId}`).setLabel('🎬 Filmes').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`rpg_theme_biologia_${ownerId}`).setLabel('🧬 Biologia').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rpg_theme_politica_${ownerId}`).setLabel('🌍 Política').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rpg_theme_economia_${ownerId}`).setLabel('💰 Economia').setStyle(ButtonStyle.Success)
      );
    const rowTheme3 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId(`rpg_theme_artelit_${ownerId}`).setLabel('🎨 Arte/Lit').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`rpg_theme_astronomia_${ownerId}`).setLabel('🔭 Astronomia').setStyle(ButtonStyle.Secondary)
      );

    return interaction.update({
      components: [rowTheme1, rowTheme2, rowTheme3],
      content: `🌌 **Show do Milhão (${nRounds} Rodadas)** — Escolha o **TEMA** da pergunta:`
    });
  }

  // Menu de Tema (Enigma)
  if (state.type === 'theme' && customId.startsWith('rpg_theme_')) {
    const ownerId = state.ownerId;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ content: "❌ Apenas quem abriu o menu pode escolher o tema!", flags: MessageFlags.Ephemeral });
    }
    // Parse: rpg_theme_{themeKey}_{ownerId}
    const withoutPrefix = customId.replace('rpg_theme_', '');
    const lastUnderscore = withoutPrefix.lastIndexOf('_');
    const themeKey = lastUnderscore > 0 ? withoutPrefix.substring(0, lastUnderscore) : withoutPrefix;
    
    state.selectedTheme = THEMES[themeKey];
    state.selectedThemeKey = themeKey;
    state.type = 'difficulty';

    const rowDiff = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId(`rpg_diff_facil_${ownerId}`).setLabel('Fácil').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rpg_diff_medio_${ownerId}`).setLabel('Médio').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rpg_diff_dificil_${ownerId}`).setLabel('Difícil').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`rpg_diff_infernal_${ownerId}`).setLabel('Infernal').setStyle(ButtonStyle.Secondary)
      );

    return interaction.update({
      components: [rowDiff],
      content: `🌌 Tema **${state.selectedTheme.name}** selecionado!\n\nAgora escolha o **NÍVEL DA DIFICULDADE**: (Cuidado com o Infernal, ele arranca moedas se você errar!)`
    });
  }

  if (state.type === 'difficulty' && customId.startsWith('rpg_diff_')) {
    const ownerId = state.ownerId;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ content: "❌ Apenas quem abriu o menu pode escolher a dificuldade!", flags: MessageFlags.Ephemeral });
    }
    // Parse: rpg_diff_{diffKey}_{ownerId}
    const withoutPrefix = customId.replace('rpg_diff_', '');
    const lastUnderscore = withoutPrefix.lastIndexOf('_');
    const diffKey = lastUnderscore > 0 ? withoutPrefix.substring(0, lastUnderscore) : withoutPrefix;
    const diffObj = DIFFICULTIES[diffKey];
    state.type = 'generating';
    
    const nRounds = state.enigmaMaxRounds || 1;
    await interaction.update({ components: [], content: `🔥 Tema **${state.selectedTheme.name}** | Dificuldade **${diffObj.name}** | **${nRounds} Rodada(s)**!\nPreparando a viagem interdimensional...` });
    return iniciarModoEnigma(channelId, interaction.channel, state.selectedTheme, diffObj, state.selectedThemeKey, diffKey, nRounds, 1);
  }

  // Jogando Enigma
  if (state.type === 'enigma_playing' && customId.startsWith('rpg_enigma_')) {
    const resposta = parseInt(customId.split('_')[2], 10);
    if (!state.votos.has(interaction.user.id)) {
      state.votos.set(interaction.user.id, resposta);
      return interaction.reply({ content: `Seu palpite foi registrado! 🤫`, flags: MessageFlags.Ephemeral });
    } else {
      return interaction.reply({ content: `Você já votou! Aguarde o resultado.`, flags: MessageFlags.Ephemeral });
    }
  }

  // Jogando Improviso (Pedir para escrever)
  if (state.type === 'improviso_writing' && customId === 'rpg_imp_write') {
    const modal = new ModalBuilder()
      .setCustomId('rpg_imp_modal')
      .setTitle('Sua Ação Escapista');
      
    const txtInput = new TextInputBuilder()
      .setCustomId('rpg_imp_input')
      .setLabel('O que você faz?')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(100)
      .setRequired(true)
      .setPlaceholder('Escreva sua atitude bizarra aqui...');
      
    modal.addComponents(new ActionRowBuilder().addComponents(txtInput));
    return interaction.showModal(modal);
  }

  // Jogando Improviso (Votação)
  if (state.type === 'improviso_voting' && customId.startsWith('rpg_imp_vote_')) {
    const voteId = customId.split('_')[3]; // ex: A, B, C
    
    // Self-voting is now allowed!
    
    if (!state.votos.has(interaction.user.id)) {
      state.votos.set(interaction.user.id, voteId);
      return interaction.reply({ content: `✅ Voto registrado na opção ${voteId}!`, flags: MessageFlags.Ephemeral });
    } else {
      return interaction.reply({ content: `Você já votou! Aguarde.`, flags: MessageFlags.Ephemeral });
    }
  }
}

// ==========================================
// MODO 1: IMPROVISO (ESTILO JACKBOX)
// ==========================================
async function iniciarTurnoImproviso(channelId, channel, maxRounds, currentRound, globalScores) {
  activeAventuras.set(channelId, { type: 'generating' });

  // Pega nomes dos jogadores no canal para a zoeira
  let nomesDisponiveis = [];
  if (channel.isTextBased() && channel.guild) {
     const members = Array.from(channel.members.values()).filter(m => !m.user.bot).map(m => m.user.username);
     if (members.length > 0) {
        nomesDisponiveis = shuffle(members);
     }
  }
  const nomeVitima = nomesDisponiveis.length > 0 ? nomesDisponiveis[0] : "Alguém misterioso";

  try {
    const msg = await channel.send(`📜 (Rodada ${currentRound}/${maxRounds}) Abrindo um novo Universo...`);

    // Usa o banco de cenários pré-configurado (sem depender de LLM)
    const { cenario, img: promptImg } = getCenarioAleatorio(channelId, nomeVitima);

    // Tenta gerar a imagem no Forge (opcional, jogo continua se falhar)
    let attachment = null;
    try {
      attachment = await gerarImagemNoForge(promptImg + ", funny cartoon style, vibrant colors, no text", false);
    } catch (imgErr) {
      console.log("⚠️ Forge offline no Improviso, prosseguindo sem imagem.", imgErr.message);
    }

    const endTimeWrite = Math.floor(Date.now() / 1000) + (improvisoConfig.writeSeconds || 45);

    const rowWrite = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rpg_imp_write').setLabel('📝 Escrever Resposta Secreta').setStyle(ButtonStyle.Success)
    );

    await msg.delete().catch(() => null);

    const sendPayload = {
      content: `🌌 **IMPROVISO - RODADA ${currentRound}** 🌌\n\n${cenario}\n\n⏳ **TEMPO PARA ESCREVER:** <t:${endTimeWrite}:R>\nClique no botão abaixo para digitar sua ação anonimamente!`,
      components: [rowWrite]
    };
    if (attachment) sendPayload.files = [attachment];

    const survMsg = await channel.send(sendPayload);

    activeAventuras.set(channelId, {
      type: 'improviso_writing',
      respostas: new Map(), // userId -> text
      promptImg, cenario
    });

    // FASE DE ESCRITA
    setTimeout(async () => {
      const stateWrite = activeAventuras.get(channelId);
      if (!stateWrite || stateWrite.type !== 'improviso_writing') return;

      await survMsg.edit({ 
         content: `🌌 **IMPROVISO - RODADA ${currentRound}** 🌌\n\n${cenario}\n\n🛑 **TEMPO DE ESCRITA ESGOTADO!**`, 
         components: [] 
      }).catch(() => null);

      if (stateWrite.respostas.size === 0) {
        activeAventuras.delete(channelId);
        return channel.send("Ninguém escreveu nada! A inércia consumiu todos vocês. Fim de jogo.");
      }

      // Embaralhar respostas e atribuir letras (A, B, C...)
      const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const answerAuthors = {}; // letter -> userId
      const letterToText = {}; // letter -> text
      
      let index = 0;
      let textLines = "";
      const rowVote = new ActionRowBuilder();

      stateWrite.respostas.forEach((text, userId) => {
        if (index >= (improvisoConfig.maxOptions || 5)) return;
        const L = letras[index];
        answerAuthors[L] = userId;
        letterToText[L] = text;
        textLines += `> 🟢 **OPÇÃO ${L}** \n> *"${text}"*\n\n`;
        
        rowVote.addComponents(
          new ButtonBuilder().setCustomId(`rpg_imp_vote_${L}`).setLabel(`Opção ${L}`).setStyle(ButtonStyle.Primary)
        );
        index++;
      });

      const endTimeVote = Math.floor(Date.now() / 1000) + (improvisoConfig.voteSeconds || 30);

      const voteMsg = await channel.send({
        content: `🚨 **FIM DO TEMPO! AQUI ESTÃO AS IDEIAS:** 🚨\n\n${textLines}\n⏳ **VOTAÇÃO ENCERRA EM:** <t:${endTimeVote}:R>\n*Vote na melhor ação! Votar em si mesmo é permitido (e até encorajado pela zoeira).*`,
        components: [rowVote]
      });

      activeAventuras.set(channelId, {
        type: 'improviso_voting',
        votos: new Map(), // userId -> letter
        answerAuthors, letterToText, promptImg, cenario,
        totalAnswers: Object.keys(answerAuthors).length
      });

      // FASE DE VOTAÇÃO
      setTimeout(async () => {
        const stateVote = activeAventuras.get(channelId);
        if (!stateVote || stateVote.type !== 'improviso_voting') return;
        
        await voteMsg.edit({ content: `🛑 **VOTAÇÃO ENCERRADA!**`, components: [] }).catch(() => null);

        // Apurar votos
        const count = {};
        let totalVotes = 0;
        stateVote.votos.forEach((letter) => {
          count[letter] = (count[letter] || 0) + 1;
          totalVotes++;
        });

        if (totalVotes === 0) {
          activeAventuras.delete(channelId);
          return channel.send("Ninguém votou! Vocês ficaram discutindo até o apocalipse chegar. Fim de jogo.");
        }

        let maxVotes = 0;
        Object.values(count).forEach(v => {
           if (v > maxVotes) maxVotes = v;
        });

        // Encontrar todos com o máximo de votos (para caso de empate)
        const empatados = Object.keys(count).filter(letra => count[letra] === maxVotes);
        
        // Se houver empate, escolhe um aleatoriamente para ser a "ação concretizada" da rodada
        let winnerLetter = choice(empatados);
        let winnerText = stateVote.letterToText[winnerLetter];
        let winnerId = stateVote.answerAuthors[winnerLetter];

        // Atualizar score global de TODOS os que empataram
        empatados.forEach(letra => {
           const id = stateVote.answerAuthors[letra];
           const oldScore = globalScores.get(id) || 0;
           globalScores.set(id, oldScore + 5);
        });

        // Construir string de resultados detalhada
        let resultados = `⏰ **VOTAÇÃO ENCERRADA!** Aqui estão os autores:\n\n`;
        Object.keys(stateVote.answerAuthors).forEach(letra => {
           const autor = stateVote.answerAuthors[letra];
           const numVotos = count[letra] || 0;
           const textoId = stateVote.letterToText[letra];
           resultados += `**Opção ${letra}** (${numVotos} votos) -> <@${autor}>\n*"${textoId}"*\n\n`;
        });

        if (empatados.length > 1) {
           const mensoesEmpate = empatados.map(l => `<@${stateVote.answerAuthors[l]}>`).join(" e ");
           resultados += `🏆 **HOUVE UM EMPATE!** Entre as opções ${empatados.join(", ")}!\n${mensoesEmpate} ganharam +5 pontos!\n*(A opção **${winnerLetter}** foi sorteada para continuar a história)*`;
        } else {
           resultados += `🏆 **A IDEIA VENCEDORA** foi a **${winnerLetter}**! <@${winnerId}> ganhou +5 pontos!`;
        }

        activeAventuras.set(channelId, { type: 'generating' });

        // Tenta pegar um GIF aleatório salvo no banco do bot para ilustrar a zoeira (opcional)
        let gifUrl = null;
        try {
           const fs = require('fs');
           const config = require('../core/config');
           if (fs.existsSync(config.GIFS_PATH)) {
              const gifsDb = JSON.parse(fs.readFileSync(config.GIFS_PATH));
              if (gifsDb && gifsDb.length > 0) {
                 gifUrl = choice(gifsDb);
              }
           }
        } catch(e) {}

        let resolMsg = `📸 **AÇÃO CONCRETIZADA:**\n"<@${winnerId}>: *${winnerText}*"\n\n`;

        if (currentRound < maxRounds) {
           resolMsg += `👉 Preparando a Rodada ${currentRound + 1}...`;
           const payload = { content: resultados + "\n\n" + resolMsg };
           if (gifUrl) payload.content += `\n${gifUrl}`;
           
           await channel.send(payload);
           setTimeout(() => {
             iniciarTurnoImproviso(channelId, channel, maxRounds, currentRound + 1, globalScores);
           }, config.static.app.improviso.nextRoundDelayMs);
        } else {
           // FIM DE JOGO
           resolMsg += `🏆 **FIM DO JOGO!**\nO Multiverso (ou a reputação de vocês) está a salvo.\n\n**PLACAR FINAL:**\n`;
           
           const sorted = Array.from(globalScores.entries()).sort((a, b) => b[1] - a[1]);
           
           // Ajustar prêmios baseados na quantidade de rodadas para não quebrar a economia
           let premios = improvisoConfig.rewardsByRounds?.one || [50, 20, 10];
           if (maxRounds === 3) premios = improvisoConfig.rewardsByRounds?.three || [150, 75, 25];
           if (maxRounds >= 5) premios = improvisoConfig.rewardsByRounds?.fivePlus || [300, 150, 50];
           
           for (let i = 0; i < sorted.length; i++) {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🏅";
              resolMsg += `${medal} <@${sorted[i][0]}> - ${sorted[i][1]} Pontos`;
              
              if (i < 3) {
                 addCoins(sorted[i][0], premios[i]);
                 resolMsg += ` *(Ganhou ${premios[i]} Nanacoins 🪙!)*\n`;
              } else {
                 resolMsg += `\n`;
              }
           }
           
           activeAventuras.delete(channelId);
           const payload = { content: resultados + "\n\n" + resolMsg };
           if (gifUrl) payload.content += `\n${gifUrl}`;
           await channel.send(payload);
        }

      }, (improvisoConfig.voteSeconds || 30) * 1000);

    }, (improvisoConfig.writeSeconds || 45) * 1000);

  } catch (err) {
    console.error("Erro Improviso:", err);
    channel.send("O tecido do Multiverso rasgou na geração inicial. Tentem outra hora.");
    activeAventuras.delete(channelId);
  }
}

// ==========================================
// MODO 2: TRIVIA / SHOW DO MILHÃO
// ==========================================
async function iniciarModoEnigma(channelId, channel, themeObj, diffObj, themeKey, diffKey, maxRounds = 1, currentRound = 1) {
  activeAventuras.set(channelId, { type: 'generating' });

  try {
    // Tenta pegar uma pergunta do banco pré-configurado primeiro
    const bancoQ = getPerguntaAleatoria(channelId, themeKey, diffKey);

    let pergunta, promptImg, verdadeira, f1, f2, f3;

    if (bancoQ) {
      // Usa pergunta do banco (rápido e confiável)
      pergunta = bancoQ.p;
      promptImg = bancoQ.img;
      verdadeira = bancoQ.v;
      [f1, f2, f3] = bancoQ.f;
      console.log(`📋 [ShowDoMilhão] Usando pergunta do banco: "${pergunta}"`);
    } else {
      throw new Error("BANCO_VAZIO");
    }

    const msg = await channel.send("🎨 Preparando a pergunta e gerando a dica visual...");

    // Gerar imagem com prompt em inglês + anti-portrait negative
    let attachment;
    try {
      const fullPrompt = `${promptImg}, high quality, sharp detail, vibrant colors, professional photography, masterpiece, no text, no watermark`;
      const antiPortraitNegative = "woman, girl, man, boy, face, portrait, person, human face, selfie, headshot, asian, korean, japanese, close-up face";
      attachment = await gerarImagemNoForge(fullPrompt, false, antiPortraitNegative);
    } catch (imgErr) {
      console.error("Erro ao gerar imagem do Show do Milhão:", imgErr);
      attachment = null;
    }

    // Limpeza final de parênteses para todas as opções (LLM ou Banco)
    verdadeira = verdadeira.replace(/\s*\([cC]orreta.*?\)/gi, '').trim();
    f1 = f1.replace(/\s*\([fF]alsa.*?\)/gi, '').trim();
    f2 = f2.replace(/\s*\([fF]alsa.*?\)/gi, '').trim();
    f3 = f3.replace(/\s*\([fF]alsa.*?\)/gi, '').trim();

    // Embaralhar opções
    const opcoes = [
      { texto: verdadeira, correta: true },
      { texto: f1, correta: false },
      { texto: f2, correta: false },
      { texto: f3, correta: false }
    ];
    const shuffledOpcoes = shuffle(opcoes);
    opcoes.splice(0, opcoes.length, ...shuffledOpcoes);

    const corretaIndex = opcoes.findIndex(o => o.correta);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rpg_enigma_0').setLabel('Opção 1').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rpg_enigma_1').setLabel('Opção 2').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rpg_enigma_2').setLabel('Opção 3').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rpg_enigma_3').setLabel('Opção 4').setStyle(ButtonStyle.Primary)
    );

    let txtOpcoes = `> 🔵 **OPÇÃO 1:** *${opcoes[0].texto}*\n> 🔵 **OPÇÃO 2:** *${opcoes[1].texto}*\n> 🔵 **OPÇÃO 3:** *${opcoes[2].texto}*\n> 🔵 **OPÇÃO 4:** *${opcoes[3].texto}*`;

    const endTime = Math.floor(Date.now() / 1000) + (triviaData.answerSeconds || 45);

    await msg.delete().catch(() => null);

    const rodadaInfo = maxRounds > 1 ? ` (Rodada ${currentRound}/${maxRounds})` : '';
    const sendPayload = {
      content: `🧠 **SHOW DO MILHÃO${rodadaInfo}** 🧠\n📂 Tema: **${themeObj.name}** | 🎯 Dificuldade: **${diffObj.name}**\n\n**${pergunta}**\n\n${txtOpcoes}\n\n⏳ **O tempo se esgota em:** <t:${endTime}:R>`,
      components: [row1, row2]
    };
    if (attachment) sendPayload.files = [attachment];

    const enigmaMsg = await channel.send(sendPayload);

    activeAventuras.set(channelId, {
      type: 'enigma_playing',
      votos: new Map(), // userId -> opcaoIndex
      corretaIndex: corretaIndex
    });

    // Aguardar 45 segundos
    setTimeout(async () => {
      const state = activeAventuras.get(channelId);
      if (!state || state.type !== 'enigma_playing') return;

      activeAventuras.delete(channelId);

      await enigmaMsg.edit({
        components: [],
        content: `🧠 **SHOW DO MILHÃO** 🧠\n📂 Tema: **${themeObj.name}** | 🎯 Dificuldade: **${diffObj.name}**\n\n**${pergunta}**\n\n${txtOpcoes}\n\n⏳ **O tempo se esgotou!**`
      }).catch(() => null);

      let vencedoresArray = [];

      state.votos.forEach((voto, userId) => {
        if (voto === corretaIndex) {
          const mult = getGameMultiplier(userId);
          const reward = diffObj.win * mult;
          addCoins(userId, reward);
          const nameTag = mult > 1 ? `<@${userId}> *(x${mult} Boost = ${reward} 🪙)*` : `<@${userId}>`;
          vencedoresArray.push(nameTag);
        } else {
          const penalty = Math.min(getCoins(userId), diffObj.lose);
          if (penalty > 0) removeCoins(userId, penalty);
        }
      });

      let resultText = `⏰ **TEMPO ESGOTADO!**\n\nA resposta correta era a **Opção ${corretaIndex + 1}**: *${opcoes[corretaIndex].texto}*!\n\n`;

      if (vencedoresArray.length > 0) {
        resultText += `🎉 **ACERTARAM E GANHARAM (Base ${diffObj.win} 🪙):** ${vencedoresArray.join(', ')}`;
      } else {
        resultText += `💀 **TODO MUNDO ERROU!** Ninguém ganhou.`;
      }

      if (diffObj.lose > 0) {
        resultText += `\n*Nota: Quem errou perdeu ${diffObj.lose} Nanacoins por jogar na dificuldade ${diffObj.name}.*`;
      }

      channel.send(resultText);

      // Próxima rodada ou fim de jogo
      if (currentRound < maxRounds) {
        setTimeout(() => {
          channel.send(`➡️ **PRÓXIMA RODADA em ${Math.round(config.static.app.trivia.nextRoundDelayMs / 1000)} segundos... (${currentRound + 1}/${maxRounds})**`);
          setTimeout(() => iniciarModoEnigma(channelId, channel, themeObj, diffObj, themeKey, diffKey, maxRounds, currentRound + 1), config.static.app.trivia.nextRoundDelayMs);
        }, config.static.app.trivia.nextRoundAnnounceMs);
      }

    }, (triviaData.answerSeconds || 45) * 1000);

  } catch (err) {
    if (err.message === "BANCO_VAZIO") {
      channel.send(`📭 O banco de perguntas para o tema **${themeObj.name}** na dificuldade **${diffObj.name}** está vazio ou esgotado! Joguem em outro tema/dificuldade ou adicionem mais na configuração.`);
    } else {
      console.error("Erro no Enigma:", err);
      channel.send("Um erro desconhecido quebrou o portal do enigma. Tentem novamente.");
    }
    activeAventuras.delete(channelId);
  }
}

module.exports = {
  handleAventuraCommandMenu,
  handleRpgInteraction
};
