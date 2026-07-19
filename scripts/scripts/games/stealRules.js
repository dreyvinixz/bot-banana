const config = require("../core/config");

function computeThornPenalty(balance, duelConfig = config.static.app.duel) {
  return Math.floor(Math.max(0, balance) * duelConfig.thornPenaltyPercent);
}

function resolveParrudoStealGate({
  targetIsParrudo,
  targetHasThorns,
  thiefHasAcid,
  acidBreaks,
  weaponPiercesParrudo
}) {
  if (!targetIsParrudo) {
    return { allowed: true, thornTriggered: false, acidConsumed: false, acidFailed: false };
  }

  if (targetHasThorns) {
    return { allowed: false, thornTriggered: true, acidConsumed: false, acidFailed: false };
  }

  if (weaponPiercesParrudo) {
    return { allowed: true, thornTriggered: false, acidConsumed: false, acidFailed: false, piercedByWeapon: true };
  }

  if (!thiefHasAcid) {
    return { allowed: false, thornTriggered: false, acidConsumed: false, acidFailed: false };
  }

  return {
    allowed: !!acidBreaks,
    thornTriggered: false,
    acidConsumed: true,
    acidFailed: !acidBreaks
  };
}

module.exports = {
  computeThornPenalty,
  resolveParrudoStealGate
};
