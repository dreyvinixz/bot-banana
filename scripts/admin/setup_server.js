const fs = require("fs");
const path = require("path");
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { requireSuperAdmin } = require("./admin");
const config = require("../core/config");

const DATA_FILE = path.join(process.cwd(), "data", "setup_cabere.json");

function loadState() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } catch (e) {
      console.error("Erro ao ler setup_cabere.json", e);
    }
  }
  return { roles: {}, categories: {}, channels: {} };
}

function saveState(state) {
  try {
    if (!fs.existsSync(path.dirname(DATA_FILE))) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.error("Erro ao salvar setup_cabere.json", e);
  }
}

async function handleSetupCabereCommand(interaction) {
  const isAdmin = config.SUPERADMIN_IDS.includes(String(interaction.user.id));
  if (!isAdmin) {
    return interaction.reply({ content: "❌ Apenas o Superadmin pode usar este comando!", ephemeral: true });
  }

  // Deferimos a resposta porque criar muitos canais vai demorar
  await interaction.deferReply();

  const guild = interaction.guild;
  const state = loadState();
  
  let stats = {
    rolesCreated: 0,
    categoriesCreated: 0,
    channelsCreated: 0,
    alreadyExisting: 0
  };

  // --- 1. Cargos ---
  const rolesToCreate = [
    // Equipe
    { name: "👑 Dono", color: "#ffaa00" },
    { name: "🛡️ Administrador", color: "#ff0000" },
    { name: "🔨 Segurança de Vitrine", color: "#00ff00" },
    
    // Conquistas
    { name: "🏆 Campeão da Bagaça", color: "#ffd700" },
    { name: "🗣️ Women Propaganda", color: "#ff69b4" },
    { name: "🚀 Patrocinador da Baguga", color: "#ff1493" },
    { name: "💸 Milionário de Taubaté", color: "#00ff7f" },
    { name: "🎁 Mão de Vaca", color: "#8a2be2" },
    { name: "📣 Vendedor de Convite", color: "#ff4500" },
    { name: "💎 Apoiador da Resenha", color: "#00ffff" },
    { name: "🚀 Booster", color: "#ff00ff" },
    
    // Progressão
    { name: "👑 Lenda da Resenha", color: "#ff00ff" },
    { name: "🤡 Agente do Caos", color: "#dc143c" },
    { name: "💬 Já É de Casa", color: "#1e90ff" },
    { name: "🪑 Sentou na Resenha", color: "#d2691e" },
    { name: "🥚 Chegou Agora", color: "#f5f5dc" },

    // Idade
    { name: "🔞 +18", color: "#000000" },
    { name: "👶 -18", color: "#ffffff" }
  ];

  const roleMap = {};

  for (const roleData of rolesToCreate) {
    let role = null;
    if (state.roles[roleData.name]) {
      role = guild.roles.cache.get(state.roles[roleData.name]);
    }
    
    // Fallback: se não estiver no state, procura no servidor por nome
    if (!role) {
      role = guild.roles.cache.find(r => r.name === roleData.name);
    }

    if (!role) {
      try {
        role = await guild.roles.create({
          name: roleData.name,
          color: roleData.color,
          reason: "Setup Automático Caberé"
        });
        state.roles[roleData.name] = role.id;
        stats.rolesCreated++;
      } catch (err) {
        console.error(`Erro ao criar cargo ${roleData.name}`, err);
      }
    } else {
      state.roles[roleData.name] = role.id;
      stats.alreadyExisting++;
    }
    
    if (role) {
      roleMap[roleData.name] = role;
    }
  }
  saveState(state);

  // --- 2. Estrutura ---
  const structure = [
    {
      name: "⚙️ ✦ LOGS",
      isPrivateToStaff: true, // Custom flag to identify staff-only categories
      channels: [
        { name: "🛡️┃equipe", type: ChannelType.GuildText },
        { name: "🚫┃ban-logs", type: ChannelType.GuildText },
        { name: "💬┃msg-logs", type: ChannelType.GuildText },
        { name: "🔊┃voice-logs", type: ChannelType.GuildText },
        { name: "👤┃user-logs", type: ChannelType.GuildText }
      ]
    },
    {
      name: "📌 ✦ BASTIDORES",
      channels: [
        { name: "📜┃regras", type: ChannelType.GuildText, isReadOnly: true },
        { name: "📢┃avisos", type: ChannelType.GuildText, isReadOnly: true },
        { name: "🎟️┃cargos", type: ChannelType.GuildText, isReadOnly: true }
      ]
    },
    {
      name: "🎟️ ✦ ENTRADA",
      channels: [
        { name: "👋┃cheguei", type: ChannelType.GuildText },
        { name: "❓┃perguntas", type: ChannelType.GuildText },
        { name: "💡┃ideias-da-galera", type: ChannelType.GuildText }
      ]
    },
    {
      name: "🎪 ✦ O PALCO",
      channels: [
        { name: "💬┃resenha", type: ChannelType.GuildText },
        { name: "📸┃holofotes", type: ChannelType.GuildText },
        { name: "🔞┃mais-18", type: ChannelType.GuildText, isNsfw: true },
        { name: "👶┃menos-18", type: ChannelType.GuildText }
      ]
    },
    {
      name: "🎤 ✦ NO PALCO",
      channels: [
        { name: "🎉┃eventos", type: ChannelType.GuildText },
        { name: "🏆┃competições", type: ChannelType.GuildText },
        { name: "🎁┃sorteios", type: ChannelType.GuildText },
        { name: "🗳️┃votações", type: ChannelType.GuildText }
      ]
    },
    {
      name: "💰 ✦ CAIXA DO CABERÉ",
      channels: [
        { name: "💰┃nanacoins", type: ChannelType.GuildText },
        { name: "🏆┃placar", type: ChannelType.GuildText },
        { name: "🎮┃arcade", type: ChannelType.GuildText }
      ]
    },
    {
      name: "🎭 ✦ CAMARINS",
      channels: [
        { name: "🚀┃patrocinadores", type: ChannelType.GuildText, requireRole: "🚀 Patrocinador da Baguga" }
      ]
    },
    {
      name: "🔊 ✦ VOZ",
      channels: [
        { name: "🎙️┃camarim", type: ChannelType.GuildVoice },
        { name: "🍻┃resenha", type: ChannelType.GuildVoice },
        { name: "🎮┃partiu-jogar", type: ChannelType.GuildVoice },
        { name: "🎶┃som-ambiente", type: ChannelType.GuildVoice },
        { name: "😴┃cochilo", type: ChannelType.GuildVoice }
      ]
    }
  ];

  // Helper para permissões de canais
  function getPermissionsForChannel(chConfig, catConfig) {
    const permissionOverwrites = [];

    // Por padrão o bot tem acesso a tudo
    permissionOverwrites.push({
      id: guild.client.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
    });
    
    // Admins e Mods também sempre terão acesso onde o bot adicionar manualmente (ex: private channels)
    const adminRole = roleMap["🛡️ Administrador"];
    const modRole = roleMap["🔨 Segurança de Vitrine"];
    const donoRole = roleMap["👑 Dono"];

    // Lógica da categoria privada (LOGS)
    if (catConfig.isPrivateToStaff) {
      permissionOverwrites.push({
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      });
      if (adminRole) permissionOverwrites.push({ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      if (modRole) permissionOverwrites.push({ id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      if (donoRole) permissionOverwrites.push({ id: donoRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      return permissionOverwrites;
    }

    if (chConfig.isReadOnly) {
      // Regras, avisos, cargos: Todos vêem, mas só admin envia
      permissionOverwrites.push({
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages]
      });
      if (adminRole) permissionOverwrites.push({ id: adminRole.id, allow: [PermissionFlagsBits.SendMessages] });
      if (modRole) permissionOverwrites.push({ id: modRole.id, allow: [PermissionFlagsBits.SendMessages] });
      if (donoRole) permissionOverwrites.push({ id: donoRole.id, allow: [PermissionFlagsBits.SendMessages] });
    } else if (chConfig.requireRole) {
      // Camarins: Privado, apenas o cargo específico pode ver + Staff
      permissionOverwrites.push({
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      });
      if (roleMap[chConfig.requireRole]) {
        permissionOverwrites.push({
          id: roleMap[chConfig.requireRole].id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        });
      }
      if (adminRole) permissionOverwrites.push({ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      if (modRole) permissionOverwrites.push({ id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      if (donoRole) permissionOverwrites.push({ id: donoRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
    }

    return permissionOverwrites;
  }

  // --- 3. Criar Categorias e Canais ---
  for (const cat of structure) {
    let category = null;

    if (state.categories[cat.name]) {
      category = guild.channels.cache.get(state.categories[cat.name]);
    }
    if (!category) {
      category = guild.channels.cache.find(c => c.name === cat.name && c.type === ChannelType.GuildCategory);
    }

    if (!category) {
      try {
        // Categoria privada para Staff aplica as permissões base para toda a categoria
        const overwrites = [];
        if (cat.isPrivateToStaff) {
            overwrites.push({ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] });
            overwrites.push({ id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
            
            if (roleMap["🛡️ Administrador"]) overwrites.push({ id: roleMap["🛡️ Administrador"].id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
            if (roleMap["🔨 Segurança de Vitrine"]) overwrites.push({ id: roleMap["🔨 Segurança de Vitrine"].id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
            if (roleMap["👑 Dono"]) overwrites.push({ id: roleMap["👑 Dono"].id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
        }
        
        category = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: overwrites.length > 0 ? overwrites : undefined,
          reason: "Setup Automático Caberé"
        });
        state.categories[cat.name] = category.id;
        stats.categoriesCreated++;
      } catch (err) {
        console.error(`Erro ao criar categoria ${cat.name}`, err);
        continue;
      }
    } else {
      state.categories[cat.name] = category.id;
      stats.alreadyExisting++;
    }
    saveState(state);

    // Criar canais dentro da categoria
    for (const ch of cat.channels) {
      let channel = null;
      const chKey = `${cat.name}_${ch.name}`;

      if (state.channels[chKey]) {
        channel = guild.channels.cache.get(state.channels[chKey]);
      }
      if (!channel) {
        channel = guild.channels.cache.find(c => c.name === ch.name.toLowerCase() && c.parentId === category.id);
      }

      if (!channel) {
        try {
          const overwrites = getPermissionsForChannel(ch, cat);
          
          channel = await guild.channels.create({
            name: ch.name,
            type: ch.type,
            parent: category.id,
            nsfw: ch.isNsfw || false,
            permissionOverwrites: overwrites.length > 0 ? overwrites : undefined,
            reason: "Setup Automático Caberé"
          });
          state.channels[chKey] = channel.id;
          stats.channelsCreated++;
        } catch (err) {
          console.error(`Erro ao criar canal ${ch.name}`, err);
        }
      } else {
        state.channels[chKey] = channel.id;
        stats.alreadyExisting++;
      }
    }
    saveState(state);
  }

  const resumo = `🎭 Configuração final do Caberé concluída!

✅ Categorias criadas: ${stats.categoriesCreated}
✅ Canais criados: ${stats.channelsCreated}
✅ Cargos criados: ${stats.rolesCreated}
⏭️ Elementos já existentes: ${stats.alreadyExisting}`;

  await interaction.editReply({ content: resumo });
}

module.exports = {
  handleSetupCabereCommand
};
