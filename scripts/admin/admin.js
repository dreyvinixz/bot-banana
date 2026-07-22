const path = require("path");
const fs = require("fs");
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
  if (command.startsWith("!setup_cargos_info") || command.startsWith("!setup_cargos")) {
    return handleSetupCargosInfoCommand(message);
  }
  if (command.startsWith("!setup_avisos") || command.startsWith("!anunciar_novidades")) {
    return handleSetupAvisosCommand(message);
  }
  if (command.startsWith("!setup_publi")) {
    return handleSetupPubliCommand(message);
  }
  if (command.startsWith("!setup_competicoes") || command.startsWith("!setup_competicao")) {
    return handleSetupCompeticoesCommand(message);
  }
  if (command.startsWith("!setup_caixa_info")) {
    return handleSetupCaixaInfoCommand(message);
  }
  if (command.startsWith("!setup_reviews")) {
    return handleSetupReviewsCommand(message);
  }
  if (command.startsWith("!setup_familia")) {
    const { handleSetupFamiliaCommand } = require("../features/familia");
    return handleSetupFamiliaCommand(message);
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
  let channel = guild.channels.cache.get("1528288021437354004") || guild.channels.cache.find(c => c.name.includes("avisos"));
  if (!channel) channel = interactionOrMessage.channel;

  if (!channel) {
    const errorMsg = "❌ Canal de avisos não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const { AttachmentBuilder } = require("discord.js");
    const path = require("path");
    const fs = require("fs");

    const bannerKabarePath = path.join(process.cwd(), "assets", "banner_kabare.png");
    let files = [];
    if (fs.existsSync(bannerKabarePath)) {
      files.push(new AttachmentBuilder(bannerKabarePath, { name: "banner_kabare.png" }));
    }

    const embedAvisos = new EmbedBuilder()
      .setColor("#8A2BE2")
      .setTitle("🔮 CENTRAL DE ANÚNCIOS — NOVIDADES DO CABERÉ!")
      .setDescription("Chegaram super novidades e atualizações gigantes no servidor! Fiquem por dentro de tudo o que foi implementado para melhorar a nossa comunidade:")
      .addFields(
        {
          name: "🖼️ Novo Banner Oficial do Servidor",
          value: "Apresentamos o nosso novo banner temático exclusivo em roxo com estilo anime do **Caberé**! Deixem o servidor ainda mais bonito de compartilhar!"
        },
        {
          name: "⚡ Novo Sistema de XP e Níveis (`!xp` / `!nivel`)",
          value: "Agora toda mensagem que você envia gera experiência (XP)! Suba de nível para desbloquear cargos automáticos, permissões exclusivas (mídias, links) e bônus progressivos. Use `!xp` para ver seu nível e `!rankxp` para ver os líderes!"
        },
        {
          name: "💖 Verificação da Família Caberé (+200% XP)",
          value: "Quer se destacar e evoluir 3x mais rápido? Adicione o convite `https://discord.gg/gNu3daPca` no seu Status do Discord ou BIO e clique no botão de verificação no canal da família para receber o cargo exclusivo **@💖 Família Caberé** e **+200% de XP**!"
        },
        {
          name: "👑 Nova Central de Cargos & Benefícios",
          value: "Confira todas as recompensas de nível e tempo em chamadas de voz no canal de cargos!"
        },
        {
          name: "🎬 Sistema de Reels & Entretenimento (`!reels`)",
          value: "Os canais de mídia agora contam com o envio diário de vídeos reels divertidos, além do painel `!reels` para você mandar seus vídeos favoritos!"
        }
      )
      .setFooter({ text: "© Caberé — BotBanana • Todos os direitos reservados." })
      .setTimestamp();

    if (files.length > 0) {
      embedAvisos.setImage("attachment://banner_kabare.png");
    }

    await channel.send({ 
      content: "@here 📢 **ATENÇÃO FAMÍLIA CABERÉ — NOVIDADES E NOVO BANNER DO SERVIDOR!**", 
      embeds: [embedAvisos],
      files: files
    });

    const successMsg = `✅ Anúncio oficial com o novo banner publicado com sucesso no canal <#${channel.id}> com menção @here!`;
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

async function handleSetupPubliCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  let channel = guild.channels.cache.get("1529582031116173323") || guild.channels.cache.find(c => c.name.includes("publi") || c.name.includes("parceria"));
  if (!channel) channel = interactionOrMessage.channel;

  if (!channel) {
    const errorMsg = "❌ Canal de divulgações/publi não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const embedPubli = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("📢 CENTRAL DE DIVULGAÇÕES & PARCERIAS — CABERÉ")
      .setDescription("Espaço dedicado para divulgações oficiais, parceiros da comunidade e projetos apoiados pelo servidor.")
      .addFields(
        {
          name: "📌 Diretrizes de Divulgação",
          value: [
            "• É proibido divulgar conteúdos ofensivos, ilícitos ou links maliciosos.",
            "• Divulgações de outros servidores do Discord devem ser negociadas com a Staff.",
            "• Para fechar parcerias ou solicitar publi oficial, abra um ticket no canal de suporte."
          ].join("\n")
        },
        {
          name: "🤝 Como se tornar um Parceiro?",
          value: "Servidores ou criadores de conteúdo que possuem público ativo podem solicitar o cargo de **Parceiro Oficial** com acesso a divulgações cruzadas no Caberé."
        }
      )
      .setFooter({ text: "Equipe Caberé — Divulgações & Parcerias" })
      .setTimestamp();

    await channel.send({
      content: "# 📢 Canal de Divulgações & Parcerias",
      embeds: [embedPubli]
    });

    const successMsg = `✅ Painel de divulgações/publi configurado com sucesso no canal <#${channel.id}>!`;
    if (isMessage) {
      await interactionOrMessage.reply(successMsg);
    } else {
      await interactionOrMessage.editReply(successMsg);
    }
  } catch (error) {
    console.error(error);
    const errorMsg = "❌ Erro ao configurar canal de publi.";
    if (isMessage) {
      await interactionOrMessage.reply(errorMsg);
    } else {
      await interactionOrMessage.editReply(errorMsg);
    }
  }
}

async function handleSetupCompeticoesCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  let channel = guild.channels.cache.get("1528288038826934312") || guild.channels.cache.find(c => c.name.includes("competi") || c.name.includes("torneio"));
  if (!channel) channel = interactionOrMessage.channel;

  if (!channel) {
    const errorMsg = "❌ Canal de competições não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const embedComp = new EmbedBuilder()
      .setColor("#FF4500")
      .setTitle("⚔️ ARENA DE COMPETIÇÕES & TORNEIOS — CABERÉ")
      .setDescription("Bem-vindo à arena oficial de desafios e eventos do Caberé! Aqui acontecem as maiores disputas da nossa comunidade.")
      .addFields(
        {
          name: "🐉 Eventos de World Boss & Raids Globais",
          value: "Monstros épicos invadem os canais do servidor! Ataque os chefões para ganhar prêmios gigantescos em Nanacoins 🪙 e cargos exclusivos."
        },
        {
          name: "⚔️ Torneios de Duelo RPG (`!duelo`)",
          value: "Desafie outros membros para duelos valendo prêmios no chat! Prove quem é o verdadeiro campeão do servidor."
        },
        {
          name: "🏆 Placar dos Campeões & Nível (`!rankxp`)",
          value: "Os membros mais ativos e vitoriosos garantem vagas no Hall da Fama do Caberé e ganham cargos especiais de destaque."
        },
        {
          name: "🎁 Premiações & Recompensas",
          value: "Nanacoins 🪙 no Banco, VIPs exclusivos, bônus de XP e títulos lendários para os vencedores de cada competição."
        }
      )
      .setFooter({ text: "Boa sorte a todos os gladiadores!" })
      .setTimestamp();

    await channel.send({
      content: "# ⚔️ Arena de Competições & Torneios Caberé",
      embeds: [embedComp]
    });

    const successMsg = `✅ Painel de competições configurado com sucesso no canal <#${channel.id}>!`;
    if (isMessage) {
      await interactionOrMessage.reply(successMsg);
    } else {
      await interactionOrMessage.editReply(successMsg);
    }
  } catch (error) {
    console.error(error);
    const errorMsg = "❌ Erro ao configurar canal de competições.";
    if (isMessage) {
      await interactionOrMessage.reply(errorMsg);
    } else {
      await interactionOrMessage.editReply(errorMsg);
    }
  }
}

async function getOrFetchRoleTag(guild, roleName, iconFileName = null) {
  if (!guild || !guild.roles) return `@${roleName}`;
  const nameLower = roleName.toLowerCase();
  let role = guild.roles.cache.find(r => r.name.toLowerCase().includes(nameLower));
  if (!role) {
    try {
      await guild.roles.fetch().catch(() => null);
      role = guild.roles.cache.find(r => r.name.toLowerCase().includes(nameLower));
    } catch (e) {}
  }

  // Tentar atribuir o favicon como ícone oficial do cargo (se o servidor tiver Nível 2 de Boost)
  if (role && iconFileName) {
    const iconPath = path.join(process.cwd(), "assets", "favicons", iconFileName);
    if (fs.existsSync(iconPath)) {
      try {
        await role.setIcon(iconPath).catch(() => null);
      } catch (e) {}
    }
  }

  return role ? `<@&${role.id}>` : `@${roleName}`;
}

async function getFaviconEmoji(guild, emojiName, fileName) {
  if (!guild || !guild.emojis) return "";
  const cleanName = emojiName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

  let emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === cleanName);
  if (emoji) {
    return `<:${emoji.name}:${emoji.id}>`;
  }

  const faviconPath = path.join(process.cwd(), "assets", "favicons", fileName);
  if (fs.existsSync(faviconPath)) {
    try {
      emoji = await guild.emojis.create({ attachment: faviconPath, name: cleanName }).catch(() => null);
      if (emoji) return `<:${emoji.name}:${emoji.id}>`;
    } catch (e) {}
  }

  return "";
}

async function handleSetupCargosInfoCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  let channel = guild.channels.cache.get("1528288022909423797") || guild.channels.cache.find(c => c.name.includes("cargo") || c.name.includes("cargos"));
  if (!channel) {
    channel = interactionOrMessage.channel;
  }

  if (!channel) {
    const errorMsg = "❌ Canal de cargos não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const { AttachmentBuilder } = require("discord.js");
    const path = require("path");
    const fs = require("fs");

    // Tentar carregar/registrar os Favicons como Emojis do Servidor
    const icMembro = (await getFaviconEmoji(guild, "cargos_membro", "membro.webp")) || "🥚";
    const icGhost = (await getFaviconEmoji(guild, "cargos_ghost", "ghost.webp")) || "🪑";
    const icVampire = (await getFaviconEmoji(guild, "cargos_vampire", "vampire.webp")) || "💬";
    const icDemon = (await getFaviconEmoji(guild, "cargos_demon", "demon.webp")) || "🤡";
    const icKing = (await getFaviconEmoji(guild, "cargos_king", "king.webp")) || "👑";
    const icVoice = (await getFaviconEmoji(guild, "cargos_voice", "voice_icon.webp")) || "🎙️";
    const icAtivo = (await getFaviconEmoji(guild, "cargos_ativo", "ativo.webp")) || "⚡";
    const icSuperAtivo = (await getFaviconEmoji(guild, "cargos_superativo", "superativo.webp")) || "🔥";
    const icExtremamente = (await getFaviconEmoji(guild, "cargos_extremamente", "extremamente_ativo.webp")) || "💥";
    const icAngel = (await getFaviconEmoji(guild, "cargos_angel", "angel.webp")) || "💖";

    // Buscar as menções reais dos cargos do servidor
    const rChegou = await getOrFetchRoleTag(guild, "Chegou Agora", "membro.webp");
    const rSentou = await getOrFetchRoleTag(guild, "Sentou na Resenha", "ghost.webp");
    const rCasa = await getOrFetchRoleTag(guild, "Já É de Casa", "vampire.webp");
    const rCaos = await getOrFetchRoleTag(guild, "Agente do Caos", "demon.webp");
    const rLenda = await getOrFetchRoleTag(guild, "Lenda da Resenha", "king.webp");

    const rVoz1 = await getOrFetchRoleTag(guild, "Voz Promissora", "voice_icon.webp");
    const rVoz2 = await getOrFetchRoleTag(guild, "Amante das Conversas", "voice_icon.webp");
    const rVoz3 = await getOrFetchRoleTag(guild, "Mestre das Calls", "voice_icon.webp");
    const rVoz4 = await getOrFetchRoleTag(guild, "Dono de Podcast", "voice_icon.webp");
    const rVoz5 = await getOrFetchRoleTag(guild, "Voz Suprema", "king.webp");

    const rAtivo1 = await getOrFetchRoleTag(guild, "Ativo", "ativo.webp");
    const rAtivo2 = await getOrFetchRoleTag(guild, "Super Ativo", "superativo.webp");
    const rAtivo3 = await getOrFetchRoleTag(guild, "Extremamente Ativo", "extremamente_ativo.webp");
    const rFamilia = await getOrFetchRoleTag(guild, "Família Caberé", "angel.webp");

    const bannerCargosPath = path.join(process.cwd(), "assets", "banner_cargos.png");
    let files = [];
    let hasBanner = false;

    if (fs.existsSync(bannerCargosPath)) {
      files.push(new AttachmentBuilder(bannerCargosPath, { name: "banner_cargos.png" }));
      hasBanner = true;
    }

    const embedHeader = new EmbedBuilder()
      .setColor("#E60023")
      .setTitle("👑 CABERÉ CARGOS — Sistema de Progressão e Vantagens")
      .setDescription("No **Caberé**, cada função faz a diferença! Possuímos um sistema completo de evolução onde sua atividade no servidor te concede cargos de prestígio, permissões especiais e bônus em experiência.\n\nParticipe ativamente nos canais de texto e de voz para subir de nível e conquistar cada recompensa!")
      .addFields(
        {
          name: "✢ Cargos por Nível (Canais de Texto) ✢",
          value: [
            `${icMembro} ${rChegou} • Nível 1`,
            `${icGhost} ${rSentou} • Nível 10`,
            `${icVampire} ${rCasa} • Nível 25`,
            `${icDemon} ${rCaos} • Nível 50`,
            `${icKing} ${rLenda} • Nível 100`
          ].join("\n")
        },
        {
          name: "✢ Cargos por Tempo de Call (Voz) ✢",
          value: [
            `${icVoice} ${rVoz1} • 7 horas em Call`,
            `${icVoice} ${rVoz2} • 24 horas em Call`,
            `${icVoice} ${rVoz3} • 72 horas em Call`,
            `${icVoice} ${rVoz4} • 168 horas em Call`,
            `${icKing} ${rVoz5} • 336 horas em Call`
          ].join("\n")
        },
        {
          name: "✢ Cargos por Atividade Semanal ✢",
          value: [
            `${icAtivo} ${rAtivo1} • 500 Mensagens enviadas em 7 dias`,
            `${icSuperAtivo} ${rAtivo2} • 1.500 Mensagens enviadas em 7 dias`,
            `${icExtremamente} ${rAtivo3} • 3.000 Mensagens enviadas em 7 dias`
          ].join("\n")
        }
      );

    if (hasBanner) {
      embedHeader.setImage("attachment://banner_cargos.png");
    }

    const embedBeneficios = new EmbedBuilder()
      .setColor("#DC143C")
      .setTitle("🎁 Benefícios e Desbloqueios por Nível")
      .setDescription("Confira o que você desbloqueia conforme avança de nível no servidor:")
      .addFields(
        {
          name: `🌱 Nível 1 — ${rChegou}`,
          value: "• Permissão para alterar seu próprio apelido no servidor."
        },
        {
          name: `🪑 Nível 10 — ${rSentou}`,
          value: "• Permissão para enviar mídias e arquivos nos chats principais."
        },
        {
          name: `💬 Nível 25 — ${rCasa}`,
          value: "• Permissão para enviar links integrados nos canais de texto;\n• **+50% de bônus de XP** no ganho de experiência das mensagens."
        },
        {
          name: `🤡 Nível 50 — ${rCaos}`,
          value: "• Acesso aos canais VIPs e Camarim exclusivo;\n• **+100% de bônus de XP** (2x XP por mensagem);\n• Imunidade a limites de maiúsculas (Caps Lock) pelo AutoMod."
        },
        {
          name: `👑 Nível 100 — ${rLenda}`,
          value: "• Destaque no topo da lista de membros;\n• **+200% de bônus de XP** (3x XP por mensagem);\n• Imunidade contra duplicação de caracteres e limites de emojis;\n• Acesso completo aos chats de alta relevância."
        },
        {
          name: "💖 Bônus Extra: Família Caberé (+200% XP)",
          value: `Coloque o convite oficial do servidor em seu Status do Discord ou BIO e use o botão no canal da família para receber o cargo exclusivo ${rFamilia} e um bônus imediato de **+200% de XP (3x Total)**!`
        },
        {
          name: "📊 Como consultar seu Nível e Ranking?",
          value: "• Digite `!xp` ou `!nivel` para ver suas estatísticas, nível e barra de progresso.\n• Digite `!rankxp` ou `!topxp` para visualizar o Placar dos Líderes do servidor."
        }
      )
      .setFooter({ text: "© Caberé — Todos os direitos reservados." })
      .setTimestamp();

    await channel.send({
      content: "# 🎭 Central de Cargos e Benefícios — Caberé",
      embeds: [embedHeader, embedBeneficios],
      files: files
    });

    const successMsg = `✅ Informações do painel de cargos publicadas com sucesso no canal <#${channel.id}>!`;
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

async function handleSetupReviewsCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  const channel = guild.channels.cache.find(c => c.name.includes("reviews"));

  if (!channel) {
    const errorMsg = "❌ Canal 'reviews-do-kabaré' não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const embedReviews = new EmbedBuilder()
      .setColor("#FF1493")
      .setTitle("⭐ Diretrizes do Fórum: Reviews do Caberé")
      .setDescription("Espaço dedicado para a comunidade mandar veredito, críticas e opiniões sobre **jogos, filmes, séries, animes, mídias e experiências**!")
      .addFields(
        { name: "📌 Como criar uma boa Review?", value: "• **Título Claro:** Coloque o nome da obra/produto e sua nota (ex: `[Jogo] Cyberpunk 2077 - ⭐ 4.5/5`).\n• **Resumo sem Spoilers:** Dê sua opinião geral sobre história, jogabilidade, gráficos ou som.\n• **Prós & Contras:** Destaque os pontos fortes e os pontos fracos.\n• **Veredito:** Vale o seu tempo e o seu dinheiro?" },
        { name: "⚠️ Regras do Fórum", value: "• **Spoilers:** É **OBRIGATÓRIO** usar a tag de spoiler `||texto ou imagem||` para revelar partes importantes da história!\n• **Respeito de Opiniões:** Respeite o gosto alheio. Debater e discordar faz parte, mas ataques pessoais não serão tolerados.\n• **Tags Apropriadas:** Selecione a tag correta ao criar a postagem (🎮 Jogos, 🎬 Filmes/Séries, 🌸 Animes, 🎵 Música, 🤖 Tech/Bots)." }
      )
      .setFooter({ text: "Equipe Caberé — BotBanana 🍌" })
      .setThumbnail(guild.iconURL({ dynamic: true }) || null);

    if (channel.isThreadOnly?.() || channel.threads) {
      await channel.threads.create({
        name: "📌 [LEIA ANTES DE POSTAR] Diretrizes e Regras do Fórum",
        message: {
          content: "# 😉 Diretrizes e Manual do Fórum Reviews do Caberé",
          embeds: [embedReviews]
        }
      }).catch(async () => {
        await channel.send?.({ content: "# 😉 Diretrizes do Fórum Reviews do Caberé", embeds: [embedReviews] }).catch(() => null);
      });
    } else {
      await channel.send({
        content: "# 😉 Diretrizes do Fórum Reviews do Caberé",
        embeds: [embedReviews]
      });
    }

    const successMsg = "✅ Diretrizes de Reviews enviadas para o fórum!";
    if (isMessage) {
      await interactionOrMessage.reply(successMsg);
    } else {
      await interactionOrMessage.editReply(successMsg);
    }
  } catch (error) {
    console.error(error);
    const errorMsg = "❌ Erro ao configurar canal de reviews.";
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
  handleSetupPubliCommand,
  handleSetupCompeticoesCommand,
  handleSetupCaixaInfoCommand,
  handleSetupReviewsCommand
};
