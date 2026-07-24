const path = require("path");
const fs = require("fs");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const config = require("../core/config");
const { requireSuperAdmin } = require("./adminAuth");

async function getOrFetchRoleTag(guild, roleName, iconFileName = null) {
  if (!guild || !guild.roles) return `@${roleName}`;
  const nameLower = roleName.toLowerCase();
  let role = guild.roles.cache.find(r => r.name.toLowerCase().includes(nameLower));

  if (!role && guild.roles.fetch) {
    try {
      await guild.roles.fetch().catch(() => null);
      role = guild.roles.cache.find(r => r.name.toLowerCase().includes(nameLower));
    } catch (e) { }
  }

  if (role && iconFileName) {
    const iconPath = path.join(process.cwd(), "assets", "favicons", iconFileName);
    if (fs.existsSync(iconPath)) {
      try {
        await role.setIcon(iconPath).catch(() => null);
      } catch (e) { }
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
    } catch (e) { }
  }

  return "";
}

async function handleSetupRegrasCommand(message) {
  if (!(await requireSuperAdmin(message))) return true;

  const channelId = "1348710840425250836";
  const guildId = "1344557188617732137";

  try {
    const guild = message.client.guilds.cache.get(guildId) || await message.client.guilds.fetch(guildId);
    if (!guild) return message.reply("❌ Não encontrei o servidor especificado.");
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
    if (!channel) return message.reply("❌ Não encontrei o canal de regras.");

    const img1Path = path.join(process.cwd(), "assets", "regras_banner1.png");
    const img2Path = path.join(process.cwd(), "assets", "regras_banner2.png");

    let files = [];
    if (fs.existsSync(img1Path)) files.push(new AttachmentBuilder(img1Path, { name: "regras_banner1.png" }));
    if (fs.existsSync(img2Path)) files.push(new AttachmentBuilder(img2Path, { name: "regras_banner2.png" }));

    const embed1 = new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle("🎪 Resumo das regras")
      .setDescription("● Respeite os outros membros, mesmo quando discordar.\n● Brincadeiras são permitidas, desde que todos estejam confortáveis.\n● Evite provocar, perseguir ou tentar iniciar brigas com outros membros.\n● Não faça spam, flood ou abuse de menções.\n● Não divulgue servidores, produtos ou links sem autorização.\n● Não use os bots para explorar bugs, prejudicar a economia ou atrapalhar outros membros.\n● Não compartilhe conteúdo ilegal, extremamente ofensivo ou que viole as regras do Discord.\n● Use o bom senso.\n\n> 🎭 **O objetivo do Caberé é simples: entrar, conversar, jogar, fazer resenha e se divertir.**");

    const embed2 = new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle("⚪ Regras de convivência")
      .setDescription("Estas regras representam o espírito do Caberé. Nem tudo precisa virar punição.\n\n**1. 🤝 Respeito**\nDiscordâncias e discussões fazem parte da comunidade.\n\n**2. 🎭 Brincadeiras**\nHumor e zoeira são bem-vindos.");

    const embed3 = new EmbedBuilder()

    await channel.send({ content: "# 🎭 Manual de Convivência do Caberé", embeds: [embed1] });
    await channel.send({ embeds: [embed2] });
    if (files.length > 0) await channel.send({ files: files });

    await message.reply("✅ Canal de regras configurado com o novo formato do Caberé!");
  } catch (error) {
    console.error(error);
    await message.reply("❌ Ocorreu um erro ao configurar o canal de regras.");
  }
  return true;
}

async function handleSetupCargosInfoCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  let channel = guild.channels.cache.get("1528288022909423797") || guild.channels.cache.find(c => c.name.includes("cargo") || c.name.includes("cargos"));
  if (!channel) channel = interactionOrMessage.channel;
  if (!channel) {
    const errorMsg = "❌ Canal de cargos não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const icMembro = (await getFaviconEmoji(guild, "cargos_membro", "membro.webp")) || "🥚";
    const icGhost = (await getFaviconEmoji(guild, "cargos_ghost", "ghost.webp")) || "🪑";
    const icVampire = (await getFaviconEmoji(guild, "cargos_vampire", "vampire.webp")) || "💬";
    const icDemon = (await getFaviconEmoji(guild, "cargos_demon", "demon.webp")) || "🤡";
    const icKing = (await getFaviconEmoji(guild, "cargos_king", "king.webp")) || "👑";
    const icVoice = (await getFaviconEmoji(guild, "cargos_voice", "voice_icon.webp")) || "🎙️";
    const icAtivo = (await getFaviconEmoji(guild, "cargos_ativo", "ativo.webp")) || "⚡";
    const icSuperAtivo = (await getFaviconEmoji(guild, "cargos_superativo", "superativo.webp")) || "🔥";
    const icExtremamente = (await getFaviconEmoji(guild, "cargos_extremamente", "extremamente_ativo.webp")) || "💥";

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
      .setDescription("No **Caberé**, cada função faz a diferença! Possuímos um sistema completo de evolução onde sua atividade no servidor te concede cargos de prestígio, permissões especiais e bônus em experiência.")
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
        },
        {
          name: "🏆 Cargos Especiais & Conquistas Automáticas 🏆",
          value: [
            "🟢 **Milionário de Taubaté** • Acumular **10.000+ Nanacoins** no banco",
            "🥷 **Ladrão** • Realizar **20+ roubos bem-sucedidos** (`!roubar`)",
            "🏆 **Campeão da Bagaça** • Conquistar **30+ vitórias** nos mini-games (`!games`)",
            "🎁 **Mão de Vaca** • Cumprir pena sem fiança ou acumular fortuna sem doações/compras"
          ].join("\n")
        }
      );

    if (hasBanner) embedHeader.setImage("attachment://banner_cargos.png");

    const embedBeneficios = new EmbedBuilder()
      .setColor("#DC143C")
      .setTitle("🎁 Benefícios e Desbloqueios por Nível")
      .setDescription("Confira o que você desbloqueia conforme avança de nível no servidor:")
      .addFields(
        { name: `🌱 Nível 1 — ${rChegou}`, value: "• Permissão para alterar seu próprio apelido no servidor." },
        { name: `🪑 Nível 10 — ${rSentou}`, value: "• Permissão para enviar mídias e arquivos nos chats principais." },
        { name: `💬 Nível 25 — ${rCasa}`, value: "• Permissão para enviar links integrados;\n• **+50% de bônus de XP**." },
        { name: `🤡 Nível 50 — ${rCaos}`, value: "• Acesso aos canais VIPs;\n• **+100% de bônus de XP** (2x XP)." },
        { name: `👑 Nível 100 — ${rLenda}`, value: "• Destaque no topo;\n• **+200% de bônus de XP** (3x XP)." },
        { name: "💖 Bônus Extra: Família Caberé (+200% XP)", value: `Coloque o convite oficial do servidor em seu Status do Discord ou BIO para receber o cargo exclusivo ${rFamilia} e um bônus de **+200% de XP (3x Total)**!` }
      )
      .setFooter({ text: "© Caberé — Todos os direitos reservados." })
      .setTimestamp();

    await channel.send({
      content: "# 🎭 Central de Cargos e Benefícios — Caberé",
      embeds: [embedHeader, embedBeneficios],
      files: files
    });

    const successMsg = `✅ Informações do painel de cargos publicadas com sucesso no canal <#${channel.id}>!`;
    if (isMessage) await interactionOrMessage.reply(successMsg);
    else await interactionOrMessage.editReply(successMsg);
  } catch (error) {
    console.error(error);
    const errorMsg = "❌ Erro ao configurar canal de cargos.";
    if (isMessage) await interactionOrMessage.reply(errorMsg);
    else await interactionOrMessage.editReply(errorMsg);
  }
}

async function handleSetupAvisosCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  let channel = guild.channels.cache.find(c => c.name.includes("aviso") || c.name.includes("anuncio") || c.name.includes("novidades"));
  if (!channel) channel = interactionOrMessage.channel;
  if (!channel) {
    const errorMsg = "❌ Canal de avisos não encontrado!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  try {
    const bannerKabarePath = path.join(process.cwd(), "assets", "banner_kabare.png");
    let files = [];
    if (fs.existsSync(bannerKabarePath)) {
      files.push(new AttachmentBuilder(bannerKabarePath, { name: "banner_kabare.png" }));
    }

    const embedAvisos = new EmbedBuilder()
      .setColor("#8A2BE2")
      .setTitle("🔮 CENTRAL DE ANÚNCIOS — GRANDES ATUALIZAÇÕES DO BOTBANANA! 🍌")
      .setDescription("Chegaram super novidades e atualizações gigantes no servidor! Fiquem por dentro de tudo:")
      .addFields(
        { name: "🍌 Novo Painel Central (`!menu` / `!hub` / `!painel`)", value: "Acesse todas as funções com 1 clique!" },
        { name: "🛡️ Proteção Parrudo na `!loja`", value: "Compre sua Proteção Parrudo (1h, 2h, 5h, 10h) direto na `!loja`!" },
        { name: "🏆 Novos Cargos Automáticos & Anúncios no Chat Principal", value: "Milionário de Taubaté, Ladrão, Campeão da Bagaça e Mão de Vaca!" },
        { name: "⚡ Níveis, XP e Cargos de Voz (`!xp` / `!nivel`)", value: "Toda mensagem enviada gera XP!" }
      )
      .setFooter({ text: "© Caberé — BotBanana • Todos os direitos reservados." })
      .setTimestamp();

    if (files.length > 0) embedAvisos.setImage("attachment://banner_kabare.png");

    await channel.send({
      content: "@here 📢 **ATENÇÃO FAMÍLIA CABERÉ — NOVIDADES E ATUALIZAÇÕES DO BOT!**",
      embeds: [embedAvisos],
      files: files
    });

    const successMsg = `✅ Anúncio oficial publicado com sucesso no canal <#${channel.id}> com menção @here!`;
    if (isMessage) await interactionOrMessage.reply(successMsg);
    else await interactionOrMessage.editReply(successMsg);
  } catch (error) {
    console.error(error);
    const errorMsg = "❌ Erro ao configurar canal de avisos.";
    if (isMessage) await interactionOrMessage.reply(errorMsg);
    else await interactionOrMessage.editReply(errorMsg);
  }
}

async function handleSetupPubliCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  const channel = guild.channels.cache.find(c => c.name.includes("publi") || c.name.includes("divulgacao"));
  if (!channel) return isMessage ? interactionOrMessage.reply("❌ Canal de publi não encontrado!") : interactionOrMessage.editReply("❌ Canal de publi não encontrado!");

  const embed = new EmbedBuilder()
    .setColor("#00FF7F")
    .setTitle("📣 Diretrizes de Publicidade & Parcerias — Caberé")
    .setDescription("Espaço para divulgação de conteúdo e parcerias.")
    .setFooter({ text: "Equipe Caberé" });

  await channel.send({ embeds: [embed] });
  return isMessage ? interactionOrMessage.reply("✅ Canal de publi configurado!") : interactionOrMessage.editReply("✅ Canal de publi configurado!");
}

async function handleSetupCompeticoesCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  const channel = guild.channels.cache.find(c => c.name.includes("competic") || c.name.includes("torneio"));
  if (!channel) return isMessage ? interactionOrMessage.reply("❌ Canal de competições não encontrado!") : interactionOrMessage.editReply("❌ Canal de competições não encontrado!");

  const embed = new EmbedBuilder()
    .setColor("#FF4500")
    .setTitle("⚔️ Central de Competições & Torneios — Caberé")
    .setDescription("Fique atento aos eventos e prêmios em Nanacoins!")
    .setFooter({ text: "Equipe Caberé" });

  await channel.send({ embeds: [embed] });
  return isMessage ? interactionOrMessage.reply("✅ Canal de competições configurado!") : interactionOrMessage.editReply("✅ Canal de competições configurado!");
}

async function handleSetupCaixaInfoCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  const channel = guild.channels.cache.find(c => c.name.includes("nanacoins"));
  if (!channel) return isMessage ? interactionOrMessage.reply("❌ Canal 'nanacoins' não encontrado!") : interactionOrMessage.editReply("❌ Canal 'nanacoins' não encontrado!");

  const embedCaixa = new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle("💰 Bem-vindo à Caixa do Caberé!")
    .setDescription("Esta categoria é o coração financeiro e de entretenimento do servidor.")
    .addFields(
      { name: "💰┃nanacoins", value: "`!diario`, `!saldo`, `!doar`, `!bolsa`." },
      { name: "🏆┃placar", value: "Ranking dos mais ricos (`!rank`)." },
      { name: "🎮┃arcade", value: "Jogos, duelos, roubos e mais (`!games`)." }
    )
    .setFooter({ text: "Caberé Caixa" });

  await channel.send({ content: "# 🎰 Economia e Jogos do Caberé", embeds: [embedCaixa] });
  return isMessage ? interactionOrMessage.reply("✅ Informações da Caixa enviadas!") : interactionOrMessage.editReply("✅ Informações da Caixa enviadas!");
}

async function handleSetupReviewsCommand(interactionOrMessage) {
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  const channel = guild.channels.cache.find(c => c.name.includes("reviews"));
  if (!channel) return isMessage ? interactionOrMessage.reply("❌ Canal de reviews não encontrado!") : interactionOrMessage.editReply("❌ Canal de reviews não encontrado!");

  const embedReviews = new EmbedBuilder()
    .setColor("#FF1493")
    .setTitle("⭐ Diretrizes do Fórum: Reviews do Caberé")
    .setDescription("Espaço para veredito, críticas e opiniões sobre jogos, filmes e animes.")
    .setFooter({ text: "Equipe Caberé" });

  await channel.send({ embeds: [embedReviews] });
  return isMessage ? interactionOrMessage.reply("✅ Diretrizes de Reviews enviadas!") : interactionOrMessage.editReply("✅ Diretrizes de Reviews enviadas!");
}

async function sendStartupAnnouncement(client) {
  if (!client) return;
  try {
    let guild = typeof client.guilds?.cache?.first === "function" 
      ? client.guilds.cache.first() 
      : (Array.isArray(client.guilds?.cache) ? client.guilds.cache[0] : Array.from(client.guilds?.cache?.values?.() || [])[0]);

    if (!guild && client.guilds?.fetch) {
      const fetchedGuilds = await client.guilds.fetch().catch(() => null);
      const firstOAuthGuild = fetchedGuilds?.first ? fetchedGuilds.first() : Array.from(fetchedGuilds?.values?.() || [])[0];
      if (firstOAuthGuild) {
        guild = await client.guilds.fetch(firstOAuthGuild.id).catch(() => null);
      }
    }
    if (!guild) return;

    let channels = guild.channels?.cache;
    if ((!channels || channels.size === 0) && guild.channels?.fetch) {
      channels = await guild.channels.fetch().catch(() => null);
    }

    let channelList = [];
    if (channels) {
      if (typeof channels.find === "function") {
        channelList = Array.from(channels.values ? channels.values() : channels);
      } else if (Array.isArray(channels)) {
        channelList = channels;
      }
    }

    let channel = channelList.find(c => 
      c && c.name && (c.name.includes("aviso") || c.name.includes("anuncio") || c.name.includes("novidades"))
    );

    if (!channel) {
      const channelId = config.ANUNCIO_CARGOS_CHANNEL_ID || "1528288031101026405";
      channel = guild.channels?.cache?.get(channelId);
      if (!channel && guild.channels?.fetch) {
        channel = await guild.channels.fetch(channelId).catch(() => null);
      }
    }

    if (!channel || typeof channel.send !== "function") return;

    const embedAvisos = new EmbedBuilder()
      .setColor("#8A2BE2")
      .setTitle("🔮 CENTRAL DE ANÚNCIOS — BOTBANANA DE VOLTA E ATUALIZADO! 🍌")
      .setDescription("O BotBanana está **ONLINE E ATUALIZADO**!")
      .addFields(
        { name: "🍌 Novo Painel Central (`!menu` / `!hub` / `!painel`)", value: "Menu interativo único!" },
        { name: "🛡️ Proteção Parrudo na `!loja`", value: "Compre sua Proteção Parrudo direto na `!loja`!" },
        { name: "🏆 Novos Cargos Automáticos", value: "Milionário de Taubaté, Ladrão, Campeão da Bagaça e Mão de Vaca!" }
      )
      .setFooter({ text: "© Caberé — BotBanana • Sistema Inicializado" })
      .setTimestamp();

    await channel.send({
      content: "@here 🚀 **ATENÇÃO FAMÍLIA CABERÉ — O BOTBANANA ESTÁ DE VOLTA COM NOVAS ATUALIZAÇÕES!**",
      embeds: [embedAvisos]
    }).catch(() => null);
  } catch (err) {
    console.error("Erro ao enviar anuncio de inicializacao:", err);
  }
}

module.exports = {
  getOrFetchRoleTag,
  getFaviconEmoji,
  handleSetupRegrasCommand,
  handleSetupCargosInfoCommand,
  handleSetupAvisosCommand,
  handleSetupPubliCommand,
  handleSetupCompeticoesCommand,
  handleSetupCaixaInfoCommand,
  handleSetupReviewsCommand,
  sendStartupAnnouncement
};
