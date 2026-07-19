const config = require("../core/config");
const { percentBetween } = require("../core/random");

function resolveDuel(p1, p2, actions = config.static.app.duel.actions) {
  if (p1.choice === p2.choice) {
    return { winner: null, reason: "Empate" };
  }
  const p1Action = actions[p1.choice];
  if (p1Action && p1Action.beats === p2.choice) {
    return { winner: p1, loser: p2, reason: p1Action.reason };
  }
  const p2Action = actions[p2.choice];
  if (p2Action && p2Action.beats === p1.choice) {
    return { winner: p2, loser: p1, reason: p2Action.reason };
  }
  return { winner: null, reason: "Empate" };
}

function parsePositiveAmount(text) {
  const amount = parseInt(text, 10);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function computeStealChance({ boostChance = 0, isSuperAdmin = false } = {}, duelConfig = config.static.app.duel) {
  return duelConfig.baseStealChance + boostChance + (isSuperAdmin ? duelConfig.superAdminStealBonus : 0);
}

function rollStealPercent(hasCrowbar, rng = Math.random, duelConfig = config.static.app.duel) {
  return percentBetween(hasCrowbar ? duelConfig.crowbarStealPercent : duelConfig.normalStealPercent, rng);
}

function selectParrudoOption(requestedHours, duelConfig = config.static.app.duel) {
  return duelConfig.parrudoOptions.find((option) => requestedHours <= option.maxRequestedHours)
    || duelConfig.parrudoOptions[duelConfig.parrudoOptions.length - 1];
}

module.exports = {
  resolveDuel,
  parsePositiveAmount,
  computeStealChance,
  rollStealPercent,
  selectParrudoOption
};
