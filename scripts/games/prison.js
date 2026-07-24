const fs = require("fs");
const path = require("path");
const config = require("../core/config");
const { getCoins, removeCoins } = require("../economy/economy");
const { resolveUserFromMessage } = require("../core/userResolver");
const { createDebouncedJsonWriter } = require("../core/storage");

const PRISON_PATH = path.join(config.paths.data, "prison.json");
const prisonMap = new Map();
let disableSavingForTests = false;

function carregarPrisao() {
  try {
    if (fs.existsSync(PRISON_PATH)) {
      const data = JSON.parse(fs.readFileSync(PRISON_PATH, "utf-8"));
      for (const [k, v] of Object.entries(data)) {
        prisonMap.set(k, v);
      }
    }
  } catch (err) {
    console.error("Erro ao carregar dados da prisão:", err);
  }
}

const schedulePrisonSave = createDebouncedJsonWriter(PRISON_PATH, () => Object.fromEntries(prisonMap), 1000);

function salvarTimers() {
  if (!disableSavingForTests) schedulePrisonSave();
}

carregarPrisao();

function isPrisioneiro(userId) {
  if (!prisonMap.has(userId)) return false;
  const expire = prisonMap.get(userId);
  if (Date.now() > expire) {
    prisonMap.delete(userId);
    salvarTimers();
    const { recordPrisonServed } = require("../features/autoRoles");
    recordPrisonServed(userId);
    return false;
  }
  return true;
}

function prenderUsuario(userId, minutes) {
  prisonMap.set(userId, Date.now() + minutes * 60_000);
  salvarTimers();
}

function getTempoPrisaoRestante(userId) {
  if (!prisonMap.has(userId)) return 0;
  const rest = prisonMap.get(userId) - Date.now();
  return Math.ceil(rest / 60_000);
}

async function handleTimeoutCommand(message) {
  const userId = message.author.id;
  if (!isPrisioneiro(userId)) {
    return message.reply("Você não está banido/na prisão no momento!");
  }
  const tempo = getTempoPrisaoRestante(userId);
  return message.reply(`🚓 Você ainda está banido por tentar roubar! Faltam **${tempo} minutos** para ser solto.\n💡 *Dica: Você pode usar \`!fianca\` para sair agora por 250 Nanacoins.*`);
}

async function handleFiancaCommand(message) {
  const userId = message.author.id;
  const args = message.content.split(/\s+/).slice(1);
  let targetUser = message.mentions.users.first();
  let prisioneiroId = targetUser ? targetUser.id : userId;

  if (!targetUser && args.length > 0) {
    targetUser = await resolveUserFromMessage(message, args[0]);
    if (targetUser) prisioneiroId = targetUser.id;
  }

  if (!isPrisioneiro(prisioneiroId)) {
    if (prisioneiroId === userId) {
      return message.reply("Você não está na prisão no momento!");
    } else {
      return message.reply(`O usuário ${targetUser.username} não está na prisão no momento!`);
    }
  }

  const myCoins = getCoins(userId);
  const bailCost = config.static.app.duel.bailCost;
  if (myCoins < bailCost) {
    return message.reply(`Você precisa de **${bailCost} Nanacoins 🪙** para pagar a fiança e tirar ${prisioneiroId === userId ? "você" : targetUser.username} da cadeia! (Seu saldo: ${myCoins})`);
  }

  removeCoins(userId, bailCost);
  prisonMap.delete(prisioneiroId);
  salvarTimers();

  if (prisioneiroId === userId) {
    return message.reply(`🕊️ Você pagou **${bailCost} Nanacoins 🪙** de fiança e está livre da prisão! Cuidado nas próximas patacoadas.`);
  } else {
    return message.reply(`🕊️ Você pagou **${bailCost} Nanacoins 🪙** de fiança e tirou **${targetUser.username}** da prisão! Que grande amigo.`);
  }
}

function __setPrisonMapForTests(data) {
  prisonMap.clear();
  for (const [k, v] of Object.entries(data)) {
    prisonMap.set(k, v);
  }
}

function __getPrisonMapForTests() {
  return Object.fromEntries(prisonMap);
}

function __disablePrisonSavingForTests(val = true) {
  disableSavingForTests = val;
}

module.exports = {
  isPrisioneiro,
  prenderUsuario,
  getTempoPrisaoRestante,
  handleTimeoutCommand,
  handleFiancaCommand,
  __setPrisonMapForTests,
  __getPrisonMapForTests,
  __disablePrisonSavingForTests
};
