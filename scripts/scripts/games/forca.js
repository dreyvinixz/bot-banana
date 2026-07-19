const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const config = require("../core/config");
const { assertForgeReady } = require("../core/services");
const { getCoins, addCoins, removeCoins } = require("../economy/economy");
const { getGameMultiplier } = require("../economy/boosts");
const { buttonRows } = require("../core/ui");

const forcaGames = new Map();

// ========== DADOS DA FORCA ==========

const forcaData = config.static.games.forca;
const TEMAS = forcaData.themes || {};
const PROMPT_HINTS = forcaData.promptHints || {};
const TEMA_CONTEXT = forcaData.themeContext || {};

// Histórico de palavras usadas por canal/tema para evitar repetições
const palavrasUsadas = new Map(); // chave: "channelId:tema" => palavras recentes

function getPalavraAleatoria(channelId, tema) {
  const temaConfig = TEMAS[tema];
  if (!temaConfig || !Array.isArray(temaConfig.palavras) || temaConfig.palavras.length === 0) return null;

  const key = `${channelId}:${tema}`;
  if (!palavrasUsadas.has(key)) palavrasUsadas.set(key, []);

  const historico = palavrasUsadas.get(key);
  let disponiveis = temaConfig.palavras.filter((p) => !historico.includes(p));

  if (disponiveis.length === 0) {
    const ultimas = historico.slice(-(forcaData.resetKeepLast || 5));
    palavrasUsadas.set(key, ultimas);
    disponiveis = temaConfig.palavras.filter((p) => !ultimas.includes(p));
  }

  const palavra = disponiveis[Math.floor(Math.random() * disponiveis.length)];
  palavrasUsadas.get(key).push(palavra);
  while (palavrasUsadas.get(key).length > (forcaData.historyLimit || 20)) palavrasUsadas.get(key).shift();

  return palavra;
}

function getImagePrompt(word, tema) {
  const hint = PROMPT_HINTS[word];
  const temaContext = TEMA_CONTEXT[tema] || "";

  if (hint) {
    return `${temaContext} ${hint}, high quality, sharp detail, vibrant colors, professional photography, masterpiece, no people, no face`;
  }

  return `${temaContext} ${word.toLowerCase()}, high quality, sharp detail, vibrant colors, professional photography, masterpiece, no people, no face`;
}

// ========== VISUAL DO JOGO ==========

const FORCA_FACES = [
  "💀 (Enforcado!)",
  "😵 (Quase lá...)",
  "🤕 (Machucado)",
  "😨 (Desesperado)",
  "😟 (Assustado)",
  "😐 (Preocupado)",
  "🙂 (Tranquilo)"
];

function maskWord(word, guessed) {
  return word.split("").map(char => guessed.has(char) ? char : "_").join(" ");
}

function getForcaEmbedText(gameState) {
  const face = FORCA_FACES[gameState.lives];
  const masked = maskWord(gameState.word, gameState.guessed);
  const chutes = Array.from(gameState.guessed).join(", ") || "Nenhum";
  const maxLives = forcaData.lives || 6;
  const coracoes = "❤️ ".repeat(gameState.lives) + "🖤 ".repeat(maxLives - gameState.lives);
  const rodadaInfo = gameState.maxRounds > 1 ? ` (Rodada ${gameState.currentRound}/${gameState.maxRounds})` : "";
  const temaInfo = TEMAS[gameState.tema] ? `${TEMAS[gameState.tema].emoji} ${TEMAS[gameState.tema].label}` : "Aleatório";
  return `🎮 **JOGO DA FORCA DA IA!**${rodadaInfo}
Tema: **${temaInfo}**
Chute uma letra enviando-a sozinha no chat.

**Palavra:** \`${masked}\`
**Chutes:** ${chutes}

**Status:** ${face}
**Vidas:** ${coracoes}`;
}

function resetForcaTimer(channelId, channel) {
  const gameState = forcaGames.get(channelId);
  if (!gameState) return;

  if (gameState.timerId) clearTimeout(gameState.timerId);

  gameState.timerId = setTimeout(() => {
    if (forcaGames.has(channelId)) {
      const g = forcaGames.get(channelId);
      forcaGames.delete(channelId);
      if (g.mainMessage) {
        g.mainMessage.edit(`⏰ **O JOGO EXPIROU POR INATIVIDADE!**\nA palavra era **${g.word}**!\n\n${getForcaEmbedText(g)}`).catch(() => null);
      }
    }
  }, config.static.app.forca.timeoutMs);
}

// ========== MENU DE SELEÇÃO DE TEMA ==========

// Guardar temporariamente quem está escolhendo tema
const pendingThemeSelection = new Map();

async function promptForcaRounds(interaction, ownerId) {
  const channelId = interaction.channelId;
  if (forcaGames.has(channelId)) {
    return interaction.reply({ content: "❌ Já tem um jogo da forca rolando neste canal! Adivinhe a palavra ou espere acabar.", flags: MessageFlags.Ephemeral });
  }

  const uid = ownerId || interaction.user.id;

  const rounds = forcaData.rounds || [1, 3, 5];
  const row = new ActionRowBuilder().addComponents(
    ...rounds.map((round) => new ButtonBuilder()
      .setCustomId(`forca_r_${round}_${uid}`)
      .setLabel(`${round} Rodada${round > 1 ? "s" : ""}`)
      .setStyle(round >= 5 ? ButtonStyle.Danger : ButtonStyle.Primary))
  );

  if (interaction.replied || interaction.deferred) {
    await interaction.update({
      content: "🎮 **JOGO DA FORCA**\nQuantas rodadas seguidas você quer jogar?",
      embeds: [],
      components: [row]
    });
  } else {
    await interaction.reply({
      content: "🎮 **JOGO DA FORCA**\nQuantas rodadas seguidas você quer jogar?",
      components: [row]
    });
  }
}

async function handleForcaThemeInteraction(interaction) {
  if (!interaction.isButton()) return false;

  if (interaction.customId.startsWith("forca_r_")) {
    // Parse: forca_r_{rounds}_{ownerId}
    const parts = interaction.customId.split('_');
    const rounds = parseInt(parts[2], 10);
    const ownerId = parts[3];
    
    if (ownerId && interaction.user.id !== ownerId) {
      await interaction.reply({ content: "❌ Apenas quem iniciou o jogo pode escolher as configurações!", flags: MessageFlags.Ephemeral });
      return true;
    }

    const channelId = interaction.channelId;
    const temaKeys = Object.keys(TEMAS);
    
    const themeRows = buttonRows(temaKeys.map((key, index) => ({
      customId: `forca_tema_${key}_${ownerId}`,
      label: `${TEMAS[key].emoji} ${TEMAS[key].label}`,
      style: index >= 10 ? "Success" : "Primary"
    })));
    const row4 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`forca_tema_aleatorio_${ownerId}`)
        .setLabel("🎲 Aleatório (Surpresa!)")
        .setStyle(ButtonStyle.Secondary)
    );

    pendingThemeSelection.set(channelId, {
      userId: ownerId,
      rounds: rounds
    });

    await interaction.update({
      content: `🎮 **JOGO DA FORCA (${rounds} Rodadas)** — Escolha o tema!\nSelecione uma categoria abaixo para começar:`,
      components: [...themeRows, row4]
    });
    return true;
  }

  if (!interaction.customId.startsWith("forca_tema_")) return false;

  const channelId = interaction.channel.id;
  const pending = pendingThemeSelection.get(channelId);
  if (!pending) {
    await interaction.reply({ content: "Esse menu já expirou! Use `!games` de novo.", flags: MessageFlags.Ephemeral });
    return true;
  }

  // Verifica owner para seleção de tema
  if (pending.userId && interaction.user.id !== pending.userId) {
    await interaction.reply({ content: "❌ Apenas quem iniciou o jogo pode escolher o tema!", flags: MessageFlags.Ephemeral });
    return true;
  }

  pendingThemeSelection.delete(channelId);

  // Parse: forca_tema_{temaKey}_{ownerId}  (temaKey pode ser 'aleatorio')
  const withoutPrefix = interaction.customId.replace("forca_tema_", "");
  const lastUnderscore = withoutPrefix.lastIndexOf('_');
  const temaKey = lastUnderscore > 0 ? withoutPrefix.substring(0, lastUnderscore) : withoutPrefix;

  let temaEscolhido;
  if (temaKey === "aleatorio") {
    const keys = Object.keys(TEMAS);
    temaEscolhido = keys[Math.floor(Math.random() * keys.length)];
  } else {
    temaEscolhido = temaKey;
  }

  if (!TEMAS[temaEscolhido]) {
    await interaction.reply({ content: "❌ Tema inválido!", flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.update({
    content: `🎮 Tema escolhido: **${TEMAS[temaEscolhido].emoji} ${TEMAS[temaEscolhido].label}**! Gerando dica visual...`,
    components: []
  });

  const maxRounds = pending ? pending.rounds : 1;
  startForcaRound(channelId, interaction.channel, temaEscolhido, maxRounds, 1);

  return true;
}

async function startForcaRound(channelId, channel, temaEscolhido, maxRounds, currentRound) {
  const word = getPalavraAleatoria(channelId, temaEscolhido);
  if (!word) {
    forcaGames.delete(channelId);
    return channel.send("❌ Não encontrei palavras configuradas para esse tema.");
  }
  const gameState = {
    word: word,
    tema: temaEscolhido,
    guessed: new Set(),
    lives: forcaData.lives || 6,
    mainMessage: null,
    timerId: null,
    maxRounds: maxRounds,
    currentRound: currentRound
  };

  forcaGames.set(channelId, gameState);
  resetForcaTimer(channelId, channel);

  // Gerar imagem e começar o jogo
  const promptDesc = getImagePrompt(word, temaEscolhido);
  const forcaNegative = config.FORGE_REALISTIC_NEGATIVE_PROMPT + ", woman, girl, man, boy, face, portrait, person, human face, selfie, headshot, asian, korean, japanese, close-up face";

  const payload = {
    prompt: promptDesc,
    negative_prompt: forcaNegative,
    steps: config.static.app.forca.image.steps,
    cfg_scale: config.static.app.forca.image.cfgScale,
    width: config.static.app.forca.image.width,
    height: config.static.app.forca.image.height,
    override_settings: {
      sd_model_checkpoint: config.FORGE_REALISTIC_MODEL
    },
    sampler_name: config.FORGE_SAMPLER,
    batch_size: 1
  };

  try {
    await assertForgeReady();
    const response = await fetch(`${config.FORGE_HOST}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    const data = await response.json();
    const imageBase64 = data.images[0];
    const buffer = Buffer.from(imageBase64, "base64");
    const attachment = new AttachmentBuilder(buffer, { name: "dica_forca.png" });

    const mainMsg = await channel.send({
      content: getForcaEmbedText(gameState),
      files: [attachment]
    });
    gameState.mainMessage = mainMsg;

  } catch (err) {
    console.error("Erro no forge forca:", err);
    const mainMsg = await channel.send(`⚠️ Não consegui gerar a imagem da dica (${err.message}), mas o jogo continua!\n\n${getForcaEmbedText(gameState)}`);
    gameState.mainMessage = mainMsg;
  }
}

// ========== LÓGICA DE CHUTES ==========

// Retorna true se a mensagem foi tratada pelo jogo da forca
function checkForcaGuess(message) {
  const channelId = message.channel.id;
  const gameState = forcaGames.get(channelId);
  if (!gameState) return false;

  // Se a mainMessage ainda não foi definida (imagem carregando), ignora os chutes
  if (!gameState.mainMessage) return false;

  const text = message.content.trim().toUpperCase();

  // Chute de letra única
  if (text.length === 1 && /[A-Z]/.test(text)) {
    message.delete().catch(() => null); // Apaga o chute para limpar o chat
    resetForcaTimer(channelId, message.channel);

    if (gameState.guessed.has(text)) {
      return true; // Ignora letras repetidas silenciosamente
    }

    gameState.guessed.add(text);

    if (!gameState.word.includes(text)) {
      gameState.lives--;
    } else {
      // Letra correta! Ganha 1 Nanacoin
      addCoins(message.author.id, 1);
    }

    const won = gameState.word.split("").every(char => gameState.guessed.has(char));

    if (won) {
      if (gameState.timerId) clearTimeout(gameState.timerId);
      forcaGames.delete(channelId);
      const { getGameMultiplier } = require("../economy/boosts");
      const mult = getGameMultiplier(message.author.id);
      const reward = config.static.app.forca.letterWinReward * mult;
      addCoins(message.author.id, reward);
      const multMsg = mult > 1 ? ` *(x${mult} Boost!)*` : "";
      gameState.mainMessage.edit(`🎉 **VITÓRIA!** O jogador ${message.author.username} adivinhou a última letra e ganhou **${reward} Nanacoins 🪙**${multMsg}!\nA palavra era **${gameState.word}**!\n\n${getForcaEmbedText(gameState)}`).catch(() => null);

      if (gameState.currentRound < gameState.maxRounds) {
        message.channel.send(`👉 Preparando a Rodada ${gameState.currentRound + 1}...`);
        setTimeout(() => startForcaRound(channelId, message.channel, gameState.tema, gameState.maxRounds, gameState.currentRound + 1), config.static.app.forca.nextRoundDelayMs);
      }
      return true;
    } else if (gameState.lives <= 0) {
      if (gameState.timerId) clearTimeout(gameState.timerId);
      forcaGames.delete(channelId);
      gameState.mainMessage.edit(`💀 **GAME OVER!** Vocês foram enforcados!\nA palavra era **${gameState.word}**!\n\n${getForcaEmbedText(gameState)}`).catch(() => null);

      if (gameState.currentRound < gameState.maxRounds) {
        message.channel.send(`👉 Preparando a Rodada ${gameState.currentRound + 1}...`);
        setTimeout(() => startForcaRound(channelId, message.channel, gameState.tema, gameState.maxRounds, gameState.currentRound + 1), config.static.app.forca.nextRoundDelayMs);
      }
      return true;
    } else {
      gameState.mainMessage.edit(getForcaEmbedText(gameState)).catch(() => null);
      return true;
    }
  }

  // Chute da palavra inteira
  if (text.length > 1 && /^[A-Z]+$/.test(text)) {
    message.delete().catch(() => null); // Apaga o chute do chat
    resetForcaTimer(channelId, message.channel);

    if (text === gameState.word) {
      if (gameState.timerId) clearTimeout(gameState.timerId);
      forcaGames.delete(channelId);
      const { getGameMultiplier } = require("../economy/boosts");
      const mult = getGameMultiplier(message.author.id);
      const reward = config.static.app.forca.wordReward * mult;
      addCoins(message.author.id, reward); // Recompensa Épica
      const multMsg = mult > 1 ? ` *(x${mult} Boost!)*` : "";
      gameState.mainMessage.edit(`🎉 **VITÓRIA ÉPICA!** O jogador ${message.author.username} adivinhou a palavra inteira de uma vez e ganhou **${reward} Nanacoins 🪙**${multMsg}!\nA palavra era **${gameState.word}**!\n\n${getForcaEmbedText(gameState)}`).catch(() => null);

      if (gameState.currentRound < gameState.maxRounds) {
        message.channel.send(`👉 Preparando a Rodada ${gameState.currentRound + 1}...`);
        setTimeout(() => startForcaRound(channelId, message.channel, gameState.tema, gameState.maxRounds, gameState.currentRound + 1), config.static.app.forca.nextRoundDelayMs);
      }
      return true;
    } else {
      gameState.lives--;
      if (gameState.lives <= 0) {
        if (gameState.timerId) clearTimeout(gameState.timerId);
        forcaGames.delete(channelId);
        const penalty = Math.min(getCoins(message.author.id), config.static.app.forca.wrongWordPenaltyMax);
        if (penalty > 0) removeCoins(message.author.id, penalty);
        gameState.mainMessage.edit(`💀 **GAME OVER!** O jogador ${message.author.username} chutou a palavra errada, matou o boneco e perdeu **${penalty} Nanacoins 🪙**!\nA palavra era **${gameState.word}**!\n\n${getForcaEmbedText(gameState)}`).catch(() => null);

        if (gameState.currentRound < gameState.maxRounds) {
          message.channel.send(`👉 Preparando a Rodada ${gameState.currentRound + 1}...`);
          setTimeout(() => startForcaRound(channelId, message.channel, gameState.tema, gameState.maxRounds, gameState.currentRound + 1), config.static.app.forca.nextRoundDelayMs);
        }
        return true;
      } else {
        gameState.mainMessage.edit(`❌ Palavra errada! Perderam 1 vida.\n\n${getForcaEmbedText(gameState)}`).catch(() => null);
        return true;
      }
    }
  }

  return false;
}

// ========== EVENTOS ALEATÓRIOS ==========

const EVENT_CHANNELS = config.static.app.events.channelIds;

let lastEventTime = Date.now();
let lastBossTime = Date.now(); // Spawna naturalmente em 12h
let lastMiniBossTime = Date.now(); // Spawna naturalmente em 6h
let activeEventMsgIds = new Set();

function resetBossTimer() {
  lastBossTime = Date.now();
}

async function getEventChannelsForMessage(message) {
  if (message.client?.botTtsTestMode) {
    const testChannelId = message.client.botTtsTestChannelId || config.static.app.test?.channelId;
    const channel = message.channelId === testChannelId
      ? message.channel
      : message.client.channels.cache.get(testChannelId) || await message.client.channels.fetch(testChannelId).catch(() => null);
    return channel ? [channel] : [];
  }

  const eventChannels = [];
  for (const channelId of EVENT_CHANNELS) {
    const eventChannel = message.client.channels.cache.get(channelId)
      || await message.client.channels.fetch(channelId).catch(() => null);
    if (eventChannel) eventChannels.push(eventChannel);
  }
  return eventChannels;
}

async function checkAndSpawnEvent(message) {
  const now = Date.now();

  // A cada 1 hora (baú)
  if (now - lastEventTime > config.static.app.events.chestIntervalMs) {
    lastEventTime = now;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("event_claim_btn")
        .setLabel(`🎁 PEGAR ${config.static.app.events.chestReward} NANACOINS!`)
        .setStyle(ButtonStyle.Success)
    );

    const messagesSent = [];
    for (const eventChannel of await getEventChannelsForMessage(message)) {
      if (eventChannel) {
        try {
          const msg = await eventChannel.send({
            content: `@here 🚨 **EVENTO ALEATÓRIO APARECEU!** 🚨\nO primeiro a clicar no botão ganha **${config.static.app.events.chestReward} Nanacoins 🪙**!`,
            components: [row]
          });
          activeEventMsgIds.add(msg.id);
          messagesSent.push(msg);
        } catch (err) {
          console.log(`⚠️ Falha ao spawnar evento no canal ${eventChannel.id}: ${err.message}`);
        }
      }
    }

    if (activeEventMsgIds.size > 0) {
      setTimeout(() => {
        messagesSent.forEach(msg => {
          if (activeEventMsgIds.has(msg.id)) {
            msg.edit({ content: "⏰ **EVENTO EXPIRADO!** Ninguém pegou o baú a tempo...", components: [] }).catch(() => null);
          }
        });
        activeEventMsgIds.clear();
      }, config.static.app.events.chestExpireMs);
    }
  }

  // A cada 12 horas (World Boss)
  if (now - lastBossTime > config.static.app.events.bossIntervalMs) {
    lastBossTime = now;
    
    const bossChannels = await getEventChannelsForMessage(message);
    
    if (bossChannels.length > 0) {
      const { spawnWorldBoss } = require("./boss");
      spawnWorldBoss(bossChannels);
    }
  }

  if (now - lastMiniBossTime > config.static.app.events.miniBossIntervalMs) {
    lastMiniBossTime = now;

    const bossChannels = await getEventChannelsForMessage(message);

    if (bossChannels.length > 0) {
      const { spawnMiniBoss } = require("./boss");
      spawnMiniBoss(bossChannels);
    }
  }
}

async function handleEventInteraction(interaction) {
  if (!interaction.isButton() || interaction.customId !== "event_claim_btn") return false;

  if (!activeEventMsgIds.has(interaction.message.id)) {
    await interaction.reply({ content: "Esse evento já foi reivindicado ou expirou!", flags: MessageFlags.Ephemeral });
    return true;
  }

  // Reivindica o prêmio
  activeEventMsgIds.delete(interaction.message.id);
  addCoins(interaction.user.id, config.static.app.events.chestReward);

  await interaction.update({
    content: `🎉 **EVENTO CONCLUÍDO!** 🎉\nO jogador **${interaction.user.username}** foi o mais rápido e resgatou os **${config.static.app.events.chestReward} Nanacoins 🪙**!`,
    components: []
  });

  return true;
}

module.exports = {
  promptForcaRounds,
  handleForcaThemeInteraction,
  checkForcaGuess,
  checkAndSpawnEvent,
  handleEventInteraction,
  EVENT_CHANNELS,
  getEventChannelsForMessage,
  resetBossTimer,
  maskWord,
  getPalavraAleatoria
};
