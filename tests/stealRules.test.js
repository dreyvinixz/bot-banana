const test = require("node:test");
const assert = require("node:assert/strict");
const { computeThornPenalty, resolveParrudoStealGate } = require("../scripts/games/stealRules");

test("thorn shield blocks parrudo robbery immediately", () => {
  const gate = resolveParrudoStealGate({
    targetIsParrudo: true,
    targetHasThorns: true,
    thiefHasAcid: true,
    acidBreaks: true
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.thornTriggered, true);
  assert.equal(gate.acidConsumed, false);
  assert.equal(computeThornPenalty(1000), 100);
});

test("acid failure blocks normal robbery without thorn shield", () => {
  const gate = resolveParrudoStealGate({
    targetIsParrudo: true,
    targetHasThorns: false,
    thiefHasAcid: true,
    acidBreaks: false
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.acidConsumed, true);
  assert.equal(gate.acidFailed, true);
});

test("getStealChanceExtra in robbery module resolves safely without error", () => {
  const { getStealChanceExtra } = require("../scripts/games/robbery");
  const chance = getStealChanceExtra("user123");
  assert.equal(typeof chance, "number");
});

