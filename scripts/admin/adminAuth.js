const config = require("../core/config");

function isSuperAdmin(userId) {
  if (!userId) return false;
  const list = config.SUPERADMIN_IDS || [];
  return list.includes(userId);
}

function requireSuperAdmin(interactionOrMessage) {
  const userId = interactionOrMessage.author?.id || interactionOrMessage.user?.id;
  if (!isSuperAdmin(userId)) {
    const errorMsg = "⛔ **Acesso Negado:** Este comando é exclusivo para Superadmin!";
    if (interactionOrMessage.reply) {
      interactionOrMessage.reply(errorMsg).catch(() => null);
    }
    return false;
  }
  return true;
}

async function handleSpawnBossCommand(message) {
  if (!requireSuperAdmin(message)) return true;
  const { spawnWorldBoss } = require("../games/boss");

  if (message.client?.botTtsTestMode && message.client?.botTtsTestChannelId) {
    let testChan = message.client.channels.cache.get(message.client.botTtsTestChannelId);
    if (!testChan && message.client.channels.fetch) {
      testChan = await message.client.channels.fetch(message.client.botTtsTestChannelId).catch(() => null);
    }
    await spawnWorldBoss([testChan || message.channel]);
    await message.reply("🐉 World Boss invocado no canal de teste!");
    return true;
  }

  await spawnWorldBoss([message.channel]);
  await message.reply("🐉 World Boss invocado manualmente!");
  return true;
}

async function handleSpawnMiniBossCommand(message) {
  if (!requireSuperAdmin(message)) return true;
  const { spawnMiniBossEvent } = require("../games/boss");
  await spawnMiniBossEvent(message.client, message.channel.id);
  await message.reply("👾 Mini Boss invocado manualmente!");
  return true;
}

async function handleEconAdminCommand(message) {
  if (!requireSuperAdmin(message)) return true;
  const { EmbedBuilder } = require("discord.js");
  const { getLedgerEvents } = require("../economy/ledger");

  const events = getLedgerEvents();
  const embed = new EmbedBuilder()
    .setColor("#00FFFF")
    .setTitle("📊 Resumo Executivo da Economia")
    .setDescription(`Total de eventos registrados no ledger: ${events.length}`);

  await message.reply({ embeds: [embed] });
  return true;
}

async function handleAdminAuthCommand(message) {
  const command = message.content.trim().toLowerCase();
  if (command.startsWith("!spawn_boss") || command.startsWith("!spawnboss")) {
    return handleSpawnBossCommand(message);
  }
  if (command.startsWith("!spawn_miniboss") || command.startsWith("!spawn_mini")) {
    return handleSpawnMiniBossCommand(message);
  }
  if (command.startsWith("!econadmin")) {
    return handleEconAdminCommand(message);
  }
  return false;
}

module.exports = {
  isSuperAdmin,
  requireSuperAdmin,
  handleAdminAuthCommand,
  handleSpawnBossCommand,
  handleSpawnMiniBossCommand,
  handleEconAdminCommand
};
