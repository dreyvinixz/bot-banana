const fs = require("fs");
const path = require("path");
const config = require("../core/config");
const { createDebouncedJsonWriter, writeJsonFileSync } = require("../core/storage");
const { recordLedgerEvent } = require("./ledger");
const { removeItem, hasItem } = require("./inventory");

let db = {};
const EFFECTS_PATH = path.join(process.cwd(), "data", "economy", "activeEffects.json");
let disableSavingForTests = false;

function loadEffects() {
  try {
    if (fs.existsSync(EFFECTS_PATH)) {
      const loaded = JSON.parse(fs.readFileSync(EFFECTS_PATH, "utf-8"));
      db = loaded && typeof loaded === "object" ? loaded : {};
    } else {
      db = {};
      writeJsonFileSync(EFFECTS_PATH, db);
    }
  } catch (err) {
    console.error("Erro ao carregar activeEffects:", err);
    db = {};
  }
}

const saveEffects = createDebouncedJsonWriter(EFFECTS_PATH, () => db, config.static.app.timers?.saveDebounceMs || 2000);

function saveEffectsSync() {
  if (disableSavingForTests) return;
  writeJsonFileSync(EFFECTS_PATH, db);
}

loadEffects();

function ensureUser(userId) {
  if (!db[userId]) {
    db[userId] = {
      boss: null,
      duel: null
    };
  }
  if (Array.isArray(db[userId].buffs)) {
    const legacy = db[userId].buffs[0] || null;
    db[userId].boss = legacy?.bossDamageBonus ? legacy : db[userId].boss || null;
    db[userId].duel = legacy?.duelPowerBonus ? legacy : db[userId].duel || null;
    delete db[userId].buffs;
  }
  if (!("boss" in db[userId])) db[userId].boss = null;
  if (!("duel" in db[userId])) db[userId].duel = null;
}

function getBuffCategories(buffConfig) {
  const categories = [];
  if (buffConfig.bossDamageBonus) categories.push("boss");
  if (buffConfig.duelPowerBonus) categories.push("duel");
  return categories;
}

function getActiveBuff(userId, category = null) {
  ensureUser(userId);
  if (category) return db[userId][category] || null;
  return {
    bossDamageBonus: db[userId].boss?.bossDamageBonus || 0,
    duelPowerBonus: db[userId].duel?.duelPowerBonus || 0,
    boss: db[userId].boss,
    duel: db[userId].duel
  };
}

function useCombatBuff(userId, materialId) {
  ensureUser(userId);
  
  const buffConfig = config.static.shop?.combatBuff?.[materialId];
  if (!buffConfig) return { ok: false, reason: "Este material não possui efeito de combate configurado." };

  const categories = getBuffCategories(buffConfig);
  if (categories.length === 0) return { ok: false, reason: "Este material não possui bônus de combate válido." };

  const occupied = categories.find((category) => db[userId][category]);
  if (occupied) {
    return { ok: false, reason: `Você já possui um buff ativo de ${occupied === "boss" ? "Boss" : "Duelo"}.` };
  }

  if (!hasItem(userId, materialId, 1)) {
    return { ok: false, reason: "Você não possui este material no inventário." };
  }

  // Remove material
  if (!removeItem(userId, materialId, 1)) {
    return { ok: false, reason: "Erro ao consumir material." };
  }

  const buff = {
    materialId,
    duelPowerBonus: buffConfig.duelPowerBonus || 0,
    bossDamageBonus: buffConfig.bossDamageBonus || 0,
    durationFights: buffConfig.durationFights || 1
  };

  for (const category of categories) {
    db[userId][category] = { ...buff, category };
  }

  saveEffectsSync();

  recordLedgerEvent("combat_buff_used", {
    userId,
    materialId,
    categories,
    duelPowerBonus: buffConfig.duelPowerBonus || 0,
    bossDamageBonus: buffConfig.bossDamageBonus || 0,
    durationFights: buffConfig.durationFights || 1
  });

  return { ok: true, buff };
}

function decrementBuff(userId, category = null) {
  ensureUser(userId);
  const categories = category ? [category] : ["boss", "duel"];
  let changed = false;
  for (const buffCategory of categories) {
    if (db[userId][buffCategory]) {
      db[userId][buffCategory].durationFights -= 1;
      if (db[userId][buffCategory].durationFights <= 0) {
        db[userId][buffCategory] = null;
      }
      changed = true;
    }
  }
  if (changed) saveEffectsSync();
}

module.exports = {
  getActiveBuff,
  useCombatBuff,
  decrementBuff,
  __setDbForTests(nextDb) {
    db = nextDb && typeof nextDb === "object" ? JSON.parse(JSON.stringify(nextDb)) : {};
  },
  __getDbForTests() {
    return JSON.parse(JSON.stringify(db));
  },
  __disableSavingForTests(value = true) {
    disableSavingForTests = value;
  }
};
