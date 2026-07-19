const config = require("../core/config");
const { integerBetween } = require("../core/random");

function getBossTypeConfig(type = "world", bossConfig = config.static.app.boss) {
  return bossConfig[type] || bossConfig.world;
}

function getBossPhase(hp, maxHp, phases = config.static.app.boss.phases) {
  const percent = maxHp > 0 ? hp / maxHp : 0;
  return phases.find((phase) => percent >= phase.minHpPercent) || phases[phases.length - 1];
}

function getBossAction(actionId, bossConfig = config.static.app.boss) {
  return bossConfig.actions[actionId] || bossConfig.actions.basic;
}

function computeBossAttackDamage({ actionId = "basic", hp, maxHp, charge = 1, weaponDamage = 0, rng = Math.random } = {}, bossConfig = config.static.app.boss) {
  const action = getBossAction(actionId, bossConfig);
  const phase = getBossPhase(hp, maxHp, bossConfig.phases);
  let damage = integerBetween(action.damageMin, action.damageMax, rng);
  damage += weaponDamage;
  if (charge > 1 && actionId !== "charge") damage = Math.floor(damage * charge);
  if (actionId === "charge") damage = Math.floor(damage * (action.chargeBonus || 1));
  return { damage: Math.max(1, damage), action, phase };
}

function applyDamage(hp, damage) {
  return Math.max(0, hp - Math.max(0, damage));
}

function computeBossPrizes(damageEntries, prize, maxHp, topBonus = [], minimumDamage = 1) {
  const eligible = Array.from(damageEntries.entries())
    .filter(([, damage]) => damage >= minimumDamage)
    .sort((a, b) => b[1] - a[1]);

  const basePrizePool = Math.max(0, prize);
  return eligible.map(([userId, damage], index) => {
    const proportional = Math.floor(basePrizePool * (damage / Math.max(1, maxHp)));
    const bonus = Math.floor(basePrizePool * (topBonus[index] || 0));
    return { userId, damage, prize: proportional + bonus, rank: index + 1 };
  });
}

module.exports = {
  getBossTypeConfig,
  getBossPhase,
  getBossAction,
  computeBossAttackDamage,
  applyDamage,
  computeBossPrizes
};
