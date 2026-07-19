const config = require("../core/config");

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
  return false;
}

module.exports = {
  isSuperAdmin,
  requireSuperAdmin,
  handleAdminCommand
};
