const fs = require("fs");
const path = require("path");
const config = require("../core/config");
const { EmbedBuilder } = require("discord.js");
const { createDebouncedJsonWriter } = require("../core/storage");
const { resolveUserFromMessage } = require("../core/userResolver");

let xpDb = {};

const PROGRESSION_ROLES = [
  { level: 100, name: "👑 Lenda da Resenha", id: "1528295131994919056" },
  { level: 50, name: "🤡 Agente do Caos", id: "1528295133324251168" },
  { level: 25, name: "💬 Já É de Casa", id: "1528295134347919403" },
  { level: 10, name: "🪑 Sentou na Resenha", id: "1528295135572656234" },
  { level: 1, name: "🥚 Chegou Agora", id: "1528295137493516389" }
];

const COOLDOWN_MS = 60_000; // 1 minuto de cooldown entre ganhos de XP

function carregarXp() {
  try {
    if (fs.existsSync(config.XP_PATH)) {
      const data = fs.readFileSync(config.XP_PATH, "utf-8");
      xpDb = JSON.parse(data);
    }
  } catch (err) {
    console.error("Erro ao carregar banco de XP:", err);
  }
}

const scheduleXpSave = createDebouncedJsonWriter(config.XP_PATH, () => xpDb, config.static?.app?.timers?.saveDebounceMs || 2000);
let disableSavingForTests = false;

function salvarXp() {
  if (!disableSavingForTests) scheduleXpSave();
}

carregarXp();

/**
 * Calcula o nível total com base no XP total acumulado.
 * Nível 1: 0 XP
 * Cada nível requer (100 * NívelAtual) de XP para o próximo.
 */
function getLevelFromTotalXp(xp) {
  if (!xp || xp <= 0) return 1;
  // Fórmula quadrática: TotalXP = 50 * L * (L - 1)
  const level = Math.floor((1 + Math.sqrt(1 + (8 * xp) / 100)) / 2);
  return Math.max(1, level);
}

/**
 * Retorna a quantidade de XP acumulada necessária para ALCANÇAR determinado nível.
 */
function getTotalXpForLevel(level) {
  if (level <= 1) return 0;
  return 50 * level * (level - 1);
}

/**
 * Retorna o XP necessário no nível atual para ir ao próximo nível.
 */
function getXpForNextLevel(level) {
  return 100 * level;
}

/**
 * Gera uma barra de progresso visual estilo [██████░░░░]
 */
function createProgressBar(current, total, length = 10) {
  if (total <= 0) total = 1;
  const percent = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(percent * length);
  const empty = length - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${Math.floor(percent * 100)}%`;
}

/**
 * Obtém o cargo de progressão elegível com base no nível do usuário
 */
function getEligibleRoleForLevel(level) {
  for (const role of PROGRESSION_ROLES) {
    if (level >= role.level) return role;
  }
  return PROGRESSION_ROLES[PROGRESSION_ROLES.length - 1];
}

/**
 * Atualiza os cargos de progressão do usuário no servidor Discord se aplicável.
 */
async function syncUserRoles(member, newLevel) {
  if (!member || !member.roles) return;

  try {
    const targetRole = getEligibleRoleForLevel(newLevel);
    const roleIdsToRemove = PROGRESSION_ROLES.map(r => r.id).filter(id => id !== targetRole.id);

    // Remove outros cargos de progressão se o usuário os possuir
    for (const roleId of roleIdsToRemove) {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId).catch(() => null);
      }
    }

    // Adiciona o novo cargo de progressão se ainda não o tiver
    if (!member.roles.cache.has(targetRole.id)) {
      await member.roles.add(targetRole.id).catch(() => null);
    }
  } catch (err) {
    console.error("Erro ao sincronizar cargos de XP:", err);
  }
}

/**
 * Processa mensagens recebidas para conceder XP (com cooldown)
 */
async function addXpFromMessage(message) {
  if (!message || !message.author || message.author.bot) return;
  if (!message.guild) return;

  // Ignorar comandos simples para evitar ganho por abuso de comandos
  if (message.content && (message.content.startsWith("!") || message.content.startsWith("/"))) return;

  const userId = message.author.id;
  const now = Date.now();

  if (!xpDb[userId]) {
    xpDb[userId] = {
      xp: 0,
      level: 1,
      lastXpTimestamp: 0,
      messagesCount: 0
    };
  }

  const userData = xpDb[userId];
  userData.messagesCount = (userData.messagesCount || 0) + 1;

  // Verificar cooldown
  if (now - (userData.lastXpTimestamp || 0) < COOLDOWN_MS) {
    salvarXp();
    return;
  }

  let xpGained = Math.floor(Math.random() * 11) + 15; // 15 a 25 XP
  
  // Bônus de +200% de XP para membros da Família Caberé (3x XP)
  if (message.member && message.member.roles) {
    const hasFamiliaRole = message.member.roles.cache.some(r => r.name.toLowerCase().includes("família") || r.name.toLowerCase().includes("familia"));
    if (hasFamiliaRole) {
      xpGained *= 3;
    }
  }

  const oldLevel = getLevelFromTotalXp(userData.xp);
  
  userData.xp = (userData.xp || 0) + xpGained;
  userData.lastXpTimestamp = now;

  const newLevel = getLevelFromTotalXp(userData.xp);
  userData.level = newLevel;

  salvarXp();

  // Subiu de nível!
  if (newLevel > oldLevel) {
    const roleData = getEligibleRoleForLevel(newLevel);
    
    // Tenta sincronizar cargo no Discord
    if (message.member) {
      await syncUserRoles(message.member, newLevel);
    }

    const embed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle("🎉 SUBIU DE NÍVEL!")
      .setDescription(`Parabéns <@${userId}>! Você avançou do **Nível ${oldLevel}** para o **Nível ${newLevel}**! 🚀`)
      .addFields(
        { name: "🏆 Cargo de Progressão", value: `**${roleData.name}**`, inline: true },
        { name: "⚡ XP Total", value: `\`${userData.xp} XP\``, inline: true }
      )
      .setFooter({ text: "Continue interagindo no chat para subir ainda mais na hierarquia do Caberé!" })
      .setTimestamp();

    // Canal dedicado para anúncios de nível: 🚀┃up-cargos (1529586599099371550)
    const upChannelId = "1529586599099371550";
    const upChannel = message.guild.channels.cache.get(upChannelId) 
      || message.guild.channels.cache.find(c => c.name.includes("up-cargos"));

    if (upChannel && upChannel.send) {
      await upChannel.send({ embeds: [embed] }).catch(() => null);
    } else {
      await message.reply({ embeds: [embed] }).catch(() => null);
    }
  }
}

/**
 * Retorna os dados completos de XP e Rank de um usuário
 */
function getUserXpStats(userId) {
  const userData = xpDb[userId] || { xp: 0, level: 1, lastXpTimestamp: 0, messagesCount: 0 };
  const level = getLevelFromTotalXp(userData.xp);
  const startXpOfCurrentLevel = getTotalXpForLevel(level);
  const endXpOfCurrentLevel = getTotalXpForLevel(level + 1);
  const currentXpInLevel = userData.xp - startXpOfCurrentLevel;
  const xpNeededForNextLevel = endXpOfCurrentLevel - startXpOfCurrentLevel;

  // Calcular ranking global de XP
  const sortedUsers = Object.entries(xpDb)
    .filter(([id]) => id !== "teste_user_id")
    .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0));

  const rankIndex = sortedUsers.findIndex(([id]) => id === userId);
  const rank = rankIndex !== -1 ? rankIndex + 1 : sortedUsers.length + 1;

  const role = getEligibleRoleForLevel(level);

  return {
    xp: userData.xp || 0,
    level,
    currentXpInLevel,
    xpNeededForNextLevel,
    messagesCount: userData.messagesCount || 0,
    rank,
    roleName: role.name,
    progressBar: createProgressBar(currentXpInLevel, xpNeededForNextLevel)
  };
}

/**
 * Trata os comandos !xp e !nivel
 */
async function handleXpCommand(message, text = "") {
  const args = text.trim().split(/\s+/);
  let targetUser = message.author;

  if (args.length > 0 && args[0]) {
    const foundUser = await resolveUserFromMessage(message, args[0]);
    if (foundUser) targetUser = foundUser;
  }

  const stats = getUserXpStats(targetUser.id);

  const embed = new EmbedBuilder()
    .setColor("#1E90FF")
    .setTitle(`📈 Cartão de XP & Nível | ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }) || null)
    .addFields(
      { name: "⭐ Nível", value: `\`Nível ${stats.level}\``, inline: true },
      { name: "🏆 Cargo", value: `**${stats.roleName}**`, inline: true },
      { name: "🥇 Posicão no Rank", value: `\`#${stats.rank}\``, inline: true },
      { name: "⚡ Progresso do Nível", value: `\`${stats.currentXpInLevel} / ${stats.xpNeededForNextLevel} XP\`\n${stats.progressBar}`, inline: false },
      { name: "📊 Total de XP", value: `\`${stats.xp} XP\``, inline: true },
      { name: "💬 Mensagens Registradas", value: `\`${stats.messagesCount}\``, inline: true }
    )
    .setFooter({ text: "Converse nos canais de texto para ganhar XP e subir de nível!" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
  return true;
}

/**
 * Trata os comandos !rankxp e !topxp
 */
async function handleRankXpCommand(message) {
  const sortedUsers = Object.entries(xpDb)
    .filter(([id]) => id !== "teste_user_id")
    .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
    .slice(0, 10);

  if (sortedUsers.length === 0) {
    return message.reply("Nenhum registro de XP encontrado ainda! Comece a conversar no chat para subir no rank.");
  }

  const lines = [];
  for (let i = 0; i < sortedUsers.length; i++) {
    const [userId, data] = sortedUsers[i];
    const level = getLevelFromTotalXp(data.xp || 0);
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`#${i + 1}\``;
    lines.push(`${medal} <@${userId}> — **Nível ${level}** (\`${data.xp || 0} XP\`)`);
  }

  const embed = new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle("🏆 Hall da Fama — Top 10 XP do Caberé")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Use !xp para consultar seu progresso individual!" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
  return true;
}

function __setXpDbForTests(testDb) {
  xpDb = { ...testDb };
}

function __getXpDbForTests() {
  return { ...xpDb };
}

function __disableXpSavingForTests(val = true) {
  disableSavingForTests = val;
}

module.exports = {
  addXpFromMessage,
  getUserXpStats,
  handleXpCommand,
  handleRankXpCommand,
  getLevelFromTotalXp,
  getTotalXpForLevel,
  createProgressBar,
  getEligibleRoleForLevel,
  __setXpDbForTests,
  __getXpDbForTests,
  __disableXpSavingForTests
};
