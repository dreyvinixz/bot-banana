const config = require("../core/config");
const { EmbedBuilder } = require("discord.js");

function isSuperAdmin(userId) {
  return config.SUPERADMIN_IDS.includes(String(userId));
}

function getUserId(ctx) {
  return ctx?.author?.id || ctx?.user?.id || "";
}

async function requireSuperAdmin(ctx) {
  if (isSuperAdmin(getUserId(ctx))) return true;

  const payload = "❌ Apenas o Superadmin pode usar este comando!";
  if (typeof ctx.reply === "function") {
    await ctx.reply(payload).catch?.(() => null);
  }
  return false;
}

async function handleSpawnBossCommand(message) {
  if (!(await requireSuperAdmin(message))) return true;

  const { spawnWorldBoss } = require("../games/boss");
  const { resetBossTimer, getEventChannelsForMessage } = require("../games/forca");

  resetBossTimer();

  const bossChannels = await getEventChannelsForMessage(message);

  if (bossChannels.length > 0) {
    await spawnWorldBoss(bossChannels);
    const targetText = message.client.botTtsTestMode ? "no canal de teste" : "em todos os canais de evento";
    await message.reply(`✅ World Boss sumonado com sucesso ${targetText}! O contador de 12h foi resetado.`).catch(() => message.channel.send(`✅ World Boss sumonado com sucesso ${targetText}! O contador de 12h foi resetado.`).catch(() => null));
  } else {
    await message.reply("❌ Não foi possível encontrar os canais de evento.").catch(() => null);
  }
  return true;
}

async function handleSpawnMiniBossCommand(message) {
  if (!(await requireSuperAdmin(message))) return true;

  const { spawnMiniBoss } = require("../games/boss");
  const { getEventChannelsForMessage } = require("../games/forca");

  const bossChannels = await getEventChannelsForMessage(message);

  if (bossChannels.length > 0) {
    await spawnMiniBoss(bossChannels);
    const targetText = message.client.botTtsTestMode ? "no canal de teste" : "nos canais de evento";
    await message.reply(`✅ Mini Boss sumonado com sucesso ${targetText}!`).catch(() => message.channel.send(`✅ Mini Boss sumonado com sucesso ${targetText}!`).catch(() => null));
  } else {
    await message.reply("❌ Não foi possível encontrar os canais de evento.").catch(() => null);
  }
  return true;
}

async function handleEconAdminCommand(message) {
  if (!(await requireSuperAdmin(message))) return true;

  const { readLedger } = require("../economy/ledger");
  const events = readLedger();

  let coinsCreated = 0;
  let coinsRemoved = 0;
  let marketVolume = 0;
  let marketFees = 0;
  let rerollCount = 0;
  const materialsUsed = new Map();
  const materialsDropped = new Map();
  const materialsSold = new Map();
  const fortifiedWeapons = new Map();
  const topSellers = new Map();

  function addCount(map, key, amount = 1) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + amount);
  }

  function topLines(map, limit = 5) {
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n") || "Sem dados";
  }

  for (const ev of events) {
    if (ev.type === "system_sell") coinsCreated += ev.price || 0;
    if (ev.type === "shop_buy") coinsRemoved += ev.price || 0;
    if (ev.type === "craft_weapon") coinsRemoved += ev.cost || 0;
    if (ev.type === "market_fee") {
      marketFees += ev.fee || ev.amount || 0;
      coinsRemoved += ev.fee || ev.amount || 0;
    }
    if (ev.type === "market_buy") {
      marketVolume += ev.grossAmount || 0;
      addCount(topSellers, ev.targetId, ev.netAmount || 0);
    }
    if (ev.type === "repair_weapon" || ev.type === "fortify_weapon") {
      addCount(materialsUsed, ev.materialId, ev.amount || 1);
    }
    if (ev.type === "combat_buff_used") {
      addCount(materialsUsed, ev.materialId, 1);
    }
    if (ev.type === "craft_weapon") {
      for (const mat of ev.materials || []) addCount(materialsUsed, mat.materialId, mat.amount);
    }
    if (ev.type === "reroll_legendary") {
      rerollCount++;
      addCount(materialsUsed, ev.materialUsed, ev.amountUsed || 1);
    }
    if (ev.type === "boss_material_drop") {
      addCount(materialsDropped, ev.materialId, ev.amount || 1);
    }
    if (ev.type === "system_sell" && ev.itemId) {
      addCount(materialsSold, ev.itemId, ev.amount || 1);
    }
    if (ev.type === "fortify_weapon" && ev.success) {
      addCount(fortifiedWeapons, ev.weaponId, 1);
    }
  }

  const { EmbedBuilder } = require("discord.js");
  const embed = new EmbedBuilder()
    .setColor("#3498DB")
    .setTitle("📊 Painel de Balanceamento: Resumo Econômico")
    .addFields(
      { name: "🪙 Nanacoins Criadas", value: `${coinsCreated}`, inline: true },
      { name: "🔥 Nanacoins Removidas", value: `${coinsRemoved}`, inline: true },
      { name: "🏦 Taxas da Bolsa", value: `${marketFees}`, inline: true },
      { name: "📈 Volume Mercado", value: `${marketVolume}`, inline: true },
      { name: "🌀 Rerolls Lendários", value: `${rerollCount}`, inline: true },
      { name: "🧪 Materiais Mais Usados", value: topLines(materialsUsed), inline: false },
      { name: "🎁 Materiais Mais Dropados", value: topLines(materialsDropped), inline: false },
      { name: "⚡ Materiais Mais Vendidos", value: topLines(materialsSold), inline: false },
      { name: "🔼 Armas Mais Fortificadas", value: topLines(fortifiedWeapons), inline: false },
      { name: "🏪 Top Vendedores da Bolsa", value: topLines(topSellers), inline: false }
    )
    .setFooter({ text: `Total de Eventos: ${events.length}` });

  await message.reply({ embeds: [embed] });
  return true;
}

async function handleSetupRegrasCommand(message) {
  if (!(await requireSuperAdmin(message))) return true;

  const channelId = "1348710840425250836";
  const guildId = "1344557188617732137";
  
  try {
    const guild = message.client.guilds.cache.get(guildId) || await message.client.guilds.fetch(guildId);
    if (!guild) {
      return message.reply("❌ Não encontrei o servidor especificado.");
    }
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
    if (!channel) {
      return message.reply("❌ Não encontrei o canal de regras.");
    }

    const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
    const path = require("path");
    
    // Anexando as imagens da pasta assets
    const img1Path = path.join(process.cwd(), "assets", "regras_banner1.png");
    const img2Path = path.join(process.cwd(), "assets", "regras_banner2.png");
    
    // Pode ocorrer que as imagens não existam durante a execução, criamos um fallback
    let files = [];
    const fs = require("fs");
    if (fs.existsSync(img1Path)) {
      files.push(new AttachmentBuilder(img1Path, { name: "regras_banner1.png" }));
    }
    if (fs.existsSync(img2Path)) {
      files.push(new AttachmentBuilder(img2Path, { name: "regras_banner2.png" }));
    }

    const embed1 = new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle("🎪 Resumo das regras")
      .setDescription("● Respeite os outros membros, mesmo quando discordar.\n● Brincadeiras são permitidas, desde que todos estejam confortáveis.\n● Evite provocar, perseguir ou tentar iniciar brigas com outros membros.\n● Não faça spam, flood ou abuse de menções.\n● Não divulgue servidores, produtos ou links sem autorização.\n● Não use os bots para explorar bugs, prejudicar a economia ou atrapalhar outros membros.\n● Não compartilhe conteúdo ilegal, extremamente ofensivo ou que viole as regras do Discord.\n● Use o bom senso. Se você precisa perguntar \"será que isso vai dar problema?\", provavelmente é melhor perguntar antes a um moderador.\n\n> 🎭 **O objetivo do Caberé é simples: entrar, conversar, jogar, fazer resenha e se divertir.**");

    const embed2 = new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle("⚪ Regras de convivência")
      .setDescription("Estas regras representam o espírito do Caberé. Nem tudo precisa virar punição.\n\n**1. 🤝 Respeito**\nDiscordâncias e discussões fazem parte da comunidade. Ataques pessoais, humilhações e perseguições não.\n\n**2. 🎭 Brincadeiras**\nHumor e zoeira são bem-vindos. Porém, uma brincadeira deixa de ser divertida quando a outra pessoa pede para parar.\n\n**3. 🗣️ Discussões**\nDebater é permitido. Transformar qualquer assunto em uma guerra pessoal não.\n\n**4. 🧠 Bom senso**\nA moderação pode analisar o contexto. Uma mensagem isolada pode ser uma brincadeira; um comportamento repetitivo pode se tornar assédio.\n\n**5. 🛡️ Moderação**\nSe você não concordar com uma decisão, converse com a equipe de forma respeitosa. Discussões públicas intermináveis sobre punições podem acabar piorando a situação.");

    const embed3 = new EmbedBuilder()
      .setColor("#ffcc00")
      .setTitle("🟡 Advertência")
      .setDescription("Normalmente, problemas leves ou uma primeira ocorrência podem resultar em uma conversa ou advertência.\n\nExemplos:\n* spam leve;\n* flood;\n* discussões que saíram do controle;\n* brincadeiras que passaram um pouco do limite;\n* uso inadequado de algum canal;\n* divulgação sem autorização.\n\nA ideia é **corrigir o comportamento**, não punir automaticamente todo erro.");

    const embed4 = new EmbedBuilder()
      .setColor("#ff3333")
      .setTitle("🔴 Strike")
      .setDescription("Um strike pode ser aplicado em casos mais sérios ou quando o comportamento continua após uma advertência.\n\nExemplos:\n* insistir em provocar ou perseguir alguém;\n* assédio;\n* spam repetido;\n* tentar prejudicar deliberadamente a comunidade;\n* abuso de bugs ou sistemas do servidor;\n* divulgação repetida após ser avisado;\n* comportamento tóxico recorrente.\n\n### Sistema de strikes\n* **1 Strike:** registro da infração.\n* **2 Strikes:** a equipe pode aplicar uma punição mais severa.\n* **3 Strikes:** pode resultar em banimento.\n\n> ⚠️ A quantidade de strikes não é necessariamente automática. A equipe pode considerar a gravidade da situação e o histórico do membro.");

    const embed5 = new EmbedBuilder()
      .setColor("#000000")
      .setTitle("💀 Banimento")
      .setDescription("O banimento é reservado para situações graves, como:\n* ameaças reais;\n* doxxing ou exposição de informações pessoais;\n* conteúdo ilegal;\n* ataques discriminatórios graves;\n* tentativa de prejudicar deliberadamente o servidor;\n* contas criadas para trollar, assediar ou causar problemas;\n* golpes, phishing ou tentativas de roubo de contas;\n* reincidência grave após várias punições.");

    const embed6 = new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle("📌 Regra mais importante")
      .setDescription("> **As regras não existem para controlar cada palavra que você fala. Elas existem para impedir que alguém transforme a experiência dos outros em algo ruim.**\n\n🎭 **O Caberé é uma comunidade de amigos, jogos, resenha e diversão.**\n\nA moderação não está aqui para punir cada brincadeira ou discussão. Estamos aqui para garantir que todos possam aproveitar o servidor.\n\n**Seja uma pessoa razoável, respeite os limites dos outros e use o bom senso.**\n\nSe você errar, converse com a equipe. Se você insistir em prejudicar a comunidade, a moderação irá agir.");

    const text1 = "# 🎭 Manual de Convivência do Caberé";

    await channel.send({ content: text1, embeds: [embed1] });
    await channel.send({ embeds: [embed2, embed3, embed4] });
    await channel.send({ embeds: [embed5, embed6] });
    
    // Envia as imagens por último
    if (files.length > 0) {
      await channel.send({ files: files });
    }
    
    await message.reply("✅ Canal de regras configurado com o novo formato do Caberé!");
  } catch (error) {
    console.error(error);
    await message.reply("❌ Ocorreu um erro ao configurar o canal de regras.");
  }
  return true;
}

async function handleAdminCommand(message) {
  const command = message.content.trim().toLowerCase();
  if (command.startsWith("!spawn_boss") || command.startsWith("!spawnboss")) {
    return handleSpawnBossCommand(message);
  }
  if (command.startsWith("!spawn_miniboss") || command.startsWith("!spawn_mini")) {
    return handleSpawnMiniBossCommand(message);
  }
  if (command.startsWith("!econadmin resumo")) {
    return handleEconAdminCommand(message);
  }
  if (command.startsWith("!setup_regras")) {
    return handleSetupRegrasCommand(message);
  }
  if (command.startsWith("!setup_cargos_info")) {
    return handleSetupCargosInfoCommand(message);
  }
  if (command.startsWith("!setup_avisos")) {
    return handleSetupAvisosCommand(message);
  }
  if (command.startsWith("!setup_caixa_info")) {
    return handleSetupCaixaInfoCommand(message);
  }
  return false;
}

async function handleSetupCaixaInfoCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  const channel = guild.channels.cache.find(c => c.name.includes("nanacoins"));

  if (!channel) {
    const errorMsg = "❌ Canal 'nanacoins' não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const embedCaixa = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("💰 Bem-vindo à Caixa do Caberé!")
      .setDescription("Esta categoria é o coração financeiro e de entretenimento do servidor. Entenda para que serve cada canal:")
      .addFields(
        { name: "💰┃nanacoins", value: "Use este canal para os comandos básicos da sua conta bancária. Pegue seu `!diario`, veja seu `!saldo`, transfira moedas e acesse a bolsa de valores (`!bolsa`)." },
        { name: "🏆┃placar", value: "O Hall da Fama! Canal dedicado para você acompanhar o ranking (`!rank`) e ver quem são os verdadeiros milionários do servidor." },
        { name: "🎮┃arcade", value: "O salão de jogos! Hub central de diversão (`!games`). Venha aqui para jogar Forca, Duelo, apostar na sorte com `!beijarmuro` ou tentar `!roubar` os outros (cuidado com a prisão!)." }
      )
      .setFooter({ text: "Dica: Tente não ir para a cadeia logo no primeiro dia!" })
      .setThumbnail(guild.iconURL({ dynamic: true }) || null);

    await channel.send({ 
      content: "# 🎰 Economia e Jogos do Caberé\nLeia abaixo para entender como usar a categoria Caixa do Caberé!", 
      embeds: [embedCaixa] 
    });

    const successMsg = "✅ Informações da Caixa enviadas para o canal!";
    if (isMessage) {
      await interactionOrMessage.reply(successMsg);
    } else {
      await interactionOrMessage.editReply(successMsg);
    }
  } catch (error) {
    console.error(error);
    const errorMsg = "❌ Erro ao configurar canal da Caixa.";
    if (isMessage) {
      await interactionOrMessage.reply(errorMsg);
    } else {
      await interactionOrMessage.editReply(errorMsg);
    }
  }
}

async function handleSetupAvisosCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  const channel = guild.channels.cache.find(c => c.name.includes("avisos"));

  if (!channel) {
    const errorMsg = "❌ Canal de avisos não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const embedAvisos = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("📢 Fique por dentro de tudo!")
      .setDescription("Este é o **Canal Oficial de Avisos** do Caberé.\n\nAqui a Equipe vai postar todas as novidades importantes para a comunidade. Sugerimos que você deixe as notificações deste canal ativadas!")
      .addFields(
        { name: "O que será postado aqui?", value: "• 🆕 Atualizações do Servidor\n• 🤖 Novos comandos e funções do BotBanana\n• 🎉 Anúncio de Eventos e Competições\n• 🎁 Resultados de Sorteios\n• 🐉 Alertas de Invasões (Raids Globais)" },
        { name: "Posso responder?", value: "Apenas membros da equipe podem enviar mensagens aqui para não virar bagunça, mas você pode reagir com emojis em todas as postagens!" }
      )
      .setFooter({ text: "Equipe Caberé - BotBanana" })
      .setThumbnail(guild.iconURL({ dynamic: true }) || null);

    await channel.send({ 
      content: "# 📢 Central de Avisos Caberé", 
      embeds: [embedAvisos] 
    });

    const successMsg = "✅ Informações de avisos enviadas para o canal!";
    if (isMessage) {
      await interactionOrMessage.reply(successMsg);
    } else {
      await interactionOrMessage.editReply(successMsg);
    }
  } catch (error) {
    console.error(error);
    const errorMsg = "❌ Erro ao configurar canal de avisos.";
    if (isMessage) {
      await interactionOrMessage.reply(errorMsg);
    } else {
      await interactionOrMessage.editReply(errorMsg);
    }
  }
}

async function handleSetupCargosInfoCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  const channel = guild.channels.cache.get("1528288022909423797");

  if (!channel) {
    const errorMsg = "❌ Canal de cargos (1528288022909423797) não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const embedConquistas = new EmbedBuilder()
      .setColor("#ffaa00")
      .setTitle("🏆 Cargos de Conquista")
      .setDescription("Estes cargos mostram os seus maiores feitos no servidor e podem ser acumulados!")
      .addFields(
        { name: "🏆 Campeão da Bagaça", value: "Vencedor de eventos e competições do servidor." },
        { name: "💎 Patrono da Baguga", value: "Apoiadores do servidor." },
        { name: "🚀 Booster", value: "Membros que deram Boost (Impulso) no Discord e têm acesso aos Camarins." },
        { name: "🗣️ Women Propaganda", value: "Maior divulgadora do servidor." },
        { name: "💸 Milionário de Taubaté", value: "Ficou rico na economia do BotBanana (use `!saldo`)." },
        { name: "🎁 Mão de Vaca", value: "Acumulador compulsivo de Nanacoins." },
        { name: "📣 Vendedor de Convite", value: "Trouxe novos membros para o Caberé." }
      );

    const embedProgressao = new EmbedBuilder()
      .setColor("#1e90ff")
      .setTitle("📈 Cargos de Progressão (XP)")
      .setDescription("Sua atividade no chat te faz subir de nível. Você só pode ter um desses cargos por vez! Quanto mais você conversa, mais alto chega na hierarquia.")
      .addFields(
        { name: "👑 Lenda da Resenha", value: "Nível Máximo - A maior lenda da comunidade!" },
        { name: "🤡 Agente do Caos", value: "Nível 50 - Você já faz parte da mobília." },
        { name: "💬 Já É de Casa", value: "Nível 25 - Conhece todo mundo." },
        { name: "🪑 Sentou na Resenha", value: "Nível 10 - Acabou de se enturmar." },
        { name: "🥚 Chegou Agora", value: "Nível 1 - Novato no Caberé." }
      );

    const embedEquipe = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle("🛡️ Equipe Caberé")
      .setDescription("Responsáveis por manter a paz (ou o caos organizado) no servidor.")
      .addFields(
        { name: "👑 Rei do Cabaré", value: "Dono do servidor." },
        { name: "🔨 Segurança de Vitrine", value: "Os moderadores que aplicam as regras." }
      )
      .setFooter({ text: "Use o canal de dúvidas caso precise de ajuda!" });

    await channel.send({ 
      content: "# 🎭 Painel de Cargos e Conquistas\nEntenda como funciona a hierarquia do nosso servidor e lute pelos seus cargos!", 
      embeds: [embedProgressao, embedConquistas, embedEquipe] 
    });

    const successMsg = "✅ Informações de cargos enviadas para o canal!";
    if (isMessage) {
      await interactionOrMessage.reply(successMsg);
    } else {
      await interactionOrMessage.editReply(successMsg);
    }
  } catch (error) {
    console.error(error);
    const errorMsg = "❌ Erro ao configurar canal de cargos.";
    if (isMessage) {
      await interactionOrMessage.reply(errorMsg);
    } else {
      await interactionOrMessage.editReply(errorMsg);
    }
  }
}

module.exports = {
  isSuperAdmin,
  requireSuperAdmin,
  handleAdminCommand,
  handleSetupRegrasCommand,
  handleSetupCargosInfoCommand,
  handleSetupAvisosCommand,
  handleSetupCaixaInfoCommand
};
