const fs = require("fs");
const path = require("path");
const config = require("../core/config");
const { EmbedBuilder } = require("discord.js");
const { createDebouncedJsonWriter } = require("../core/storage");

const STATS_PATH = path.join(config.paths.data, "userStats.json");
let statsDb = {};

function carregarStats() {
  try {
    if (fs.existsSync(STATS_PATH)) {
      statsDb = JSON.parse(fs.readFileSync(STATS_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("Erro ao carregar userStats:", err);
  }
}

const scheduleSaveStats = createDebouncedJsonWriter(STATS_PATH, () => statsDb, 3000);
let disableSavingForTests = false;

function salvarStats() {
  if (!disableSavingForTests) scheduleSaveStats();
}

carregarStats();

function getUserStats(userId) {
  if (!statsDb[userId]) {
    statsDb[userId] = {
      stealsCount: 0,
      gameWins: 0,
      donationsSent: 0,
      shopPurchases: 0,
      prisonServedCount: 0,
      voiceTimeMs: 0,
      messages: []
    };
  }
  return statsDb[userId];
}

async function announceRoleUnlock(guild, userId, roleName, emoji = "🏆") {
  if (!guild) return;
  try {
    const channelId = config.ANUNCIO_CARGOS_CHANNEL_ID || "1528288031101026405";
    let channel = guild.channels?.cache?.get(channelId);
    if (!channel && guild.channels?.fetch) {
      channel = await guild.channels.fetch(channelId).catch(() => null);
    }
    if (channel && typeof channel.send === "function") {
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`${emoji} NOVO CARGO CONQUISTADO!`)
        .setDescription(`Parabéns <@${userId}>! Você acabou de desbloquear o cargo exclusivo **${roleName}**! 🚀`)
        .setFooter({ text: "Continue participando das conversas, jogos e calls do Caberé para subir de nível!" })
        .setTimestamp();

      await channel.send({ content: `🎉 **PARABÉNS <@${userId}>!**`, embeds: [embed] }).catch(() => null);
    }
  } catch (err) {
    console.error("Erro ao anunciar conquista de cargo:", err);
  }
}

async function checkAndGrantRole(member, roleName, emoji = "🏆") {
  if (!member || !member.roles || !member.guild) return false;
  try {
    let role = member.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role && member.guild.roles.fetch) {
      const fetchedRoles = await member.guild.roles.fetch().catch(() => null);
      if (fetchedRoles) {
        role = fetchedRoles.find(r => r.name.toLowerCase() === roleName.toLowerCase());
      }
    }

    if (role && !member.roles.cache.has(role.id)) {
      await member.roles.add(role.id).catch(() => null);
      await announceRoleUnlock(member.guild, member.id, role.name || roleName, emoji);
      return true;
    }
  } catch (err) {
    console.error(`Erro ao conceder cargo ${roleName}:`, err);
  }
  return false;
}

// 1. Milionário de Taubaté (10k+ NC)
async function checkMilionarioRole(member, coins) {
  if (coins >= 10000) {
    await checkAndGrantRole(member, "Milionário de Taubaté", "🟢");
  }
}

// 2. Ladrão (20+ roubos bem-sucedidos)
async function recordSuccessfulSteal(userId, member) {
  const stats = getUserStats(userId);
  stats.stealsCount = (stats.stealsCount || 0) + 1;
  salvarStats();

  if (stats.stealsCount >= 20 && member) {
    await checkAndGrantRole(member, "Ladrão", "🥷");
  }
}

// 3. Campeão da Bagaça (30+ vitórias em games)
async function recordGameWin(userId, member) {
  const stats = getUserStats(userId);
  stats.gameWins = (stats.gameWins || 0) + 1;
  salvarStats();

  if (stats.gameWins >= 30 && member) {
    await checkAndGrantRole(member, "Campeão da Bagaça", "🏆");
  }
}

// 4. Mão de Vaca (3x cumprir prisão, 5k+ NC com 0 doações, ou 15k+ NC com 0 compras)
async function recordPrisonServed(userId, member) {
  const stats = getUserStats(userId);
  stats.prisonServedCount = (stats.prisonServedCount || 0) + 1;
  salvarStats();

  if (stats.prisonServedCount >= 3 && member) {
    await checkAndGrantRole(member, "Mão de Vaca", "🎁");
  }
}

async function recordDonationSent(userId) {
  const stats = getUserStats(userId);
  stats.donationsSent = (stats.donationsSent || 0) + 1;
  salvarStats();
}

async function recordShopPurchase(userId) {
  const stats = getUserStats(userId);
  stats.shopPurchases = (stats.shopPurchases || 0) + 1;
  salvarStats();
}

async function checkMaoDeVacaRole(member, coins) {
  if (!member) return;
  const stats = getUserStats(member.id);
  const isMaoDeVaca =
    (stats.prisonServedCount >= 3) ||
    (coins >= 5000 && (stats.donationsSent || 0) === 0) ||
    (coins >= 15000 && (stats.shopPurchases || 0) === 0);

  if (isMaoDeVaca) {
    await checkAndGrantRole(member, "Mão de Vaca", "🎁");
  }
}

// 5. Tempo em Call (Voz)
async function addVoiceTime(userId, member, durationMs) {
  if (!userId || durationMs <= 0) return;
  const stats = getUserStats(userId);
  stats.voiceTimeMs = (stats.voiceTimeMs || 0) + durationMs;
  salvarStats();

  if (!member) return;
  const hours = stats.voiceTimeMs / (1000 * 60 * 60);

  if (hours >= 336) {
    await checkAndGrantRole(member, "Voz Suprema", "👑");
  } else if (hours >= 168) {
    await checkAndGrantRole(member, "Dono de Podcast", "🎙️");
  } else if (hours >= 72) {
    await checkAndGrantRole(member, "Mestre das Calls", "🎙️");
  } else if (hours >= 24) {
    await checkAndGrantRole(member, "Amante das Conversas", "🎙️");
  } else if (hours >= 7) {
    await checkAndGrantRole(member, "Voz Promissora", "🎙️");
  }
}

// 6. Atividade Semanal (Mensagens nos últimos 7 dias)
async function recordActivityMessage(userId, member) {
  if (!userId) return;
  const stats = getUserStats(userId);
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  if (!Array.isArray(stats.messages)) stats.messages = [];
  stats.messages.push(now);
  stats.messages = stats.messages.filter(ts => ts >= sevenDaysAgo);
  salvarStats();

  if (!member) return;
  const count = stats.messages.length;

  if (count >= 3000) {
    await checkAndGrantRole(member, "Extremamente Ativo", "💥");
  } else if (count >= 1500) {
    await checkAndGrantRole(member, "Super Ativo", "🔥");
  } else if (count >= 500) {
    await checkAndGrantRole(member, "Ativo", "⚡");
  }
}

function __setStatsDbForTests(data) {
  statsDb = data;
}

function __getStatsDbForTests() {
  return statsDb;
}

function __disableStatsSavingForTests(val = true) {
  disableSavingForTests = val;
}

module.exports = {
  getUserStats,
  checkMilionarioRole,
  recordSuccessfulSteal,
  recordGameWin,
  recordPrisonServed,
  recordDonationSent,
  recordShopPurchase,
  checkMaoDeVacaRole,
  addVoiceTime,
  recordActivityMessage,
  announceRoleUnlock,
  __setStatsDbForTests,
  __getStatsDbForTests,
  __disableStatsSavingForTests
};
