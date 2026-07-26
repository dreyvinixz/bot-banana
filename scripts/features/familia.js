const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, MessageFlags } = require("discord.js");
const path = require("path");
const fs = require("fs");
const { logError } = require("../core/logger");

// Nome/ID do cargo de família
const FAMILIA_ROLE_NAME = "💖 Família Caberé";

/**
 * Cria ou busca o cargo de Família Caberé no servidor
 */
async function getOrCreateFamiliaRole(guild) {
  if (!guild || !guild.roles) return null;

  let role = guild.roles.cache.find(r => 
    r.name.toLowerCase().includes("família caberé") || 
    r.name.toLowerCase().includes("familia cabere") ||
    r.name.toLowerCase().includes("família kabaré") ||
    r.name.toLowerCase().includes("familia kabare")
  );

  if (!role && guild.roles.fetch) {
    try {
      const fetchedRoles = await guild.roles.fetch().catch(() => null);
      if (fetchedRoles) {
        role = fetchedRoles.find(r => 
          r.name.toLowerCase().includes("família caberé") || 
          r.name.toLowerCase().includes("familia cabere") ||
          r.name.toLowerCase().includes("família kabaré") ||
          r.name.toLowerCase().includes("familia kabare")
        );
      }
    } catch (e) {}
  }

  if (!role) {
    try {
      role = await guild.roles.create({
        name: FAMILIA_ROLE_NAME,
        color: "#FF1493", // Rosa choque vibrante
        reason: "Cargo exclusivo do sistema de verificação da Família Caberé",
        hoist: true // Destaca na lista de membros
      });
    } catch (e) {
      logError("FAMILIA_ROLE_CREATE", e, { guildId: guild.id });
    }
  }

  return role;
}

/**
 * Monta o Embed estilizado com o painel informativo da Família
 */
function buildFamiliaEmbed(guild, realInviteUrl, hasBanner = false) {
  const guildIcon = guild?.iconURL({ dynamic: true }) || null;
  const displayInvite = realInviteUrl || "https://discord.gg/gNu3daPca";
  const displayCode = displayInvite.replace(/^https?:\/\//i, "");

  const embed = new EmbedBuilder()
    .setColor("#FF1493")
    .setTitle("💖 Família Caberé — Como se tornar um membro?")
    .setDescription("Quer se destacar no servidor e receber vantagens exclusivas? Nós do **Caberé** estamos ansiosos para receber você em nossa família!")
    .addFields(
      {
        name: "ℹ️ Como se tornar um membro da família?",
        value: `Para fazer parte da nossa família, basta adicionar o convite oficial do nosso servidor ao seu **Status Personalizado** (o balão de texto do seu status no Discord).\n\n**Convites para adicionar no Status Personalizado:**\n\`${displayInvite}\` ou \`${displayCode}\``
      },
      {
        name: "🎁 Benefícios Exclusivos:",
        value: [
          "💖 Cargo exclusivo **@💖 Família Caberé** com destaque;",
          "⚡ **+200% de aumento na experiência (XP)** no sistema de níveis (`!xp`);",
          "✏️ Permissão para alterar seu próprio apelido no servidor;",
          "📸 Permissão para enviar mídias e links integrados nos canais;",
          "🎥 Permissão para transmitir tela ou vídeo em alta qualidade nos canais de voz;",
          "👑 Acesso ao Camarim exclusivo da Família."
        ].join("\n")
      },
      {
        name: "Finalização",
        value: "Se você deseja fazer parte da nossa família e já colocou o convite no seu **Status Personalizado**, basta clicar no botão **Verificar Status Personalizado** abaixo!"
      }
    )
    .setThumbnail(guildIcon)
    .setFooter({ text: "© Caberé — Todos os direitos reservados." })
    .setTimestamp();

  if (hasBanner) {
    embed.setImage("attachment://banner_familia.png");
  }

  return embed;
}

/**
 * Envia ou atualiza o painel de verificação da Família Caberé
 */
async function handleSetupFamiliaCommand(interactionOrMessage, customLink = "") {
  const { AttachmentBuilder } = require("discord.js");
  const isMessage = !!interactionOrMessage.content;
  const guild = interactionOrMessage.guild;
  const channel = interactionOrMessage.channel;

  if (!guild || !channel) {
    const errorMsg = "❌ Este comando deve ser usado dentro de um canal do servidor!";
    return isMessage ? interactionOrMessage.reply(errorMsg) : interactionOrMessage.editReply(errorMsg);
  }

  // Garantir que o cargo exista
  await getOrCreateFamiliaRole(guild);

  let inviteUrl = typeof customLink === "string" ? customLink.trim() : "";
  if (!inviteUrl) {
    inviteUrl = "https://discord.gg/gNu3daPca";
  }

  const bannerFamiliaPath = path.join(process.cwd(), "assets", "banner_familia.png");
  let files = [];
  let hasBanner = false;

  if (fs.existsSync(bannerFamiliaPath)) {
    files.push(new AttachmentBuilder(bannerFamiliaPath, { name: "banner_familia.png" }));
    hasBanner = true;
  }

  const embed = buildFamiliaEmbed(guild, inviteUrl, hasBanner);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify_familia")
      .setLabel("Verificar Status Personalizado")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
  );

  await channel.send({ embeds: [embed], components: [row], files: files });

  const successMsg = `✅ Painel de verificação configurado com sucesso com a nova imagem!\nConvite utilizado: \`${inviteUrl}\``;
  if (isMessage) {
    await interactionOrMessage.reply(successMsg);
  } else {
    await interactionOrMessage.editReply(successMsg);
  }
}

/**
 * Verifica se a presença/status do membro contém qualquer link de convite válido do servidor
 */
async function checkMemberStatusHasInvite(member, client = null, customInviteCode = "") {
  if (!member) return false;

  const validKeywords = ["kabere", "kabaré", "cabere", "caberé", "discord.gg", "discord.com/invite", "discordapp.com/invite", "gnu3dapca"];
  if (customInviteCode) {
    validKeywords.push(customInviteCode.toLowerCase());
  }

  const userId = member.id || member.user?.id;
  let targetMember = member;

  // Tentar obter o membro atualizado do servidor com presenças ativas
  if (member.guild && member.guild.members && typeof member.guild.members.fetch === "function" && userId) {
    const fetched = await member.guild.members.fetch({ user: userId, withPresences: true, force: true }).catch(() => null);
    if (fetched) targetMember = fetched;
  }

  // Buscar dinamicamente todos os códigos de convites ATIVOS do servidor
  if (targetMember.guild && targetMember.guild.invites) {
    try {
      const guildInvites = await targetMember.guild.invites.fetch().catch(() => null);
      if (guildInvites) {
        guildInvites.forEach(inv => {
          if (inv.code) validKeywords.push(inv.code.toLowerCase());
        });
      }
    } catch (e) {
      // Ignorar caso o bot não tenha permissão de gerenciar servidor
    }
  }

  // 1. Verificar Atividades / Custom Status no Presence
  const presence = targetMember.presence;
  if (presence && presence.activities) {
    for (const act of presence.activities) {
      const statusText = `${act.state || ""} ${act.details || ""} ${act.name || ""}`.toLowerCase();
      if (validKeywords.some(kw => kw && statusText.includes(kw))) {
        return true;
      }
    }
  }

  // 2. Fallback de verificação de campos de bio se disponíveis
  try {
    const user = targetMember.user || targetMember;
    if (user && user.id) {
      if (client && client.rest) {
        const rawProfile = await client.rest.get(`/users/${user.id}/profile`).catch(() => null);
        if (rawProfile) {
          const rawBioText = `${rawProfile.user_profile?.bio || rawProfile.user?.bio || rawProfile.bio || ""}`.toLowerCase();
          if (rawBioText && validKeywords.some(kw => kw && rawBioText.includes(kw))) {
            return true;
          }
        }
      }

      const fullUser = client ? await client.users.fetch(user.id, { force: true }).catch(() => user) : user;
      const bioText = `${fullUser.bio || fullUser.description || fullUser.aboutMe || user.bio || user.description || ""}`.toLowerCase();
      if (bioText && validKeywords.some(kw => kw && bioText.includes(kw))) {
        return true;
      }
    }
  } catch (e) {
    // Ignorar falha se o perfil for privado
  }

  return false;
}

/**
 * Processa o clique no botão de verificação
 */
async function handleFamiliaButtonInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== "verify_familia") return false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = interaction.member;
  const guild = interaction.guild;

  if (!member || !guild) {
    await interaction.editReply({ content: "❌ Ocorreu um erro ao carregar seus dados no servidor." });
    return true;
  }

  const role = await getOrCreateFamiliaRole(guild);

  // Se já tiver o cargo
  if (role && member.roles.cache.has(role.id)) {
    await interaction.editReply({
      content: "💖 **Você já é um membro verificado da Família Caberé!**\nSeus benefícios de cargo, permissões e +200% de bônus de XP já estão ativos!"
    });
    return true;
  }

  // Tentar verificar status ou bio do perfil
  const hasInvite = await checkMemberStatusHasInvite(member, interaction.client);

  if (hasInvite) {
    let roleAssigned = false;
    let roleWarningNote = "";

    if (role) {
      try {
        await member.roles.add(role.id);
        roleAssigned = true;
      } catch (err) {
        logError("FAMILIA_ROLE_ASSIGN", err, {
          userId: member.id,
          roleId: role.id,
          roleName: role.name,
          guildId: guild.id
        });
        roleWarningNote = "\n\n⚠️ **Nota aos ADMs:** Seu status foi verificado com sucesso, mas o Discord impediu a atribuição automática do cargo. Mova o cargo do **BotBanana** para **CIMA** do cargo **💖 Família Caberé** nas *Configurações do Servidor -> Cargos* (Hierarquia do Discord).";
      }
    }

    const embedSuccess = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("🎉 VERIFICAÇÃO CONCLUÍDA COM SUCESSO!")
      .setDescription(`Seja muito bem-vindo(a) à **Família Kabaré**, <@${member.id}>!${roleWarningNote}`)
      .addFields(
        { name: "💖 Cargo Elegível", value: role ? `<@&${role.id}>` : FAMILIA_ROLE_NAME, inline: true },
        { name: "⚡ Bônus de XP", value: "`+200% XP (3x Total)`", inline: true }
      )
      .setFooter({ text: "Aproveite seus novos benefícios e divirta-se no servidor!" });

    await interaction.editReply({ embeds: [embedSuccess] });
  } else {
    // Se não encontrou o status
    const embedFail = new EmbedBuilder()
      .setColor("#FF0000")
      .setTitle("❌ CONVITE NÃO ENCONTRADO NO STATUS PERSONALIZADO")
      .setDescription("Não conseguimos ler o convite no seu **Status Personalizado** do Discord!\n\n⚠️ **Nota Importante:** O link precisa estar no **Status Personalizado** (o balão de texto do seu status), e não apenas no **Sobre Mim (Bio)**, pois o Discord só transmite o Status Personalizado para a API do Bot.")
      .addFields(
        {
          name: "📌 Como colocar no Status Personalizado (3 passos):",
          value: [
            "1️⃣ Clique na sua foto de perfil do Discord (canto esquerdo).",
            "2️⃣ Clique em **'Definir status personalizado'** (Set Custom Status).",
            "3️⃣ Cole `discord.gg/gNu3daPca` ou `https://discord.gg/gNu3daPca` no campo de texto e salve!",
            "",
            "💡 *Certifique-se também de que a opção 'Compartilhar status de atividade com servidores' está ativada nas configurações de privacidade do Discord.*",
            "",
            "Depois de salvar o status, clique no botão **Verificar** novamente aqui!"
          ].join("\n")
        }
      )
      .setFooter({ text: "Nota: Certifique-se de que a opção 'Compartilhar status de atividade com servidores' está ativada nas suas configurações do Discord." });

    await interaction.editReply({ embeds: [embedFail] });
  }

  return true;
}

module.exports = {
  handleSetupFamiliaCommand,
  handleFamiliaButtonInteraction,
  checkMemberStatusHasInvite,
  getOrCreateFamiliaRole,
  buildFamiliaEmbed
};
