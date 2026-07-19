const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const config = require("../core/config");
const { isCommand, getCommandText } = require("../core/utils");
const { handleVoiceCommand } = require("../voice/voice");
const { handleImageCommand } = require("../ai/image");
const { 
  isPerguntaMapasPathOfExile,
  respostaMapasPathOfExile,
  perguntarQuestion,
  perguntarIaPrompt
} = require("../ai/question");
const {
  coletarGifs,
  cachearMensagem,
  maybeExtrairFofocas,
  maybeResponderEspontaneo
} = require("../ai/chat");
const { handleForcaThemeInteraction, checkForcaGuess, checkAndSpawnEvent, handleEventInteraction } = require("../games/forca");
const { getCoins, getTopPlayers, handleDoarCommand } = require("../economy/economy");
const { handleRoubarCommand, handleButtonInteraction, handleTimeoutCommand, handleFiancaCommand, handleParrudoCommand, isPrisioneiro, handleBeijarMuroCommand } = require("../games/duel");
const { handleRpgInteraction } = require("../games/rpg");
const { handleBoostCommand, handleBoostInteraction } = require("../economy/boosts");
const { handleMarketCommand, handleMarketInteraction } = require("../economy/market");
const { handleRaidCommand, handleRaidInteraction, scheduleExistingRaids } = require("../economy/raids");
const { handleInventoryCommand, handleEquipWeaponCommand } = require("../economy/weapons");
const { checkAndSendTip } = require("../features/tips");
const { handleReelsCommand, handleReelsInteraction } = require("../features/reels");
const { handleAdminCommand } = require("../admin/admin");
const { startVideoScheduler } = require("../core/videoScheduler");

function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle('🤖 Comandos do Nana 🍌')
    .setDescription('Aqui está a lista de tudo que eu posso fazer por você no servidor!\nExplore os comandos por categoria abaixo.')
    .addFields(
      { name: '💰 Economia, Mercado & Forja', value: [
        '`!daily` / `!diario` - 🎁 Gire a roleta diária para prêmios!',
        '`!saldo` - 💵 Verifica quanto dinheiro virtual você tem.',
        '`!rank` - 🏆 Mostra os mais ricos do servidor.',
        '`!doar <@user> <valor>` - 💸 Transfere Nanacoins simples.',
        '`!loja` - 🏪 Loja Oficial com **estoque virtual**, preços dinâmicos e **Lootboxes**.',
        '`!bolsa` - 📈 Bolsa de Valores real: compre, venda e lucre com especulação!',
        '`!raid` - ⚔️ Raid de Servidores: guerra econômica controlada.',
        '`!inventario` / `!inv` - 🎒 Mostra itens, armas e acesso completo à **Forja**!',
        '`!armas` - ⚙️ Abre direto o craft de armas da Forja.'
      ].join('\n') },
      { name: '⚔️ Crime & Duelo', value: [
        '`!roubar <@user>` - 🥷 Tenta furtar Nanacoins de alguém.',
        '`!parrudo <horas>h` - 🛡️ Imunidade a roubos. Ladrões sofrem dano se atacarem sem Ácido!',
        '`!timeout` - 🚓 Verifica tempo de prisão.',
        '`!fianca [@user]` - 💸 Paga fiança para sair ou soltar amigo.',
        '`!beijarmuro` - 💋 Beija o muro e testa sua sorte.'
      ].join('\n') },
      { name: '🎮 Games, Boss & RPG', value: [
        '`!games` - 🎰 Hub central de jogos: Forca, Trivia/RPG e Duelo!'
      ].join('\n') },
      { name: '🧠 IA & Utilidades', value: [
        '`!nana <texto>` - 💬 Conversa com a IA no modo casual/persona.',
        '`!question <texto>` - 🧠 Pergunta séria, resposta profissional.',
        '`!img <prompt>` - 🖼️ Gera imagem realista pelo Forge.',
        '`!anime <prompt>` - 🌸 Gera imagem em estilo anime pelo Forge.',
        '`!reels` - 🎬 Abre o painel para reel aleatório, link manual ou apagar o último reel do painel.',
        '`!f <texto>` - 🔊 Fala no canal de voz onde você está.',
        '`!clear [cmd] <num>` - 🧹 Apaga mensagens do bot ou comandos de usuários.'
      ].join('\n') }
    )
    .setFooter({ text: 'Dica: Eu também respondo se você me mencionar ou me chamar pelo nome no chat livre!' });
}

function buildNewEmbed() {
  return new EmbedBuilder()
    .setColor('#00FF00') // Verde neon chamativo
    .setTitle('🌟 ATUALIZAÇÃO: PAINÉIS, FORJA & REELS 🌟')
    .setDescription('O BotTTs ganhou atalhos mais práticos para reduzir spam de comando e deixar os fluxos importantes em interface.')
    .addFields(
      { name: '🎬 Painel de Reels', value: 'Use `!reels` para abrir uma interface com **Reel Aleatório** pelo banco, envio por **link do Instagram** e botão para **apagar o último reel** enviado pelo painel no chat.' },
      { name: '⚙️ Atalho de Armas', value: '`!armas` agora abre direto a UI de **Craftar Arma** da Forja, a mesma que existe dentro do `!inv`.' },
      { name: '📈 Bolsa de Valores & Loja Viva', value: 'Esqueça os preços fixos! A `!loja` agora possui **Estoque Virtual** que limita a demanda e oscila o preço. Use a `!bolsa` para vender seus itens a preços personalizados para a comunidade, lucrando com a especulação!' },
      { name: '⚒️ A Grande Forja e Crafting', value: 'Entre no seu `!inv` e visite a **Forja**. Você pode usar os materiais coletados (Pó Cósmico, Sucata, etc.) para **Reparar** armas, **Fortificar** atributos, ativar **Buffs** temporários ou até **Criar Armas** novas do zero! Cansado da habilidade de uma arma Lendária? Use o **Reroll**!' },
      { name: '⚔️ Raids entre Servidores', value: 'Use `!raid` para engajar em **guerras econômicas interservidores**. Reúna seus aliados, compre *Estandartes de Guerra* ou *Escudos do Servidor* e invada a economia de outra comunidade para roubar até 8% dos seus fundos!' },
      { name: '🐉 Bosses dropam Materiais', value: 'Derrotar o World Boss e o Mini Boss não te dá mais apenas dinheiro: eles agora dropam **Materiais de Forja e Núcleos Lendários**. Caçá-los se tornou essencial para quem quer fortificar as melhores armas.' },
      { name: '🎒 Empilhamento de Itens', value: 'Consumíveis e Materiais agora são perfeitamente empilháveis no seu inventário, permitindo estocar recursos massivos e vender lotes completos na Bolsa.' }
    )
    .setImage('https://media.tenor.com/XqT7hS_m4_kAAAAC/hype-train.gif')
    .setFooter({ text: 'Bem-vindos a nova era da Economia! Usem !help para ver os comandos.' });
}

async function sendChunkedReply(message, text) {
  if (!text) return message.reply("Não consegui montar uma resposta.");
  const limit = 1950;
  if (text.length <= limit) {
    return message.reply({ content: text, allowedMentions: { repliedUser: false, parse: [] } });
  }
  
  let remaining = text;
  let isFirst = true;
  while (remaining.length > 0) {
    let chunk = remaining.substring(0, limit);
    let lastNewline = chunk.lastIndexOf('\n');
    if (lastNewline > 0 && remaining.length > limit) {
      chunk = chunk.substring(0, lastNewline);
    }
    remaining = remaining.substring(chunk.length).trim();
    
    if (isFirst) {
      await message.reply({ content: chunk, allowedMentions: { repliedUser: false, parse: [] } });
      isFirst = false;
    } else {
      await message.channel.send({ content: chunk, allowedMentions: { repliedUser: false, parse: [] } });
    }
  }
}

async function handleTextCommand(message) {
  const texto = getCommandText(message, ["!nana"]);
  if (!texto) {
    return message.reply("Digite uma pergunta: `!nana me explica isso aqui`");
  }

  try {
    const prompt = `Responda em português do Brasil de forma direta, natural e curta.\n\n${texto}`;
    const resposta = await perguntarIaPrompt(prompt, { logLabel: "Nana/IA" });

    return sendChunkedReply(message, resposta);
  } catch (err) {
    console.log("🔥 Erro no comando de texto:", err.message);
    return message.reply("⚠️ Erro ao contatar a IA.");
  }
}

async function handleQuestionCommand(message) {
  const texto = getCommandText(message, ["!question"]);
  if (!texto) {
    return message.reply("Digite a pergunta: `!question quais são os mapas de Path of Exile?`");
  }

  if (config.AI_PROVIDER !== "gemini_cli" && isPerguntaMapasPathOfExile(texto)) {
    console.log("🧭 [Question/Fixo] Respondendo mapas de Path of Exile sem chamar LLM.");
    return message.reply({
      content: respostaMapasPathOfExile(),
      allowedMentions: { repliedUser: false, parse: [] }
    });
  }

  try {
    const resposta = await perguntarQuestion(texto);

    return sendChunkedReply(message, resposta);
  } catch (err) {
    console.log("🔥 Erro no comando !question:", err.message);
    if (isPerguntaMapasPathOfExile(texto)) {
      console.log("🧭 [Question/Fixo] Usando resposta segura de mapas de Path of Exile após falha do provider.");
      return message.reply({
        content: respostaMapasPathOfExile(),
        allowedMentions: { repliedUser: false, parse: [] }
      });
    }
    return message.reply("⚠️ Erro ao processar a pergunta pela IA.");
  }
}

async function handleClearCommand(message, text) {
  let amount = 100;
  let mode = "bot";
  
  if (text) {
    const args = text.toLowerCase().trim().split(/\s+/);
    for (const arg of args) {
      if (arg === "cmd" || arg === "cmds") {
        mode = "cmd";
      } else {
        const parsed = parseInt(arg, 10);
        if (!isNaN(parsed) && parsed > 0) {
          amount = parsed > 100 ? 100 : parsed;
        }
      }
    }
  }

  try {
    const fetched = await message.channel.messages.fetch({ limit: amount });
    let targetMessages;
    
    if (mode === "bot") {
      targetMessages = fetched.filter(m => m.author.id === message.client.user.id);
    } else if (mode === "cmd") {
      targetMessages = fetched.filter(m => m.content.startsWith("!"));
    }
    
    if (targetMessages.size > 0) {
      try {
        await message.channel.bulkDelete(targetMessages, true);
      } catch (e) {
        for (const m of targetMessages.values()) {
          await m.delete().catch(() => {});
        }
      }
      const tipoMsg = mode === "bot" ? "minhas" : "de comandos";
      const reply = await message.channel.send(`🧹 Limpei ${targetMessages.size} mensagens ${tipoMsg}!`);
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } else {
      const reply = await message.reply("Não encontrei nenhuma mensagem para limpar nessas últimas mensagens.");
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    }
    
    message.delete().catch(() => {});
  } catch (err) {
    console.error("🔥 Erro no comando !clear:", err);
    message.reply("⚠️ Erro ao limpar mensagens.");
  }
}

async function handleMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  coletarGifs(message);
  cachearMensagem(message);
  maybeExtrairFofocas(message);
  checkAndSpawnEvent(message);
  checkAndSendTip(message);

  if (isPrisioneiro(message.author.id) && isCommand(message, ["!roubar", "!games"])) {
    return message.reply("🚓 Você está na prisão! Presidiários não podem jogar, duelar ou roubar.");
  }

  if (checkForcaGuess(message)) {
    return;
  }

  if (isCommand(message, ["!help"])) {
    return message.reply({
      embeds: [buildHelpEmbed()],
      allowedMentions: { repliedUser: false, parse: [] }
    });
  }

  if (isCommand(message, ["!new"])) {
    return message.reply({
      embeds: [buildNewEmbed()],
      allowedMentions: { repliedUser: false, parse: [] }
    });
  }

  if (isCommand(message, ["!f"])) {
    return handleVoiceCommand(message, getCommandText(message, ["!f"]));
  }

  if (isCommand(message, ["!clear"])) {
    return handleClearCommand(message, getCommandText(message, ["!clear"]));
  }

  if (isCommand(message, ["!reels", "!reel"])) {
    return handleReelsCommand(message);
  }

  if (isCommand(message, ["!games"])) {
    const { handleGamesCommand } = require("../games/menu");
    return handleGamesCommand(message);
  }

  if (isCommand(message, ["!roubar"])) {
    return handleRoubarCommand(message, getCommandText(message, ["!roubar"]));
  }

  if (isCommand(message, ["!doar"])) {
    const text = getCommandText(message, ["!doar"]);
    return handleDoarCommand(message, text);
  }

  if (isCommand(message, ["!trade"])) {
    return message.reply("Use `!bolsa` para negociar itens e armas.");
  }

  if (isCommand(message, ["!timeout"])) {
    return handleTimeoutCommand(message);
  }

  if (isCommand(message, ["!fianca", "!fiança", "!suborno"])) {
    return handleFiancaCommand(message);
  }

  if (isCommand(message, ["!parrudo"])) {
    return handleParrudoCommand(message, getCommandText(message, ["!parrudo"]));
  }

  if (isCommand(message, ["!loja", "!boost", "!boosts"])) {
    return handleBoostCommand(message);
  }

  if (isCommand(message, ["!bolsa"])) {
    return handleMarketCommand(message);
  }

  if (isCommand(message, ["!raid"])) {
    return handleRaidCommand(message, getCommandText(message, ["!raid"]));
  }

  if (isCommand(message, ["!inventario", "!inv"])) {
    return handleInventoryCommand(message);
  }

  if (isCommand(message, ["!armas"])) {
    const { handleCraftWeaponsCommand } = require("../economy/forge");
    return handleCraftWeaponsCommand(message);
  }

  if (isCommand(message, ["!equipar"])) {
    return handleEquipWeaponCommand(message, getCommandText(message, ["!equipar"]));
  }

  if (isCommand(message, ["!beijarmuro", "!bejarmuro"])) {
    return handleBeijarMuroCommand(message);
  }

  if (isCommand(message, ["!daily", "!diario"])) {
    const { handleDailyCommand } = require("../economy/inventory");
    return handleDailyCommand(message);
  }

  if (isCommand(message, ["!fliperama", "!lootbox"])) {
    const { handleFliperamaCommand } = require("../economy/fliperama");
    return handleFliperamaCommand(message);
  }

  if (await handleAdminCommand(message)) return;

  if (isCommand(message, ["!saldo", "!nanacoins", "!atm", "!dinheiro"])) {
    const coins = getCoins(message.author.id);
    const topPlayers = getTopPlayers(100);
    const myRank = topPlayers.findIndex(p => p.id === message.author.id) + 1;
    const rankStr = myRank > 0 ? `#${myRank}` : 'Não rankeado';
    const { formatCoins } = require("../economy/economy");

    const embed = new EmbedBuilder()
      .setColor('#000000') // Estilo Cartão Black
      .setTitle('💳 BANCO NANACOIN')
      .setDescription(`Extrato bancário de **${message.author.username}**`)
      .addFields(
        { name: '💵 Saldo Disponível', value: `\`🪙 ${formatCoins(coins)} Nanacoins\``, inline: true },
        { name: '🏆 Posição no Rank', value: `\`${rankStr}\``, inline: true }
      )
      .setFooter({ text: 'Dica: Use !loja para gastar ou !roubar para tentar a sorte.' });

    return message.reply({ embeds: [embed] });
  }

  if (isCommand(message, ["!rank", "!top"])) {
    const topPlayers = getTopPlayers(10);
    if (topPlayers.length === 0) {
      return message.reply("Ninguém tem dinheiro ainda. Abram `!games` e joguem alguma coisa!");
    }
    const { formatCoins } = require("../economy/economy");
    
    let rankText = "";
    for (let i = 0; i < topPlayers.length; i++) {
      const p = topPlayers[i];
      let username = "Desconhecido";
      try {
        const user = message.client.users.cache.get(p.id) || await message.client.users.fetch(p.id);
        username = user ? user.username : p.id;
      } catch(e) {
        username = `User-${p.id.slice(-4)}`;
      }
      
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🔹";
      
      let formattedName = username;
      if (i === 0) formattedName = `👑 **${username.toUpperCase()}**`;
      else if (i === 1) formattedName = `**${username}**`;
      else if (i === 2) formattedName = `*${username}*`;
      
      rankText += `${medal} **#${i + 1}** ${formattedName} — \`${formatCoins(p.balance)} 🪙\`\n`;
    }

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏆 RANKING GLOBAL - TOP 10 MAIS RICOS')
      .setDescription(rankText)
      .setFooter({ text: 'A corrida pelo dinheiro virtual está insana!' });

    return message.reply({ embeds: [embed] });
  }

  if (isCommand(message, ["!nana"])) {
    return handleTextCommand(message);
  }

  if (isCommand(message, ["!question"])) {
    return handleQuestionCommand(message);
  }

  if (isCommand(message, ["!img", "!anime"])) {
    const isAnime = isCommand(message, ["!anime"]);
    const cmd = isAnime ? "!anime" : "!img";
    const prompt = getCommandText(message, ["!img", "!anime"]);
    return handleImageCommand(message, { prompt, isAnime, cmd });
  }

  return maybeResponderEspontaneo(message);
}

function start(options = {}) {
  const testMode = options.testMode === true;
  const testChannelId = config.static.app.test?.channelId;
  const client = createClient();
  client.botTtsTestMode = testMode;
  client.botTtsTestChannelId = testChannelId;

  client.once("clientReady", () => {
    console.log("=========================================");
    console.log(`✅ Bot conectado ao Discord: ${client.user.tag}`);
    console.log("=========================================");
    if (testMode) {
      console.log(`🧪 [AVISO] MODO DE TESTE ATIVO! Escutando apenas no canal ID: ${testChannelId}`);
    }
    
    console.log("⚙️  Inicializando Ecossistema e Módulos...");
    console.log(" ├─ 📦 Loja e Estoque Virtual: OK");
    console.log(" ├─ 📈 Bolsa de Valores (Market): OK");
    console.log(" ├─ 🔨 Forja, Buffs e Crafting: OK");
    console.log(" ├─ 🐉 Eventos de World Boss: OK");
    console.log(" └─ ⚔️  Raids entre Servidores: OK");
    
    const { getActiveOrders } = require("../economy/market");
    const marketCount = getActiveOrders().length;
    console.log(`\n📊 Status Atual: ${marketCount} ordens na Bolsa.`);
    
    console.log("⏳ Agendando eventos e Raids ativas...");
    scheduleExistingRaids(client);
    startVideoScheduler(client);
    
    console.log("✨ Tudo pronto! O BotTTs já está escutando comandos.");
  });

  client.on("messageCreate", (message) => {
    if (testMode && message.channelId !== testChannelId) return;
    handleMessage(message).catch((err) => {
      console.error("🔥 Erro inesperado no messageCreate:", err);
    });
  });
  client.on("interactionCreate", async (interaction) => {
    try {
      if (testMode && interaction.channelId !== testChannelId) {
        if (interaction.isRepliable?.()) {
          await interaction.reply({ content: "🧪 Este bot de teste só responde no canal de testes.", ephemeral: true }).catch(() => null);
        }
        return;
      }

      if (await handleEventInteraction(interaction)) return;
      if (await handleForcaThemeInteraction(interaction)) return;
      
      if (await handleMarketInteraction(interaction)) return;
      if (await handleRaidInteraction(interaction)) return;
      if (await handleReelsInteraction(interaction)) return;

      if (
        interaction.customId?.startsWith('boost_select_')
        || interaction.customId?.startsWith('shop_cat_')
        || interaction.customId?.startsWith('weapon_select_')
      ) {
        await handleBoostInteraction(interaction);
        return;
      }

      const { handleInventoryInteraction } = require("../economy/weapons");
      if (await handleInventoryInteraction(interaction)) return;

      const { handleForgeInteraction } = require("../economy/forge");
      if (await handleForgeInteraction(interaction)) return;

      const { handleBossInteraction } = require("../games/boss");
      if (await handleBossInteraction(interaction)) return;

      const { handleGamesInteraction } = require("../games/menu");
      if (await handleGamesInteraction(interaction)) return;

      const { handleFliperamaInteraction } = require("../economy/fliperama");
      if (await handleFliperamaInteraction(interaction)) return;

      // Existing handlers at the end
      handleButtonInteraction(interaction).catch((err) => {
        if (err.code !== 10062) console.error("🔥 Erro inesperado no duelo interactionCreate:", err);
      });
      handleRpgInteraction(interaction).catch((err) => {
        if (err.code !== 10062) console.error("🔥 Erro inesperado no rpg interactionCreate:", err);
      });

    } catch (err) {
      if (err.code !== 10062) console.error("🔥 Erro inesperado no evento interactionCreate:", err);
    }
  });

  return client.login(config.DISCORD_TOKEN);
}

module.exports = {
  start
};
