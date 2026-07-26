const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

/**
 * Testes de Contrato entre Módulos
 *
 * Estes testes verificam que os exports de cada módulo existem e são do tipo
 * esperado. Eles detectam imports quebrados (como o bug activeEffectsMap)
 * que os testes de lógica não pegam porque nunca chamam o caminho real.
 */

// Desabilitar salvamento em disco durante testes
const economy = require("../scripts/economy/economy");
const inventory = require("../scripts/economy/inventory");
const prison = require("../scripts/games/prison");
const robbery = require("../scripts/games/robbery");
const autoRoles = require("../scripts/features/autoRoles");

economy.__disableSavingForTests(true);
inventory.__disableSavingForTests(true);
prison.__disablePrisonSavingForTests(true);
robbery.__disableRobberySavingForTests(true);
autoRoles.__disableStatsSavingForTests(true);

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de contratos: módulo → exports esperados com tipo
// ─────────────────────────────────────────────────────────────────────────────
const MODULE_CONTRACTS = {
  "../scripts/economy/economy": {
    functions: ["getCoins", "addCoins", "removeCoins", "formatCoins", "getTopPlayers", "handleDoarCommand"]
  },
  "../scripts/economy/boosts": {
    functions: ["handleBoostCommand", "handleBoostInteraction", "getGameMultiplier", "getStealChanceExtra", "hasPeCabra", "hasEscudoEspinhos", "giveBoost"]
  },
  "../scripts/economy/inventory": {
    functions: ["hasItem", "removeItem", "addItem"]
  },
  "../scripts/economy/weapons": {
    functions: ["handleInventoryCommand", "handleEquipWeaponCommand", "getEquippedWeapon", "consumeWeaponDurability", "computeDuelWeaponModifier", "formatWeaponLabel"]
  },
  "../scripts/economy/market": {
    functions: ["handleMarketCommand", "handleMarketInteraction", "getActiveOrders"]
  },
  "../scripts/economy/raids": {
    functions: ["handleRaidCommand", "handleRaidInteraction", "scheduleExistingRaids"]
  },
  "../scripts/economy/forge": {
    functions: ["handleCraftWeaponsCommand", "handleForgeInteraction"]
  },
  "../scripts/economy/activeEffects": {
    functions: ["getActiveBuff", "useCombatBuff", "decrementBuff"]
  },
  "../scripts/economy/fliperama": {
    functions: ["handleFliperamaCommand", "handleFliperamaInteraction"]
  },
  "../scripts/economy/shopStock": {
    functions: ["getDynamicPrice", "removeStock", "getItemStockInfo"]
  },
  "../scripts/games/robbery": {
    functions: ["activateParrudo", "isParrudo", "getTempoParrudoRestante", "evaluateParrudoGate", "getStealChanceExtra", "computeStealChance", "rollStealPercent", "computeThornPenalty", "computePrisonMinutes", "handleRoubarCommand"]
  },
  "../scripts/games/duel": {
    functions: ["handleRoubarCommand", "handleButtonInteraction", "handleTimeoutCommand", "handleFiancaCommand", "handleParrudoCommand", "isPrisioneiro", "handleBeijarMuroCommand"]
  },
  "../scripts/games/prison": {
    functions: ["isPrisioneiro", "prenderUsuario", "getTempoPrisaoRestante", "handleFiancaCommand"]
  },
  "../scripts/games/duelRules": {
    functions: ["resolveDuel", "parsePositiveAmount"]
  },
  "../scripts/games/stealRules": {
    functions: ["computeThornPenalty", "resolveParrudoStealGate"]
  },
  "../scripts/games/boss": {
    functions: ["handleBossInteraction"]
  },
  "../scripts/games/forca": {
    functions: ["handleForcaThemeInteraction", "checkForcaGuess", "checkAndSpawnEvent", "handleEventInteraction"]
  },
  "../scripts/games/menu": {
    functions: ["handleGamesCommand", "handleGamesInteraction"]
  },
  "../scripts/games/rpg": {
    functions: ["handleRpgInteraction"]
  },
  "../scripts/features/autoRoles": {
    functions: ["recordActivityMessage", "addVoiceTime", "recordSuccessfulSteal"]
  },
  "../scripts/features/xp": {
    functions: ["addXpFromMessage", "grantXpToUser", "handleXpCommand", "handleRankXpCommand"]
  },
  "../scripts/features/welcome": {
    functions: ["handleMemberJoin", "handleWelcomeTestCommand"]
  },
  "../scripts/features/menuHub": {
    functions: ["handleMenuCommand", "handleMenuInteraction"]
  },
  "../scripts/features/reels": {
    functions: ["handleReelsCommand", "handleReelsInteraction"]
  },
  "../scripts/features/familia": {
    functions: ["checkMemberStatusHasInvite"]
  },
  "../scripts/admin/admin": {
    functions: ["handleAdminCommand", "isSuperAdmin"]
  },
  "../scripts/core/logger": {
    functions: ["logInfo", "logWarn", "logError", "interceptConsole", "setupGlobalErrorLogging"]
  },
  "../scripts/core/utils": {
    functions: ["isCommand", "getCommandText"]
  },
  "../scripts/core/storage": {
    functions: ["createDebouncedJsonWriter"]
  },
  "../scripts/core/userResolver": {
    functions: ["resolveUserFromMessage"]
  },
  "../scripts/core/videoScheduler": {
    functions: ["startVideoScheduler"]
  },
  "../scripts/core/random": {
    functions: ["choice", "integerBetween"]
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Teste 1: Todos os exports declarados existem e são funções
// ─────────────────────────────────────────────────────────────────────────────
test("CONTRATO: Todos os módulos exportam as funções esperadas", () => {
  const failures = [];

  for (const [modulePath, contract] of Object.entries(MODULE_CONTRACTS)) {
    let mod;
    try {
      mod = require(modulePath);
    } catch (err) {
      failures.push(`❌ Falha ao carregar ${modulePath}: ${err.message}`);
      continue;
    }

    for (const fnName of contract.functions) {
      if (typeof mod[fnName] !== "function") {
        const actual = mod[fnName] === undefined ? "undefined" : typeof mod[fnName];
        failures.push(`❌ ${modulePath} → ${fnName} deveria ser function, mas é ${actual}`);
      }
    }
  }

  if (failures.length > 0) {
    assert.fail(
      `\n🔴 ${failures.length} contrato(s) de módulo violado(s):\n\n${failures.join("\n")}\n`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Teste 2: Integrações críticas — funções que eram lazy require e quebravam
// em runtime sem serem detectadas. Cada uma é chamada com dados neutros para
// verificar que não lança TypeError na invocação.
// ─────────────────────────────────────────────────────────────────────────────
test("CONTRATO: Integrações críticas são invocáveis sem TypeError", () => {
  const robberyMod = require("../scripts/games/robbery");

  // O bug original: getStealChanceExtra importava activeEffectsMap que não existia
  const chance = robberyMod.getStealChanceExtra("fake_user_123");
  assert.equal(typeof chance, "number", "getStealChanceExtra deve retornar number");

  // computeStealChance com boostChance vindo de getStealChanceExtra
  const totalChance = robberyMod.computeStealChance({ boostChance: chance, isSuperAdmin: false });
  assert.equal(typeof totalChance, "number", "computeStealChance deve retornar number");

  // rollStealPercent
  const percent = robberyMod.rollStealPercent(false);
  assert.equal(typeof percent, "number", "rollStealPercent deve retornar number");
  assert.ok(percent >= 0, "rollStealPercent deve ser >= 0");

  // evaluateParrudoGate
  const gate = robberyMod.evaluateParrudoGate({ targetUserId: "nobody", hasAcidItem: false });
  assert.equal(typeof gate.allowed, "boolean", "evaluateParrudoGate.allowed deve ser boolean");

  // computeThornPenalty
  const penalty = robberyMod.computeThornPenalty(1000);
  assert.equal(typeof penalty, "number", "computeThornPenalty deve retornar number");

  // computePrisonMinutes
  const minutes = robberyMod.computePrisonMinutes(1);
  assert.equal(typeof minutes, "number", "computePrisonMinutes deve retornar number");
});

// ─────────────────────────────────────────────────────────────────────────────
// Teste 3: Lazy requires dentro de funções — os módulos referenciados existem
// e exportam o que se espera
// ─────────────────────────────────────────────────────────────────────────────
const LAZY_REQUIRE_CONTRACTS = [
  // robbery.js lazy requires
  { from: "robbery.js", module: "../scripts/economy/boosts", expects: ["getStealChanceExtra", "hasPeCabra", "hasEscudoEspinhos"] },
  { from: "robbery.js", module: "../scripts/economy/inventory", expects: ["hasItem", "removeItem"] },
  { from: "robbery.js", module: "../scripts/features/autoRoles", expects: ["recordSuccessfulSteal"] },
  // duel.js lazy requires
  { from: "duel.js", module: "../scripts/economy/boosts", expects: ["getGameMultiplier"] },
  { from: "duel.js", module: "../scripts/economy/inventory", expects: ["hasItem", "removeItem"] },
  // bot.js lazy requires
  { from: "bot.js", module: "../scripts/games/menu", expects: ["handleGamesCommand", "handleGamesInteraction"] },
  { from: "bot.js", module: "../scripts/economy/forge", expects: ["handleCraftWeaponsCommand", "handleForgeInteraction"] },
  { from: "bot.js", module: "../scripts/economy/fliperama", expects: ["handleFliperamaCommand", "handleFliperamaInteraction"] },
  { from: "bot.js", module: "../scripts/games/boss", expects: ["handleBossInteraction"] },
  { from: "bot.js", module: "../scripts/admin/admin", expects: ["sendStartupAnnouncement", "handleSetupRegrasCommand", "handleSetupCargosInfoCommand", "handleSetupAvisosCommand", "handleSetupCaixaInfoCommand", "handleSetupPubliCommand", "handleSetupCompeticoesCommand", "handleSetupReviewsCommand"] },
  { from: "bot.js", module: "../scripts/features/familia", expects: ["handleFamiliaButtonInteraction"] },
  { from: "bot.js", module: "../scripts/admin/setupPanels", expects: ["handlePubliButtonInteraction"] },
  { from: "bot.js", module: "../scripts/economy/weapons", expects: ["handleInventoryInteraction"] },
];

test("CONTRATO: Lazy requires dentro de funções apontam para exports válidos", () => {
  const failures = [];

  for (const contract of LAZY_REQUIRE_CONTRACTS) {
    let mod;
    try {
      mod = require(contract.module);
    } catch (err) {
      failures.push(`❌ [${contract.from}] Falha ao carregar ${contract.module}: ${err.message}`);
      continue;
    }

    for (const fnName of contract.expects) {
      if (typeof mod[fnName] !== "function") {
        const actual = mod[fnName] === undefined ? "undefined" : typeof mod[fnName];
        failures.push(`❌ [${contract.from}] ${contract.module}.${fnName} deveria ser function, mas é ${actual}`);
      }
    }
  }

  if (failures.length > 0) {
    assert.fail(
      `\n🔴 ${failures.length} lazy require(s) quebrado(s):\n\n${failures.join("\n")}\n`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Teste 4: Logger interceptConsole funciona e grava no arquivo
// ─────────────────────────────────────────────────────────────────────────────
test("CONTRATO: interceptConsole captura console.error para arquivo de log", () => {
  const logger = require("../scripts/core/logger");
  const testLogPath = path.join(logger.LOGS_DIR, "error.log");

  // Limpa o error.log antes do teste
  if (fs.existsSync(testLogPath)) {
    const sizeBefore = fs.statSync(testLogPath).size;

    // Provoca um console.error — deve ser capturado
    logger.interceptConsole();
    console.error("__CONTRACT_TEST_MARKER__", new Error("teste de contrato"));

    const sizeAfter = fs.statSync(testLogPath).size;
    assert.ok(sizeAfter > sizeBefore, "error.log deve crescer após console.error interceptado");

    const content = fs.readFileSync(testLogPath, "utf-8");
    assert.ok(content.includes("__CONTRACT_TEST_MARKER__"), "error.log deve conter o marcador do teste");
    assert.ok(content.includes("teste de contrato"), "error.log deve conter a mensagem de erro");
  }

  logger.__restoreConsoleForTests();
});
