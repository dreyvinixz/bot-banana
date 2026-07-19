const fs = require("fs");
const config = require("../core/config");
const { addCoins } = require("./economy");
const { createDebouncedJsonWriter } = require("../core/storage");

// Estrutura do inventário:
// { [userId]: { items: { [itemId]: quantidade }, weapons: [], equippedWeaponId, lastDaily, lastSmokeBomb } }
let db = {};
const INVENTORY_PATH = config.paths.inventory;

function carregarInventario() {
  try {
    if (fs.existsSync(INVENTORY_PATH)) {
      const data = fs.readFileSync(INVENTORY_PATH, "utf-8");
      db = JSON.parse(data);
      for (const userId of Object.keys(db)) {
        ensureUser(userId);
      }
    }
  } catch (err) {
    console.error("Erro ao carregar inventário:", err);
  }
}

const salvarInventario = createDebouncedJsonWriter(INVENTORY_PATH, () => db, config.static.app.timers.saveDebounceMs);
const { writeJsonFileSync } = require("../core/storage");
let disableSavingForTests = false;

function salvarInventarioSync() {
  if (disableSavingForTests) return;
  writeJsonFileSync(INVENTORY_PATH, db);
}

function scheduleInventarioSave() {
  if (!disableSavingForTests) salvarInventario();
}

function isPositiveIntegerAmount(amount) {
  return Number.isInteger(amount) && amount > 0;
}

function ensureUser(userId) {
  if (!db[userId]) {
    db[userId] = {
      items: {},
      weapons: [],
      equippedWeaponId: null,
      lastDaily: 0,
      lastSmokeBomb: 0
    };
  }

  const current = db[userId];
  if (!current.items) {
    const legacyItems = {};
    for (const [key, value] of Object.entries(current)) {
      if (typeof value === "number" && !["lastDaily", "lastSmokeBomb"].includes(key)) {
        legacyItems[key] = value;
      }
    }
    current.items = legacyItems;
  }
  if (!db[userId].items) db[userId].items = {};
  if (!Array.isArray(db[userId].weapons)) db[userId].weapons = [];
  if (!("equippedWeaponId" in db[userId])) db[userId].equippedWeaponId = null;
  if (!("lastDaily" in db[userId])) db[userId].lastDaily = 0;
  if (!("lastSmokeBomb" in db[userId])) db[userId].lastSmokeBomb = 0;
}

function addItem(userId, itemId, amount = 1) {
  if (!isPositiveIntegerAmount(amount)) return false;
  ensureUser(userId);
  if (!db[userId].items[itemId]) {
    db[userId].items[itemId] = 0;
  }
  db[userId].items[itemId] += amount;
  salvarInventarioSync();
  return true;
}

function removeItem(userId, itemId, amount = 1) {
  if (!isPositiveIntegerAmount(amount)) return false;
  ensureUser(userId);
  if ((db[userId].items[itemId] || 0) >= amount) {
    db[userId].items[itemId] -= amount;
    if (db[userId].items[itemId] <= 0) {
      delete db[userId].items[itemId];
    }
    salvarInventarioSync();
    return true;
  }
  return false;
}

function hasItem(userId, itemId, amount = 1) {
  if (!isPositiveIntegerAmount(amount)) return false;
  ensureUser(userId);
  return (db[userId].items[itemId] || 0) >= amount;
}

function getUserInventory(userId) {
  ensureUser(userId);
  return {
    items: { ...db[userId].items },
    weapons: db[userId].weapons.map((weapon) => ({ ...weapon })),
    equippedWeaponId: db[userId].equippedWeaponId,
    lastDaily: db[userId].lastDaily,
    lastSmokeBomb: db[userId].lastSmokeBomb
  };
}

function addWeaponInstance(userId, weaponInstance) {
  ensureUser(userId);
  db[userId].weapons.push({ ...weaponInstance });
  if (!db[userId].equippedWeaponId) {
    db[userId].equippedWeaponId = weaponInstance.instanceId;
  }
  scheduleInventarioSave();
  return weaponInstance;
}

function updateWeaponInstance(userId, instanceId, updater) {
  ensureUser(userId);
  const index = db[userId].weapons.findIndex((weapon) => weapon.instanceId === instanceId);
  if (index < 0) return null;
  const next = updater({ ...db[userId].weapons[index] });
  if (!next) {
    db[userId].weapons.splice(index, 1);
    if (db[userId].equippedWeaponId === instanceId) {
      db[userId].equippedWeaponId = db[userId].weapons[0]?.instanceId || null;
    }
  } else {
    db[userId].weapons[index] = next;
  }
  scheduleInventarioSave();
  return next;
}

function removeWeaponInstance(userId, instanceId) {
  return updateWeaponInstance(userId, instanceId, () => null) === null;
}

function setEquippedWeapon(userId, instanceId) {
  ensureUser(userId);
  if (instanceId !== null && !db[userId].weapons.some((weapon) => weapon.instanceId === instanceId && !weapon.lockedUntil)) {
    return false;
  }
  db[userId].equippedWeaponId = instanceId;
  scheduleInventarioSave();
  return true;
}

function lockInventoryEntry(userId, entry) {
  ensureUser(userId);
  if (entry.kind === "item") {
    if (!hasItem(userId, entry.itemId, entry.amount || 1)) return false;
    removeItem(userId, entry.itemId, entry.amount || 1);
    salvarInventarioSync();
    return true;
  }
  if (entry.kind === "weapon") {
    const weapon = db[userId].weapons.find((item) => item.instanceId === entry.instanceId && !item.lockedUntil);
    if (!weapon) return false;
    weapon.lockedUntil = entry.lockedUntil || Date.now() + config.static.app.market.orderExpireMs;
    if (db[userId].equippedWeaponId === entry.instanceId) db[userId].equippedWeaponId = null;
    salvarInventarioSync();
    return true;
  }
  return false;
}

function unlockInventoryEntry(userId, entry) {
  ensureUser(userId);
  if (entry.kind === "item") {
    addItem(userId, entry.itemId, entry.amount || 1);
    salvarInventarioSync();
    return true;
  }
  if (entry.kind === "weapon") {
    const success = !!updateWeaponInstance(userId, entry.instanceId, (weapon) => {
      delete weapon.lockedUntil;
      return weapon;
    });
    if (success) salvarInventarioSync();
    return success;
  }
  return false;
}

function transferLockedEntry(fromUserId, toUserId, entry) {
  ensureUser(fromUserId);
  ensureUser(toUserId);
  if (entry.kind === "item") {
    addItem(toUserId, entry.itemId, entry.amount || 1);
    salvarInventarioSync();
    return true;
  }
  if (entry.kind === "weapon") {
    const index = db[fromUserId].weapons.findIndex((weapon) => weapon.instanceId === entry.instanceId);
    if (index < 0) return false;
    const [weapon] = db[fromUserId].weapons.splice(index, 1);
    delete weapon.lockedUntil;
    db[toUserId].weapons.push(weapon);
    if (db[fromUserId].equippedWeaponId === entry.instanceId) {
      db[fromUserId].equippedWeaponId = db[fromUserId].weapons[0]?.instanceId || null;
    }
    if (!db[toUserId].equippedWeaponId) db[toUserId].equippedWeaponId = weapon.instanceId;
    salvarInventarioSync();
    return true;
  }
  return false;
}

function canClaimSmokeBomb(userId) {
  ensureUser(userId);
  const now = Date.now();
  if (now - db[userId].lastSmokeBomb >= config.static.app.daily.smokeCooldownMs) {
    return true;
  }
  return false;
}

function updateSmokeBombTimer(userId) {
  ensureUser(userId);
  db[userId].lastSmokeBomb = Date.now();
  scheduleInventarioSave();
}

// Roleta Diária
async function handleDailyCommand(message) {
  const userId = message.author.id;
  ensureUser(userId);
  const now = Date.now();

  // Ignora o cooldown se for no canal de testes
  const isTestChannel = message.channel.id === config.static.app.test.channelId;

  if (!isTestChannel && now - db[userId].lastDaily < config.static.app.daily.cooldownMs) {
    const restante = config.static.app.daily.cooldownMs - (now - db[userId].lastDaily);
    const horas = Math.floor(restante / (1000 * 60 * 60));
    const minutos = Math.floor((restante % (1000 * 60 * 60)) / (1000 * 60));
    return message.reply(`⏰ Você já girou a roleta diária! Volte em **${horas}h e ${minutos}m**.`);
  }

  db[userId].lastDaily = now;
  scheduleInventarioSave();

  const rng = Math.random();
  let rewardText = "";

  if (rng < 0.40) {
    // 40% chance de moedas (100 a 500)
    const coins = Math.floor(Math.random() * 401) + 100;
    addCoins(userId, coins);
    rewardText = `**${coins} Nanacoins 🪙**!`;
  } else if (rng < 0.60) {
    // 20% chance de Bomba de Fumaça
    addItem(userId, 'bomba_fumaca', 1);
    rewardText = `uma **Bomba de Fumaça 💨**! (Fica no inventário para escapar da cadeia na 3ª falha do roubo)`;
  } else if (rng < 0.80) {
    // 20% chance de Pé de Coelho
    addItem(userId, 'pe_coelho', 1);
    rewardText = `um **Pé de Coelho 🐰**! (Use-o no seu próximo !beijarmuro para garantir prêmios e evitar castigos)`;
  } else if (rng < 0.90) {
    // 10% chance de Jackpot
    const { getGameMultiplier } = require("./boosts");
    const coins = 1000 * getGameMultiplier(userId);
    addCoins(userId, coins);
    rewardText = `o prêmio **JACKPOT** de **${coins} Nanacoins 🪙**!`;
  } else {
    // 10% chance de Nada
    rewardText = `**NADA**! 🎲 A roleta parou na casa do azar. Mais sorte amanhã!`;
  }

  const roletaMsg = await message.reply(`📅 **ROLETA DIÁRIA** 🎰\nGirando a roleta... \`[ 🎲 | 🎲 | 🎲 ]\``);

  const frames = [
    "`[ 🪙 | 💨 | 🐰 ]`",
    "`[ 💥 | 🎲 | 💎 ]`",
    "`[ 🐰 | 🪙 | 💨 ]`",
    "`[ 🎲 | 💎 | 💥 ]`"
  ];
  
  for (let i = 0; i < frames.length; i++) {
    await new Promise(r => setTimeout(r, config.static.app.daily.animationDelayMs));
    await roletaMsg.edit(`📅 **ROLETA DIÁRIA** 🎰\nGirando a roleta... ${frames[i]}`).catch(() => null);
  }

  await new Promise(r => setTimeout(r, config.static.app.daily.animationDelayMs));

  return roletaMsg.edit(`📅 **ROLETA DIÁRIA** 🎰\nA roleta parou!\n\n🎉 Você ganhou: ${rewardText}`).catch(() => null);
}

carregarInventario();

module.exports = {
  addItem,
  removeItem,
  hasItem,
  getUserInventory,
  addWeaponInstance,
  updateWeaponInstance,
  removeWeaponInstance,
  setEquippedWeapon,
  lockInventoryEntry,
  unlockInventoryEntry,
  transferLockedEntry,
  canClaimSmokeBomb,
  updateSmokeBombTimer,
  handleDailyCommand,
  __setDbForTests(nextDb) {
    db = JSON.parse(JSON.stringify(nextDb));
  },
  __getDbForTests() {
    return JSON.parse(JSON.stringify(db));
  },
  __disableSavingForTests(value = true) {
    disableSavingForTests = value;
  }
};
