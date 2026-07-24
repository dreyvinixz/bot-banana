const fs = require("fs");
const path = require("path");
const config = require("../core/config");
const { EmbedBuilder } = require("discord.js");
const { getCoins, addCoins, removeCoins, formatCoins } = require("../economy/economy");
const { resolveUserFromMessage } = require("../core/userResolver");
const { isSuperAdmin } = require("../admin/admin");
const { isPrisioneiro, prenderUsuario } = require("./prison");
const { createDebouncedJsonWriter } = require("../core/storage");

const PARRUDO_PATH = path.join(config.paths.data, "parrudo.json");
const parrudoMap = new Map();
const robFailures = new Map();
let disableSavingForTests = false;

function carregarParrudo() {
  try {
    if (fs.existsSync(PARRUDO_PATH)) {
      const data = JSON.parse(fs.readFileSync(PARRUDO_PATH, "utf-8"));
      for (const [k, v] of Object.entries(data)) {
        parrudoMap.set(k, v);
      }
    }
  } catch (err) {
    console.error("Erro ao carregar dados do Parrudo:", err);
  }
}

const scheduleParrudoSave = createDebouncedJsonWriter(PARRUDO_PATH, () => Object.fromEntries(parrudoMap), 1000);

function salvarTimers() {
  if (!disableSavingForTests) scheduleParrudoSave();
}

carregarParrudo();

function activateParrudo(userId, hours) {
  const currentExpire = parrudoMap.get(userId) || Date.now();
  const baseTime = Math.max(Date.now(), currentExpire);
  parrudoMap.set(userId, baseTime + hours * 3600 * 1000);
  salvarTimers();
}

function isParrudo(userId) {
  if (!parrudoMap.has(userId)) return false;
  const expire = parrudoMap.get(userId);
  if (Date.now() > expire) {
    parrudoMap.delete(userId);
    salvarTimers();
    return false;
  }
  return true;
}

function getTempoParrudoRestante(userId) {
  if (!parrudoMap.has(userId)) return 0;
  const rest = parrudoMap.get(userId) - Date.now();
  return Math.ceil(rest / 60_000);
}

function evaluateParrudoGate({ targetUserId, hasAcidItem }) {
  if (!isParrudo(targetUserId)) {
    return { allowed: true, acidConsumed: false, parrudoBlocked: false };
  }
  if (hasAcidItem) {
    const success = Math.random() < 0.45;
    if (success) {
      parrudoMap.delete(targetUserId);
      salvarTimers();
      return { allowed: true, acidConsumed: true, parrudoBlocked: false };
    }
    return { allowed: false, acidConsumed: true, parrudoBlocked: true };
  }
  return { allowed: false, acidConsumed: false, parrudoBlocked: true };
}

function getStealChanceExtra(userId) {
  const { activeEffectsMap } = require("../economy/activeEffects");
  if (!activeEffectsMap.has(userId)) return 0;
  const effects = activeEffectsMap.get(userId);
  const now = Date.now();

  for (const [k, eff] of Object.entries(effects)) {
    if (eff.category === 'robbery' && eff.type === 'steal_chance' && eff.expire > now) {
      return eff.val || 0;
    }
  }
  return 0;
}

function computeStealChance({ boostChance = 0, isSuperAdmin = false } = {}) {
  const base = config.static.app.duel.stealBaseChance;
  const adminBonus = isSuperAdmin ? config.static.app.duel.stealAdminBonus : 0;
  return base + boostChance + adminBonus;
}

function rollStealPercent(hasPeCabra = false) {
  if (hasPeCabra) {
    const min = config.static.app.duel.stealPercentWithPeCabraMin;
    const max = config.static.app.duel.stealPercentWithPeCabraMax;
    return min + Math.random() * (max - min);
  }
  const min = config.static.app.duel.stealPercentNormalMin;
  const max = config.static.app.duel.stealPercentNormalMax;
  return min + Math.random() * (max - min);
}

function computeThornPenalty(myCoins) {
  return Math.floor(myCoins * config.static.app.duel.thornPenaltyRatio);
}

function computePrisonMinutes(attempts) {
  if (attempts >= 3) return config.static.app.duel.prisonMinutesLevel3;
  if (attempts === 2) return config.static.app.duel.prisonMinutesLevel2;
  return config.static.app.duel.prisonMinutesLevel1;
}

async function handleRoubarCommand(message) {
  const userId = message.author.id;
  const args = message.content.split(/\s+/).slice(1);

  if (isPrisioneiro(userId)) {
    const tempo = require("./prison").getTempoPrisaoRestante(userId);
    return message.reply(`🚓 Você está preso! Faltam **${tempo} minutos** para cumprir sua pena. Use \`!fianca\` para sair.`);
  }

  let targetUser = message.mentions.users.first();

  if (!targetUser && args.length > 0) {
    targetUser = await resolveUserFromMessage(message, args[0]);
  }

  if (!targetUser) {
    return message.reply("Você precisa mencionar ou informar o ID/Username de quem deseja roubar! Ex: `!roubar @usuario`");
  }

  if (targetUser.id === userId) {
    return message.reply("Você não pode roubar a si mesmo! Tente roubar outra pessoa.");
  }

  if (targetUser.bot) {
    return message.reply("Você não pode roubar bots!");
  }

  const { hasItem, removeItem } = require("../economy/inventory");
  const hasAcid = hasItem(userId, 'acido_corrosivo');
  const gate = evaluateParrudoGate({ targetUserId: targetUser.id, hasAcidItem: hasAcid });

  if (gate.acidConsumed) {
    removeItem(userId, 'acido_corrosivo', 1);
  }

  if (!gate.allowed) {
    if (gate.acidConsumed) {
      return message.reply(`🧪💨 Você jogou Ácido Corrosivo em **${targetUser.username}**, mas o escudo Parrudo resistiu! O roubo falhou.`);
    }
    return message.reply(`🛡️ O usuário **${targetUser.username}** está **PARRUDO** e imune a roubos!`);
  }

  const myCoins = getCoins(userId);
  const targetCoins = getCoins(targetUser.id);

  if (targetCoins < config.static.app.duel.minTargetCoinsToSteal) {
    return message.reply(`O usuário ${targetUser.username} tem menos de ${config.static.app.duel.minTargetCoinsToSteal} Nanacoins. Tenha piedade!`);
  }

  const boostChance = getStealChanceExtra(userId);
  const successChance = computeStealChance({ boostChance, isSuperAdmin: isSuperAdmin(userId) });
  const success = Math.random() < successChance;

  const { hasPeCabra, hasEscudoEspinhos } = require("../economy/boosts");

  if (success) {
    const percent = rollStealPercent(hasPeCabra(userId));
    const stolen = Math.floor(targetCoins * percent);

    removeCoins(targetUser.id, stolen);
    addCoins(userId, stolen);

    robFailures.delete(userId);
    salvarTimers();

    const { recordSuccessfulSteal } = require("../features/autoRoles");
    recordSuccessfulSteal(userId, message.member);

    const embed = new EmbedBuilder()
      .setColor('#00AA00')
      .setTitle('🥷 ASSALTO BEM-SUCEDIDO!')
      .setDescription(`Você furtou a carteira de **${targetUser.username}**.`)
      .addFields({ name: '💰 Valor Roubado', value: `\`+ ${formatCoins(stolen)} Nanacoins\`` });

    return message.reply({ embeds: [embed] });
  } else {
    const embeds = [];

    if (hasEscudoEspinhos(targetUser.id)) {
      const multa = computeThornPenalty(myCoins);
      removeCoins(userId, multa);
      addCoins(targetUser.id, multa);

      const escudoEmbed = new EmbedBuilder()
        .setColor('#8B008B')
        .setTitle('🛡️ ESCUDO DE ESPINHOS!')
        .setDescription(`Você se espetou no escudo de **${targetUser.username}**!`)
        .addFields({ name: '🩸 Multa Paga', value: `\`- ${formatCoins(multa)} Nanacoins\`` });
      embeds.push(escudoEmbed);
    }

    const currentFails = (robFailures.get(userId) || 0) + 1;
    robFailures.set(userId, currentFails);
    salvarTimers();

    const prisonMin = computePrisonMinutes(currentFails);
    prenderUsuario(userId, prisonMin);

    const failEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚓 VOCÊ FOI PRESO!')
      .setDescription(`Você foi pego em flagrante tentando roubar **${targetUser.username}**! Pena de **${prisonMin} minutos** de prisão.`)
      .setFooter({ text: 'Dica: Use !fianca para sair antes.' });

    embeds.push(failEmbed);
    return message.reply({ embeds });
  }
}

function __setParrudoMapForTests(data) {
  parrudoMap.clear();
  for (const [k, v] of Object.entries(data)) {
    parrudoMap.set(k, v);
  }
}

function __setRobFailuresForTests(data) {
  robFailures.clear();
  for (const [k, v] of Object.entries(data)) {
    robFailures.set(k, v);
  }
}

function __disableRobberySavingForTests(val = true) {
  disableSavingForTests = val;
}

module.exports = {
  activateParrudo,
  isParrudo,
  getTempoParrudoRestante,
  evaluateParrudoGate,
  getStealChanceExtra,
  computeStealChance,
  rollStealPercent,
  computeThornPenalty,
  computePrisonMinutes,
  handleRoubarCommand,
  __setParrudoMapForTests,
  __setRobFailuresForTests,
  __disableRobberySavingForTests
};
