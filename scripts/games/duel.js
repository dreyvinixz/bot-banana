const fs = require("fs");
const path = require("path");
const config = require("../core/config");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder } = require("discord.js");
const { getCoins, addCoins, removeCoins, formatCoins } = require("../economy/economy");
const { resolveUserFromMessage, resolveUserFromInteraction } = require("../core/userResolver");
const { resolveDuel, parsePositiveAmount } = require("./duelRules");
const { choice, integerBetween } = require("../core/random");
const { getEquippedWeapon, consumeWeaponDurability, computeDuelWeaponModifier, formatWeaponLabel } = require("../economy/weapons");

const {
  isPrisioneiro,
  prenderUsuario,
  getTempoPrisaoRestante,
  handleTimeoutCommand,
  handleFiancaCommand
} = require("./prison");

const {
  activateParrudo,
  isParrudo,
  getTempoParrudoRestante,
  handleRoubarCommand
} = require("./robbery");

const { hasItem, removeItem } = require("../economy/inventory");

const beijoCooldowns = new Map();
const activeDuels = new Map();

function handleBeijarMuroCommand(message) {
  const userId = message.author.id;
  if (isPrisioneiro(userId)) {
    return message.reply(`🚓 Você está na prisão e a parede da cela é fria demais para beijar.`);
  }

  if (beijoCooldowns.has(userId)) {
    const expire = beijoCooldowns.get(userId);
    if (Date.now() < expire) {
      const mins = Math.ceil((expire - Date.now()) / 60000);
      return message.reply(`👄 Seus lábios estão doendo! Espere **${mins} minutos** para usar o comando de novo.`);
    }
  }

  const isTestChannel = message.channel && message.channel.id === '1348716118981742592';
  const kissCooldown = isTestChannel ? 10 * 1000 : (config.static?.app?.duel?.kissCooldownMs || 600000);
  beijoCooldowns.set(userId, Date.now() + kissCooldown);

  const { hasItem, removeItem } = require("../economy/inventory");
  const hasCoelho = hasItem(userId, 'pe_coelho') || hasItem(userId, 'pe_de_coelho');
  const embeds = [];

  if (hasCoelho) {
    const itemKey = hasItem(userId, 'pe_coelho') ? 'pe_coelho' : 'pe_de_coelho';
    removeItem(userId, itemKey, 1);
    const coelhoEmbed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('🐰 PÉ DE COELHO!')
      .setDescription(`A sorte está ao lado de **${message.author.username}** neste beijo! (Imune a cadeia/azar)`);
    embeds.push(coelhoEmbed);
  }

  const rng = hasCoelho ? Math.random() * 0.49 : Math.random();
  const gifBom = "https://media.giphy.com/media/Pk3ljzIDb4R0j3zpMU/giphy.gif";
  const gifRuim = "https://media.giphy.com/media/RbAJaIKpGMQLlciHnn/giphy.gif";

  const resultEmbed = new EmbedBuilder();

  if (rng < 0.25) {
    const { getGameMultiplier } = require("../economy/boosts");
    const mult = getGameMultiplier ? getGameMultiplier(userId) : 1;
    const baseReward = config.static?.app?.duel?.kissRewards?.big || 600;
    const premio = baseReward * mult;
    addCoins(userId, premio);
    resultEmbed.setColor('#FFD700') // Dourado
      .setTitle('💋 BEIJO DA SORTE GRANDE!')
      .setDescription('Você beijou o muro com paixão e encontrou um tesouro escondido!')
      .addFields({ name: '💰 Prêmio', value: `\`+ ${premio} Nanacoins\`` })
      .setImage(gifBom);
  } else if (rng < 0.50) {
    const { getGameMultiplier } = require("../economy/boosts");
    const mult = getGameMultiplier ? getGameMultiplier(userId) : 1;
    const baseReward = config.static?.app?.duel?.kissRewards?.small || 250;
    const premio = baseReward * mult;
    addCoins(userId, premio);
    resultEmbed.setColor('#FFFF00') // Amarelo
      .setTitle('💋 BEIJO DA SORTE!')
      .setDescription('Você deu um beijinho no muro e achou uma carteira caída no chão!')
      .addFields({ name: '💰 Prêmio', value: `\`+ ${premio} Nanacoins\`` })
      .setImage(gifBom);
  } else if (rng < 0.75) {
    const smallPenalty = config.static?.app?.duel?.kissRewards?.smallPenalty || 100;
    const penalty = Math.min(getCoins(userId), smallPenalty);
    if (penalty > 0) removeCoins(userId, penalty);
    resultEmbed.setColor('#FFA500') // Laranja
      .setTitle('🧱💥 BATEU A CARA!')
      .setDescription('O muro revidou! Você quebrou um dente e deixou cair moedas do bolso.')
      .addFields({ name: '🩸 Perda', value: `\`- ${penalty} Nanacoins\`` })
      .setImage(gifRuim);
  } else if (rng < 0.90) {
    const bigPenalty = config.static?.app?.duel?.kissRewards?.bigPenalty || 200;
    const penalty = Math.min(getCoins(userId), bigPenalty);
    if (penalty > 0) removeCoins(userId, penalty);
    resultEmbed.setColor('#8B0000') // Vermelho Escuro
      .setTitle('🤢 QUE NOJO!')
      .setDescription('Você beijou a boca de uma barata que estava no muro. A consulta no posto custou caro!')
      .addFields({ name: '💸 Despesas Médicas', value: `\`- ${penalty} Nanacoins\`` })
      .setImage(gifRuim);
  } else {
    const jailMins = config.static?.app?.duel?.kissJailMinutes || 5;
    prenderUsuario(userId, jailMins);
    resultEmbed.setColor('#FF0000') // Vermelho
      .setTitle('🚓🚨 PEGO NO ATO!')
      .setDescription('A polícia passou na hora, achou que você estava vandalizando o muro e te levou preso!')
      .addFields({ name: '⚖️ Sentença', value: `${jailMins} minutos de cadeia.` })
      .setImage(gifRuim);
  }

  embeds.push(resultEmbed);
  return message.reply({ embeds });
}

function handleParrudoCommand(message) {
  const args = message.content.split(/\s+/).slice(1);
  if (!args[0]) {
    return message.reply("💡 Use: `!parrudo <1h|2h|5h|10h>` para comprar imunidade a roubos!");
  }

  const input = args[0].toLowerCase();
  const hours = parseInt(input.replace("h", ""), 10);

  if (isNaN(hours) || ![1, 2, 5, 10].includes(hours)) {
    return message.reply("❌ Escolha um tempo válido: `1h`, `2h`, `5h` ou `10h`!");
  }

  const priceMap = { 1: 150, 2: 280, 5: 650, 10: 1200 };
  const cost = priceMap[hours];
  const myCoins = getCoins(message.author.id);

  if (myCoins < cost) {
    return message.reply(`❌ Você precisa de **${cost} Nanacoins 🪙** para comprar ${hours}h de Proteção Parrudo! (Saldo: ${myCoins})`);
  }

  removeCoins(message.author.id, cost);
  activateParrudo(message.author.id, hours);

  return message.reply(`🛡️ **PROTEÇÃO PARRUDO ATIVADA!** Você está imune a roubos pelas próximas **${hours} hora(s)**!`);
}

async function handleButtonInteraction(interaction) {
  if (!interaction.customId.startsWith("duel_")) return false;
  // Handler para botões de duelo interativos
  return true;
}

async function handleDueloModalSubmit(interaction) {
  if (!interaction.customId.startsWith("modal_duelo_")) return false;
  return true;
}

module.exports = {
  isPrisioneiro,
  isParrudo,
  activateParrudo,
  prenderUsuario,
  getTempoPrisaoRestante,
  getTempoParrudoRestante,
  handleRoubarCommand,
  handleTimeoutCommand,
  handleFiancaCommand,
  handleParrudoCommand,
  handleButtonInteraction,
  handleBeijarMuroCommand,
  handleDueloModalSubmit
};
