const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const config = require("../core/config");
const { createDebouncedJsonWriter, writeJsonFileSync } = require("../core/storage");
const { getCoins, addCoins, removeCoins, formatCoins, getAllBalances } = require("./economy");
const { addItem, hasItem, removeItem, getUserInventory } = require("./inventory");
const { recordLedgerEvent } = require("./ledger");
const { isSuperAdmin } = require("../admin/admin");

const RAIDS_PATH = path.join(process.cwd(), "data", "economy", "raids.json");
const RAID_SERVERS_PATH = path.join(process.cwd(), "data", "economy", "raidServers.json");

let raidDb = { raids: {}, userCooldowns: {} };
let serverDb = { servers: {} };
const timers = new Map();
let disableSavingForTests = false;

function raidConfig() {
  return {
    minStake: 2000,
    attackCooldownMs: 12 * 60 * 60 * 1000,
    defenderShieldMs: 6 * 60 * 60 * 1000,
    lobbyDurationMs: 3 * 60 * 1000,
    activeDurationMs: 5 * 60 * 1000,
    minParticipants: 2,
    protectedBalance: 500,
    maxLossPercentPerUser: 0.08,
    maxLossFlatPerUser: 500,
    baseStealChance: 0.35,
    attackerBonusPerParticipant: 0.02,
    attackerBonusMax: 0.2,
    defenderBonusPerParticipant: 0.03,
    defenderBonusMax: 0.3,
    minStealChance: 0.05,
    maxStealChance: 0.75,
    maxTargetsPerRaid: 20,
    warTaxPercent: 0.1,
    maxItemsPerUserPerRaid: 1,
    participantCooldownMs: 3 * 60 * 60 * 1000,
    ...(config.static.app.raid || {})
  };
}

function loadJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      writeJsonFileSync(filePath, fallback);
      return JSON.parse(JSON.stringify(fallback));
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : JSON.parse(JSON.stringify(fallback));
  } catch (err) {
    console.error(`Erro ao carregar ${filePath}:`, err);
    return JSON.parse(JSON.stringify(fallback));
  }
}

function loadRaids() {
  raidDb = loadJsonFile(RAIDS_PATH, { raids: {}, userCooldowns: {} });
  if (!raidDb.raids) raidDb.raids = {};
  if (!raidDb.userCooldowns) raidDb.userCooldowns = {};
}

function loadServers() {
  serverDb = loadJsonFile(RAID_SERVERS_PATH, { servers: {} });
  if (!serverDb.servers) serverDb.servers = {};
}

const saveRaids = createDebouncedJsonWriter(RAIDS_PATH, () => raidDb, config.static.app.timers?.saveDebounceMs || 2000);
const saveServers = createDebouncedJsonWriter(RAID_SERVERS_PATH, () => serverDb, config.static.app.timers?.saveDebounceMs || 2000);

function saveRaidsSync() {
  if (disableSavingForTests) return;
  writeJsonFileSync(RAIDS_PATH, raidDb);
}

function saveServersSync() {
  if (disableSavingForTests) return;
  writeJsonFileSync(RAID_SERVERS_PATH, serverDb);
}

loadRaids();
loadServers();

function now() {
  return Date.now();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean).map(String)));
}

function getRaidItems(side = null) {
  return Object.entries(config.static.shop?.boosts || {})
    .filter(([, item]) => item.type === "raid_consumable")
    .filter(([, item]) => side ? item.side === side : true)
    .map(([id, item]) => ({ id, ...item }));
}

function getRaidItem(itemId) {
  const item = config.static.shop?.boosts?.[itemId];
  return item?.type === "raid_consumable" ? { id: itemId, ...item } : null;
}

function getServer(guildId) {
  return serverDb.servers[String(guildId)] || null;
}

function getConfiguredServers() {
  return Object.values(serverDb.servers).filter((server) => server.enabled !== false);
}

function registerServer({ guildId, name, eventChannelId, enabled = true, canAttack = true, canBeRaided = true }) {
  if (!guildId || !eventChannelId) return { ok: false, reason: "Servidor ou canal inválido." };
  const current = serverDb.servers[String(guildId)] || {};
  serverDb.servers[String(guildId)] = {
    guildId: String(guildId),
    name: name || current.name || `Servidor ${guildId}`,
    eventChannelId: String(eventChannelId),
    enabled,
    canAttack,
    canBeRaided,
    lastAttackAt: current.lastAttackAt || 0,
    lastRaidedAt: current.lastRaidedAt || 0,
    shieldUntil: current.shieldUntil || 0
  };
  saveServersSync();
  return { ok: true, server: serverDb.servers[String(guildId)] };
}

function disableServer(guildId) {
  const server = getServer(guildId);
  if (!server) return { ok: false, reason: "Servidor não cadastrado." };
  server.enabled = false;
  saveServersSync();
  return { ok: true, server };
}

function ensureCurrentServer(message) {
  const guildId = message.guild?.id;
  if (!guildId) return null;
  return getServer(guildId) || registerServer({
    guildId,
    name: message.guild?.name || `Servidor ${guildId}`,
    eventChannelId: message.channelId || message.channel?.id,
    enabled: true,
    canAttack: true,
    canBeRaided: true
  }).server;
}

function getRaidableServers(currentGuildId, client = null) {
  const current = String(currentGuildId);
  const testChannelId = client?.botTtsTestChannelId || config.static.app.test?.channelId || "1348716118981742592";
  const isTestMode = client?.botTtsTestMode === true;
  return getConfiguredServers()
    .filter((server) => server.canBeRaided !== false)
    .filter((server) => String(server.guildId) !== current)
    .filter((server) => isTestMode || String(server.eventChannelId) !== String(testChannelId))
    .map((server, index) => ({
      internalId: String(index + 1),
      ...server,
      status: getServerRaidStatusLabel(server.guildId)
    }));
}

function getServerRaidStatusLabel(guildId) {
  const server = getServer(guildId);
  if (!server) return "Não cadastrado";
  if (server.shieldUntil && server.shieldUntil > now()) {
    return `Protegido por ${Math.ceil((server.shieldUntil - now()) / 3600000)}h`;
  }
  if (server.lastAttackAt && now() - server.lastAttackAt < raidConfig().attackCooldownMs) {
    return "Em cooldown";
  }
  if (findActiveRaidForGuild(guildId)) return "Em Raid";
  return "Disponível";
}

function getTargetByInternalId(currentGuildId, internalId, client = null) {
  return getRaidableServers(currentGuildId, client).find((server) => server.internalId === String(internalId)) || null;
}

function findRaidByStatus(guildId, statuses) {
  const wanted = new Set(statuses);
  return Object.values(raidDb.raids).find((raid) =>
    wanted.has(raid.status) &&
    [raid.attackerGuildId, raid.defenderGuildId].includes(String(guildId))
  ) || null;
}

function findActiveRaidForGuild(guildId) {
  return findRaidByStatus(guildId, ["lobby", "active", "resolving"]);
}

function getRaidSide(raid, guildId) {
  if (!raid) return null;
  if (String(raid.attackerGuildId) === String(guildId)) return "attack";
  if (String(raid.defenderGuildId) === String(guildId)) return "defense";
  return null;
}

function canServerAttack(server) {
  if (!server || server.enabled === false || server.canAttack === false) {
    return { ok: false, reason: "Este servidor não está habilitado para atacar." };
  }
  if (findActiveRaidForGuild(server.guildId)) {
    return { ok: false, reason: "Este servidor já está envolvido em uma Raid." };
  }
  const remaining = raidConfig().attackCooldownMs - (now() - (server.lastAttackAt || 0));
  if (remaining > 0) {
    return { ok: false, reason: `Este servidor ainda está em cooldown por ${Math.ceil(remaining / 60000)} min.` };
  }
  return { ok: true };
}

function canServerBeRaided(server) {
  if (!server || server.enabled === false || server.canBeRaided === false) {
    return { ok: false, reason: "Servidor alvo não pode ser raidado." };
  }
  if (findActiveRaidForGuild(server.guildId)) {
    return { ok: false, reason: "Servidor alvo já está envolvido em uma Raid." };
  }
  if (server.shieldUntil && server.shieldUntil > now()) {
    return { ok: false, reason: `Servidor alvo está protegido por ${Math.ceil((server.shieldUntil - now()) / 60000)} min.` };
  }
  return { ok: true };
}

function buildRaidId() {
  return `raid_${now()}_${Math.floor(Math.random() * 10000)}`;
}

function createRaid({ attackerGuildId, attackerChannelId, createdBy, targetInternalId, stake, guildName, client = null }) {
  const cfg = raidConfig();
  const attacker = getServer(attackerGuildId) || registerServer({
    guildId: attackerGuildId,
    name: guildName || `Servidor ${attackerGuildId}`,
    eventChannelId: attackerChannelId
  }).server;
  const target = getTargetByInternalId(attackerGuildId, targetInternalId, client);

  if (!target) return { ok: false, reason: "Servidor alvo inválido." };
  const attackGate = canServerAttack(attacker);
  if (!attackGate.ok) return attackGate;
  const defenseGate = canServerBeRaided(target);
  if (!defenseGate.ok) return defenseGate;
  if (!Number.isInteger(stake) || stake < cfg.minStake) return { ok: false, reason: `Valor mínimo: ${formatCoins(cfg.minStake)} NC.` };
  if (getCoins(createdBy) < stake) return { ok: false, reason: "Saldo insuficiente para iniciar a Raid." };

  removeCoins(createdBy, stake);

  const createdAt = now();
  const raid = {
    id: buildRaidId(),
    status: "lobby",
    attackerGuildId: String(attacker.guildId),
    defenderGuildId: String(target.guildId),
    attackerChannelId: String(attackerChannelId || attacker.eventChannelId),
    defenderChannelId: String(target.eventChannelId),
    attackerName: attacker.name,
    defenderName: target.name,
    createdBy: String(createdBy),
    stake,
    participants: [String(createdBy)],
    defenders: [],
    attackItems: [],
    defenseItems: [],
    itemUsers: [],
    createdAt,
    startsAt: createdAt + cfg.lobbyDurationMs,
    endsAt: null,
    result: null
  };

  raidDb.raids[raid.id] = raid;
  saveRaidsSync();
  recordLedgerEvent("raid_created", {
    raidId: raid.id,
    userId: createdBy,
    attackerGuildId: raid.attackerGuildId,
    defenderGuildId: raid.defenderGuildId,
    amount: stake
  });
  scheduleRaid(raid.id, client);
  return { ok: true, raid };
}

function joinRaid(userId, raidId) {
  const raid = raidDb.raids[raidId];
  if (!raid || raid.status !== "lobby") return { ok: false, reason: "Lobby não encontrado." };
  const cooldownUntil = raidDb.userCooldowns[String(userId)] || 0;
  if (cooldownUntil > now()) return { ok: false, reason: `Você ainda está em cooldown por ${Math.ceil((cooldownUntil - now()) / 60000)} min.` };
  if (!raid.participants.includes(String(userId))) raid.participants.push(String(userId));
  saveRaidsSync();
  recordLedgerEvent("raid_joined", { raidId, userId, attackerGuildId: raid.attackerGuildId, defenderGuildId: raid.defenderGuildId });
  return { ok: true, raid };
}

function leaveRaid(userId, raidId) {
  const raid = raidDb.raids[raidId];
  if (!raid || raid.status !== "lobby") return { ok: false, reason: "Lobby não encontrado." };
  if (raid.createdBy === String(userId)) return { ok: false, reason: "O criador deve cancelar a Raid para sair." };
  raid.participants = raid.participants.filter((id) => id !== String(userId));
  saveRaidsSync();
  recordLedgerEvent("raid_left", { raidId, userId });
  return { ok: true, raid };
}

function cancelRaid(userId, raidId, reason = "cancelled") {
  const raid = raidDb.raids[raidId];
  if (!raid || raid.status !== "lobby") return { ok: false, reason: "Lobby não encontrado ou já iniciado." };
  if (raid.createdBy !== String(userId)) return { ok: false, reason: "Apenas o criador pode cancelar." };
  raid.status = reason;
  raid.cancelledAt = now();
  addCoins(raid.createdBy, raid.stake);
  clearRaidTimer(raid.id);
  saveRaidsSync();
  recordLedgerEvent("raid_cancelled", { raidId, userId, attackerGuildId: raid.attackerGuildId, defenderGuildId: raid.defenderGuildId, amount: raid.stake, reason });
  return { ok: true, raid };
}

async function startRaid(userId, raidId, client = null, force = false) {
  const raid = raidDb.raids[raidId];
  if (!raid || raid.status !== "lobby") return { ok: false, reason: "Lobby não encontrado." };
  if (!force && raid.createdBy !== String(userId)) return { ok: false, reason: "Apenas o criador pode iniciar agora." };
  if (raid.participants.length < raidConfig().minParticipants) {
    return cancelRaid(raid.createdBy, raidId, "cancelled_min_participants");
  }

  raid.status = "active";
  raid.startedAt = now();
  raid.endsAt = raid.startedAt + raidConfig().activeDurationMs;
  const attacker = getServer(raid.attackerGuildId);
  if (attacker) attacker.lastAttackAt = now();
  raid.participants.forEach((participantId) => {
    raidDb.userCooldowns[participantId] = now() + raidConfig().participantCooldownMs;
  });
  saveRaidsSync();
  saveServersSync();
  recordLedgerEvent("raid_started", {
    raidId,
    userId,
    attackerGuildId: raid.attackerGuildId,
    defenderGuildId: raid.defenderGuildId,
    participants: raid.participants.length,
    amount: raid.stake
  });
  await sendDefenderAlert(raid, client);
  scheduleRaid(raid.id, client);
  return { ok: true, raid };
}

function defendRaid(userId, guildId) {
  const raid = findRaidByStatus(guildId, ["active"]);
  if (!raid || raid.defenderGuildId !== String(guildId)) return { ok: false, reason: "Este servidor não está defendendo uma Raid ativa." };
  if (!raid.defenders.includes(String(userId))) raid.defenders.push(String(userId));
  saveRaidsSync();
  recordLedgerEvent("raid_defended", { raidId: raid.id, userId, defenderGuildId: raid.defenderGuildId, attackerGuildId: raid.attackerGuildId });
  return { ok: true, raid };
}

function buyRaidItem(userId, itemId) {
  const item = getRaidItem(itemId);
  if (!item) return { ok: false, reason: "Item de Raid inválido." };
  if (getCoins(userId) < item.cost) return { ok: false, reason: "Saldo insuficiente." };
  removeCoins(userId, item.cost);
  addItem(userId, itemId, 1);
  recordLedgerEvent("raid_item_bought", { userId, itemId, side: item.side, amount: item.cost });
  return { ok: true, item };
}

function useRaidItem(userId, guildId, itemId) {
  const item = getRaidItem(itemId);
  if (!item) return { ok: false, reason: "Item de Raid inválido." };
  const raid = findRaidByStatus(guildId, ["active"]);
  if (!raid) return { ok: false, reason: "Não há Raid ativa envolvendo este servidor." };
  const side = getRaidSide(raid, guildId);
  if (side !== item.side) return { ok: false, reason: "Este item não serve para o seu lado da Raid." };
  if ((raid.itemUsers || []).includes(String(userId))) return { ok: false, reason: "Você já usou um item nesta Raid." };
  if (!hasItem(userId, itemId, 1)) return { ok: false, reason: "Você não possui este item." };

  removeItem(userId, itemId, 1);
  const applied = {
    userId: String(userId),
    itemId,
    label: item.label,
    effect: item.effect || {},
    usedAt: now()
  };
  if (side === "attack") raid.attackItems.push(applied);
  else raid.defenseItems.push(applied);
  raid.itemUsers = unique([...(raid.itemUsers || []), userId]);
  saveRaidsSync();
  recordLedgerEvent("raid_item_used", { raidId: raid.id, userId, itemId, side, attackerGuildId: raid.attackerGuildId, defenderGuildId: raid.defenderGuildId });
  return { ok: true, raid, item };
}

function sumEffect(items, key) {
  return items.reduce((sum, item) => sum + (Number(item.effect?.[key]) || 0), 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function estimateLabel(value) {
  if (value >= 0.6) return "Alta";
  if (value >= 0.35) return "Média";
  return "Baixa";
}

function calculateRaidChance(raid) {
  const cfg = raidConfig();
  const attackerBonus = Math.min((raid.participants?.length || 0) * cfg.attackerBonusPerParticipant, cfg.attackerBonusMax);
  let defenderBonus = Math.min((raid.defenders?.length || 0) * cfg.defenderBonusPerParticipant, cfg.defenderBonusMax);
  defenderBonus += sumEffect(raid.defenseItems || [], "defenseChanceBonus");
  defenderBonus = Math.max(0, defenderBonus - sumEffect(raid.attackItems || [], "defenseReduction"));
  const itemAttackBonus = sumEffect(raid.attackItems || [], "attackChanceBonus");
  return clamp(cfg.baseStealChance + attackerBonus + itemAttackBonus - defenderBonus, cfg.minStealChance, cfg.maxStealChance);
}

function calculateMaxTargets(raid) {
  return raidConfig().maxTargetsPerRaid + sumEffect(raid.attackItems || [], "maxTargetsBonus");
}

function calculateLossCap(raid, balance) {
  const cfg = raidConfig();
  const available = Math.max(0, balance - cfg.protectedBalance);
  const reduction = Math.min(0.9, sumEffect(raid.defenseItems || [], "maxLossReduction"));
  const flatCap = Math.floor(cfg.maxLossFlatPerUser * (1 - reduction));
  return Math.max(0, Math.floor(Math.min(available * cfg.maxLossPercentPerUser, flatCap)));
}

async function getEligibleDefenderTargets(raid, client = null) {
  const balances = getAllBalances();
  const cfg = raidConfig();
  const guild = client?.guilds?.cache?.get?.(raid.defenderGuildId);
  const memberIds = new Set();
  if (guild?.members?.cache) {
    for (const [memberId, member] of guild.members.cache.entries()) {
      if (!member.user?.bot) memberIds.add(String(memberId));
    }
  }

  return Object.entries(balances)
    .filter(([, balance]) => balance > cfg.protectedBalance)
    .filter(([userId]) => memberIds.size === 0 || memberIds.has(String(userId)))
    .map(([userId, balance]) => ({ userId, balance }))
    .slice(0, calculateMaxTargets(raid));
}

async function resolveRaid(raidId, { client = null, rng = Math.random, eligibleTargets = null } = {}) {
  const raid = raidDb.raids[raidId];
  if (!raid || raid.status !== "active") return { ok: false, reason: "Raid ativa não encontrada." };
  raid.status = "resolving";
  saveRaidsSync();

  const chance = calculateRaidChance(raid);
  const targets = (eligibleTargets || await getEligibleDefenderTargets(raid, client)).slice(0, calculateMaxTargets(raid));
  let successCount = 0;
  let failCount = 0;
  let totalStolen = 0;

  for (const target of targets) {
    const currentBalance = getCoins(target.userId);
    const loss = calculateLossCap(raid, currentBalance);
    if (loss <= 0) continue;
    if (rng() < chance) {
      removeCoins(target.userId, loss);
      totalStolen += loss;
      successCount += 1;
      recordLedgerEvent("raid_steal_success", {
        raidId,
        targetId: target.userId,
        attackerGuildId: raid.attackerGuildId,
        defenderGuildId: raid.defenderGuildId,
        amount: loss
      });
    } else {
      failCount += 1;
      recordLedgerEvent("raid_steal_failed", {
        raidId,
        targetId: target.userId,
        attackerGuildId: raid.attackerGuildId,
        defenderGuildId: raid.defenderGuildId
      });
    }
  }

  const tax = Math.floor(totalStolen * raidConfig().warTaxPercent);
  const distributed = totalStolen - tax;
  const participants = unique(raid.participants || []);
  const share = participants.length > 0 ? Math.floor(distributed / participants.length) : 0;
  for (const participant of participants) {
    if (share > 0) addCoins(participant, share);
    recordLedgerEvent("raid_reward_paid", { raidId, userId: participant, amount: share });
  }
  if (tax > 0) recordLedgerEvent("raid_tax", { raidId, amount: tax, attackerGuildId: raid.attackerGuildId, defenderGuildId: raid.defenderGuildId });

  const defender = getServer(raid.defenderGuildId);
  if (defender) {
    defender.lastRaidedAt = now();
    defender.shieldUntil = now() + raidConfig().defenderShieldMs;
  }

  raid.status = "completed";
  raid.completedAt = now();
  raid.result = {
    chance,
    successCount,
    failCount,
    totalStolen,
    tax,
    distributed,
    share,
    targets: targets.length
  };
  clearRaidTimer(raid.id);
  saveRaidsSync();
  saveServersSync();

  recordLedgerEvent("raid_resolved", {
    raidId,
    attackerGuildId: raid.attackerGuildId,
    defenderGuildId: raid.defenderGuildId,
    participants: participants.length,
    defenders: (raid.defenders || []).length,
    successCount,
    failCount,
    totalStolen,
    tax
  });

  await sendRaidResult(raid, client);
  return { ok: true, raid, result: raid.result };
}

function clearRaidTimer(raidId) {
  const timer = timers.get(raidId);
  if (timer) clearTimeout(timer);
  timers.delete(raidId);
}

function scheduleRaid(raidId, client = null) {
  clearRaidTimer(raidId);
  const raid = raidDb.raids[raidId];
  if (!raid || !["lobby", "active"].includes(raid.status)) return;
  const targetTime = raid.status === "lobby" ? raid.startsAt : raid.endsAt;
  const delay = Math.max(1000, targetTime - now());
  const timer = setTimeout(async () => {
    const current = raidDb.raids[raidId];
    if (!current) return;
    if (current.status === "lobby") await startRaid(current.createdBy, raidId, client, true);
    else if (current.status === "active") await resolveRaid(raidId, { client });
  }, delay);
  timer.unref?.();
  timers.set(raidId, timer);
}

function scheduleExistingRaids(client = null) {
  for (const raid of Object.values(raidDb.raids)) {
    scheduleRaid(raid.id, client);
  }
}

async function fetchChannel(client, channelId) {
  if (!client || !channelId) return null;
  if (client.botTtsTestMode && String(channelId) !== String(client.botTtsTestChannelId)) return null;
  return client.channels?.cache?.get?.(channelId) || await client.channels?.fetch?.(channelId).catch(() => null);
}

async function sendDefenderAlert(raid, client = null) {
  const channel = await fetchChannel(client, raid.defenderChannelId);
  if (!channel?.send) return false;
  await channel.send({
    content: `🚨 **Este servidor está sendo raidado!**\n\nAtacante: **${raid.attackerName}**\nParticipantes atacantes: **${raid.participants.length}**\nPote de ataque: **${formatCoins(raid.stake)} NC**\nTempo restante: **${Math.round(raidConfig().activeDurationMs / 60000)} min**`,
    components: raidDefenseRows()
  }).catch(() => null);
  return true;
}

async function sendRaidResult(raid, client = null) {
  const attackerChannel = await fetchChannel(client, raid.attackerChannelId);
  const defenderChannel = await fetchChannel(client, raid.defenderChannelId);
  const result = raid.result || {};
  if (attackerChannel?.send) {
    await attackerChannel.send(`⚔️ **Raid finalizada!**\n\nAlvo: **${raid.defenderName}**\nParticipantes: **${raid.participants.length}**\nRoubos bem-sucedidos: **${result.successCount || 0}**\nRoubos falhos: **${result.failCount || 0}**\nTotal roubado: **${formatCoins(result.totalStolen || 0)} NC**\nTaxa de guerra: **${formatCoins(result.tax || 0)} NC**\nDistribuído: **${formatCoins(result.distributed || 0)} NC**\nCada participante recebeu: **${formatCoins(result.share || 0)} NC**`).catch(() => null);
  }
  if (defenderChannel?.send) {
    await defenderChannel.send(`🛡️ **Raid finalizada!**\n\nAtacante: **${raid.attackerName}**\nDefensores ativos: **${raid.defenders.length}**\nRoubos bloqueados: **${result.failCount || 0}**\nRoubos bem-sucedidos: **${result.successCount || 0}**\nTotal perdido pelo servidor: **${formatCoins(result.totalStolen || 0)} NC**`).catch(() => null);
  }
}

function raidPanelRows(guildId) {
  const activeRaid = findActiveRaidForGuild(guildId);
  if (activeRaid?.status === "active") {
    if (activeRaid.defenderGuildId === String(guildId)) return raidDefenseRows();
    if (activeRaid.attackerGuildId === String(guildId)) return raidAttackRows();
  }
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("raid_start").setLabel("Iniciar Raid").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("raid_defend").setLabel("Defender").setEmoji("🛡️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("raid_shop").setLabel("Loja de Raid").setEmoji("🛒").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("raid_use_item").setLabel("Usar Item").setEmoji("🎒").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("raid_status").setLabel("Status da Raid").setEmoji("📊").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("raid_servers").setLabel("Servidores Raidáveis").setEmoji("🌍").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("raid_history").setLabel("Histórico").setEmoji("📜").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function raidDefenseRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("raid_defend").setLabel("Proteger").setEmoji("🛡️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("raid_use_item").setLabel("Usar Item Defensivo").setEmoji("🎒").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("raid_shop").setLabel("Loja de Raid").setEmoji("🛒").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("raid_status").setLabel("Ver Status").setEmoji("📊").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function raidAttackRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("raid_use_item").setLabel("Usar Item Ofensivo").setEmoji("🎒").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("raid_shop").setLabel("Loja de Raid").setEmoji("🛒").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("raid_status").setLabel("Ver Status").setEmoji("📊").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildRaidPanel(guildId) {
  const server = getServer(guildId);
  const raid = findActiveRaidForGuild(guildId);
  const embed = new EmbedBuilder().setColor("#DC2626");
  if (raid?.status === "active") {
    const side = getRaidSide(raid, guildId);
    const remaining = Math.max(0, raid.endsAt - now());
    if (side === "defense") {
      embed
        .setTitle("🛡️ Defesa do Servidor")
        .setDescription(`Estamos sendo raidado por: **${raid.attackerName}**\nTempo restante: **${Math.ceil(remaining / 1000)}s**\nDefensores ativos: **${raid.defenders.length}**\nBônus defensivo atual: **${Math.round(Math.min(raid.defenders.length * raidConfig().defenderBonusPerParticipant, raidConfig().defenderBonusMax) * 100)}%**\nChance estimada de defesa: **${estimateLabel(1 - calculateRaidChance(raid))}**`);
    } else {
      embed
        .setTitle("⚔️ Raid em andamento")
        .setDescription(`Alvo: **${raid.defenderName}**\nParticipantes: **${raid.participants.length}**\nPote inicial: **${formatCoins(raid.stake)} NC**\nItens ofensivos ativos: **${raid.attackItems.length}**\nTempo restante: **${Math.ceil(remaining / 1000)}s**\nForça ofensiva estimada: **${estimateLabel(calculateRaidChance(raid))}**`);
    }
  } else {
    embed
      .setTitle("⚔️ Painel de Raid")
      .setDescription(`Servidor atual: **${server?.name || "Não cadastrado"}**\nStatus: **${server?.enabled === false ? "Desativado" : "Disponível para ataque"}**\nCooldown de ataque: **${getServerRaidStatusLabel(guildId)}**\nProteção contra Raid: **${server?.shieldUntil && server.shieldUntil > now() ? `até ${new Date(server.shieldUntil).toLocaleTimeString("pt-BR")}` : "Nenhuma"}**\n\nO que você deseja fazer?`);
  }
  return { embeds: [embed], components: raidPanelRows(guildId), content: "" };
}

function buildServersPayload(guildId, client = null) {
  const servers = getRaidableServers(guildId, client);
  const lines = servers.map((server) => `ID: **${server.internalId}**\nServidor: **${server.name}**\nStatus: **${server.status}**`).join("\n\n") || "Nenhum servidor raidável configurado.";
  const embed = new EmbedBuilder().setColor("#2563EB").setTitle("🌍 Servidores disponíveis para Raid").setDescription(lines);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("raid_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary))], content: "" };
}

function buildRaidShopPayload(side = null) {
  const items = getRaidItems(side);
  const lines = items.map((item) => `${item.emoji || "🎒"} **${item.label}** — ${formatCoins(item.cost)} NC\n${item.description}`).join("\n\n") || "Nenhum item disponível.";
  const embed = new EmbedBuilder().setColor("#16A34A").setTitle("🛒 Loja de Raid").setDescription(lines);
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("raid_shop_attack").setLabel("Itens de Ataque").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("raid_shop_defense").setLabel("Itens de Defesa").setEmoji("🛡️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("raid_my_items").setLabel("Meus Itens").setEmoji("🎒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("raid_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
      ),
      ...(items.length > 0 ? [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("raid_buy_item")
          .setPlaceholder("Comprar item de Raid...")
          .addOptions(items.slice(0, 25).map((item) => ({
            label: item.label.slice(0, 100),
            description: `${formatCoins(item.cost)} NC - ${item.side === "attack" ? "Ataque" : "Defesa"}`.slice(0, 100),
            value: item.id,
            emoji: item.emoji
          })))
      )] : [])
    ],
    content: ""
  };
}

function buildMyRaidItemsPayload(userId) {
  const inventory = getUserInventory(userId);
  const items = getRaidItems().filter((item) => (inventory.items[item.id] || 0) > 0);
  
  const lines = items.map((item) => `${item.emoji || "🎒"} **${item.label}** x${inventory.items[item.id]}\n${item.description}`).join("\n\n") || "Você não possui nenhum item de Raid.";
  
  const embed = new EmbedBuilder().setColor("#16A34A").setTitle("🎒 Meus Itens de Raid").setDescription(lines);
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("raid_shop").setLabel("Voltar para Loja").setEmoji("🛒").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("raid_home").setLabel("Voltar ao Painel").setStyle(ButtonStyle.Secondary)
      )
    ],
    content: ""
  };
}

function buildUseItemPayload(userId, guildId) {
  const raid = findRaidByStatus(guildId, ["lobby", "active"]);
  if (!raid) return { content: "Não há Raid ativa nem Lobby para este servidor no momento.", embeds: [], components: [] };
  const side = getRaidSide(raid, guildId);
  const inventory = getUserInventory(userId);
  const items = getRaidItems(side)
    .filter((item) => (inventory.items[item.id] || 0) > 0);
  if (items.length === 0) return { content: "Você não possui itens válidos para o seu lado da Raid.", embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("raid_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary))] };
  const embed = new EmbedBuilder().setColor("#9333EA").setTitle("🎒 Usar Item de Raid").setDescription(items.map((item) => `${item.emoji || "🎒"} **${item.label}** x${inventory.items[item.id]}`).join("\n"));
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("raid_use_item_pick")
        .setPlaceholder("Escolha um item...")
        .addOptions(items.map((item) => ({ label: item.label.slice(0, 100), value: item.id, emoji: item.emoji })))
    )],
    content: ""
  };
}

function buildStatusPayload(guildId) {
  const raid = findActiveRaidForGuild(guildId);
  if (!raid) return { content: "📊 Nenhuma Raid ativa envolvendo este servidor.", embeds: [], components: raidPanelRows(guildId) };
  const side = getRaidSide(raid, guildId);
  const remaining = Math.max(0, (raid.status === "lobby" ? raid.startsAt : raid.endsAt) - now());
  const title = side === "defense" ? "🛡️ Status da Defesa" : "⚔️ Status da Raid";
  const description = side === "defense"
    ? `Atacante: **${raid.attackerName}**\nDefensores ativos: **${raid.defenders.length}**\nItens defensivos ativos: **${raid.defenseItems.length}**\nTempo restante: **${Math.ceil(remaining / 1000)}s**\nResistência estimada: **${estimateLabel(1 - calculateRaidChance(raid))}**`
    : `Alvo: **${raid.defenderName}**\nParticipantes: **${raid.participants.length}**\nPote inicial: **${formatCoins(raid.stake)} NC**\nItens ofensivos ativos: **${raid.attackItems.length}**\nTempo restante: **${Math.ceil(remaining / 1000)}s**\nForça ofensiva estimada: **${estimateLabel(calculateRaidChance(raid))}**`;
  return { embeds: [new EmbedBuilder().setColor("#F59E0B").setTitle(title).setDescription(description)], components: raidPanelRows(guildId), content: "" };
}

function buildHistoryPayload(guildId) {
  const raids = Object.values(raidDb.raids)
    .filter((raid) => [raid.attackerGuildId, raid.defenderGuildId].includes(String(guildId)))
    .filter((raid) => ["completed", "cancelled", "cancelled_min_participants", "expired"].includes(raid.status))
    .slice(-5)
    .reverse();
  const lines = raids.map((raid) => `\`${raid.id}\` ${raid.attackerName} vs ${raid.defenderName} — **${raid.status}** — roubado: ${formatCoins(raid.result?.totalStolen || 0)} NC`).join("\n") || "Sem histórico de Raid.";
  return { embeds: [new EmbedBuilder().setColor("#64748B").setTitle("📜 Histórico de Raid").setDescription(lines)], components: raidPanelRows(guildId), content: "" };
}

function buildRaidLobbyPayload(raid) {
  const content = `⚔️ **Raid sendo preparada!**\n\nAlvo: **${raid.defenderName}**\nPote inicial: **${formatCoins(raid.stake)} NC**\nParticipantes: **${raid.participants.length}**\nTempo para iniciar: **${Math.ceil((raid.startsAt - now()) / 60000)} min**\n\nParticipando:\n${raid.participants.map((id) => `<@${id}>`).join("\n")}`;
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`raid_join_${raid.id}`).setLabel("Participar").setEmoji("⚔️").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`raid_leave_${raid.id}`).setLabel("Sair").setEmoji("❌").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`raid_startnow_${raid.id}`).setLabel("Iniciar agora").setEmoji("🚀").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`raid_cancel_${raid.id}`).setLabel("Cancelar").setEmoji("🛑").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("raid_shop").setLabel("Loja").setEmoji("🛒").setStyle(ButtonStyle.Primary)
    )
  ];
  return { content, components: rows };
}

async function showRaidLobbyMessage(message, raid) {
  return message.reply(buildRaidLobbyPayload(raid));
}

async function handleRaidCommand(message, text = "") {
  const allowedChannels = config.static.app.events?.channelIds || [];
  const testChannelId = config.static.app.test?.channelId || "1348716118981742592";
  const isAllowed = allowedChannels.includes(String(message.channelId)) || 
                    (message.client?.botTtsTestMode && String(message.channelId) === String(testChannelId));

  if (!isAllowed) return message.reply("❌ O sistema de Raid só pode ser utilizado nos servidores oficiais autorizados do BotTTs.");

  ensureCurrentServer(message);
  const args = (text || "").trim().split(/\s+/).filter(Boolean);
  const sub = (args[0] || "").toLowerCase();

  if (sub === "admin") {
    if (!isSuperAdmin(message.author.id)) return message.reply("❌ Apenas o Superadmin pode administrar Raids.");
    const action = (args[1] || "").toLowerCase();
    if (action === "cadastrar") {
      const name = args.slice(2).join(" ") || message.guild.name;
      const result = registerServer({ guildId: message.guild.id, name, eventChannelId: message.channelId, enabled: true, canAttack: true, canBeRaided: true });
      return message.reply(result.ok ? `✅ Servidor cadastrado para Raid: **${result.server.name}** neste canal.` : `❌ ${result.reason}`);
    }
    if (action === "desativar") {
      const result = disableServer(message.guild.id);
      return message.reply(result.ok ? "✅ Raid desativada neste servidor." : `❌ ${result.reason}`);
    }
  }

  if (sub === "iniciar") {
    const targetId = args[1];
    const stake = Number(args[2]);
    const result = createRaid({
      attackerGuildId: message.guild.id,
      attackerChannelId: message.channelId,
      createdBy: message.author.id,
      targetInternalId: targetId,
      stake,
      guildName: message.guild.name,
      client: message.client
    });
    if (!result.ok) return message.reply(`❌ ${result.reason}`);
    return showRaidLobbyMessage(message, result.raid);
  }

  if (sub === "proteger") {
    const result = defendRaid(message.author.id, message.guild.id);
    return message.reply(result.ok ? "🛡️ Você está protegendo o servidor nesta Raid." : `❌ ${result.reason}`);
  }

  if (sub === "status") return message.reply(buildStatusPayload(message.guild.id));
  if (sub === "loja") return message.reply(buildRaidShopPayload());
  if (sub === "servidores") return message.reply(buildServersPayload(message.guild.id, message.client));

  return message.reply(buildRaidPanel(message.guild.id));
}

async function handleRaidInteraction(interaction) {
  if (!interaction.customId?.startsWith("raid_")) return false;
  
  const allowedChannels = config.static.app.events?.channelIds || [];
  const testChannelId = config.static.app.test?.channelId || "1348716118981742592";
  const isAllowed = allowedChannels.includes(String(interaction.channelId)) || 
                    (interaction.client?.botTtsTestMode && String(interaction.channelId) === String(testChannelId));

  if (!isAllowed) {
    if (interaction.isRepliable()) await interaction.reply({ content: "❌ Canal não autorizado para Raids.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const guildId = interaction.guildId || interaction.guild?.id;
  if (!guildId) return false;

  if (interaction.isButton()) {
    if (interaction.customId === "raid_home") return interaction.update(buildRaidPanel(guildId));
    if (interaction.customId === "raid_servers") return interaction.update(buildServersPayload(guildId, interaction.client));
    if (interaction.customId === "raid_shop") return interaction.update(buildRaidShopPayload());
    if (interaction.customId === "raid_shop_attack") return interaction.update(buildRaidShopPayload("attack"));
    if (interaction.customId === "raid_shop_defense") return interaction.update(buildRaidShopPayload("defense"));
    if (interaction.customId === "raid_my_items") return interaction.update(buildMyRaidItemsPayload(interaction.user.id));
    if (interaction.customId === "raid_status") return interaction.update(buildStatusPayload(guildId));
    if (interaction.customId === "raid_history") return interaction.update(buildHistoryPayload(guildId));
    if (interaction.customId === "raid_use_item") return interaction.update(buildUseItemPayload(interaction.user.id, guildId));
    if (interaction.customId === "raid_defend") {
      const result = defendRaid(interaction.user.id, guildId);
      return interaction.reply({ content: result.ok ? "🛡️ Você está protegendo este servidor." : `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    }
    if (interaction.customId === "raid_start") {
      const servers = getRaidableServers(guildId, interaction.client);
      if (servers.length === 0) return interaction.reply({ content: "Nenhum servidor raidável configurado.", flags: MessageFlags.Ephemeral });
      const modal = new ModalBuilder()
        .setCustomId("raid_start_modal")
        .setTitle("Iniciar Raid")
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("target").setLabel("ID interno do servidor alvo").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("stake").setLabel(`Valor mínimo: ${raidConfig().minStake} NC`).setStyle(TextInputStyle.Short).setRequired(true))
        );
      return interaction.showModal(modal);
    }

    const parts = interaction.customId.split("_");
    const action = parts[1];
    const raidId = parts.slice(2).join("_");
    if (["join", "leave", "startnow", "cancel"].includes(action)) {
      let result;
      if (action === "join") result = joinRaid(interaction.user.id, raidId);
      if (action === "leave") result = leaveRaid(interaction.user.id, raidId);
      if (action === "cancel") result = cancelRaid(interaction.user.id, raidId);
      if (action === "startnow") result = await startRaid(interaction.user.id, raidId, interaction.client);
      if (!result.ok) {
        return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
      }
      
      if (action === "cancel") {
        return interaction.update({ content: "Raid cancelada.", components: [] });
      }
      if (action === "startnow") {
        return interaction.update({ content: "Raid iniciada com sucesso!", components: [] });
      }
      
      const raid = raidDb.raids[raidId];
      if (raid) {
        return interaction.update(buildRaidLobbyPayload(raid));
      }
      
      const okText = {
        join: "Você entrou na Raid.",
        leave: "Você saiu da Raid."
      }[action];
      return interaction.update({ content: `✅ ${okText}` });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === "raid_start_modal") {
    const targetInternalId = interaction.fields.getTextInputValue("target").trim();
    const stake = Number(interaction.fields.getTextInputValue("stake").trim());
    const result = createRaid({
      attackerGuildId: guildId,
      attackerChannelId: interaction.channelId,
      createdBy: interaction.user.id,
      targetInternalId,
      stake,
      guildName: interaction.guild?.name,
      client: interaction.client
    });
    if (!result.ok) return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: "✅ Lobby de Raid criado.", flags: MessageFlags.Ephemeral });
    await showRaidLobbyMessage({ reply: (payload) => interaction.channel.send(payload) }, result.raid);
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "raid_buy_item") {
    const result = buyRaidItem(interaction.user.id, interaction.values[0]);
    return interaction.reply({ content: result.ok ? `✅ Você comprou **${result.item.label}**.` : `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "raid_use_item_pick") {
    const result = useRaidItem(interaction.user.id, guildId, interaction.values[0]);
    return interaction.reply({ content: result.ok ? `✅ Item **${result.item.label}** usado nesta Raid.` : `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
  }

  return true;
}

module.exports = {
  handleRaidCommand,
  handleRaidInteraction,
  registerServer,
  disableServer,
  getRaidableServers,
  createRaid,
  joinRaid,
  leaveRaid,
  cancelRaid,
  startRaid,
  defendRaid,
  buyRaidItem,
  useRaidItem,
  resolveRaid,
  calculateRaidChance,
  calculateLossCap,
  getRaidItems,
  getRaidItem,
  findActiveRaidForGuild,
  scheduleExistingRaids,
  __setDbForTests(nextRaidDb = { raids: {}, userCooldowns: {} }, nextServerDb = { servers: {} }) {
    for (const raidId of timers.keys()) clearRaidTimer(raidId);
    raidDb = JSON.parse(JSON.stringify(nextRaidDb));
    serverDb = JSON.parse(JSON.stringify(nextServerDb));
    if (!raidDb.raids) raidDb.raids = {};
    if (!raidDb.userCooldowns) raidDb.userCooldowns = {};
    if (!serverDb.servers) serverDb.servers = {};
  },
  __getDbForTests() {
    return {
      raids: JSON.parse(JSON.stringify(raidDb)),
      servers: JSON.parse(JSON.stringify(serverDb))
    };
  },
  __disableSavingForTests(value = true) {
    disableSavingForTests = value;
  }
};
