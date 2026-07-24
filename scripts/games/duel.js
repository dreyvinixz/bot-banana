const fs = require("fs");
const path = require("path");
const config = require("../core/config");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder } = require("discord.js");
const { getCoins, addCoins, removeCoins, formatCoins } = require("../economy/economy");
const { resolveUserFromMessage, resolveUserFromInteraction } = require("../core/userResolver");
const { resolveDuel, parsePositiveAmount } = require("./duelRules");
const { choice } = require("../core/random");
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

const beijoCooldowns = new Map();
const activeDuels = new Map();

function handleBeijarMuroCommand(message) {
  const userId = message.author.id;
  const now = Date.now();
  const cooldown = 30 * 1000;

  if (beijoCooldowns.has(userId)) {
    const expire = beijoCooldowns.get(userId);
    if (now < expire) {
      const sec = Math.ceil((expire - now) / 1000);
      return message.reply(`🧱 Suas bocas ainda estão doloridas de beijar o muro! Espere **${sec}s** para beijar de novo.`);
    }
  }

  beijoCooldowns.set(userId, now + cooldown);

  const gain = Math.floor(Math.random() * 20) + 5;
  addCoins(userId, gain);

  const embed = new EmbedBuilder()
    .setColor('#FF1493')
    .setTitle('🧱 BEIJO NO MURO!')
    .setDescription(`**${message.author.username}** deu um beijo apaixonado no muro da praça e encontrou **${gain} Nanacoins 🪙** caídos no chão!`)
    .setFooter({ text: 'A zoeira não tem limites no Caberé.' });

  return message.reply({ embeds: [embed] });
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
