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

  const WIN_GIF = "https://tenor.com/view/magic-smile-wink-80s-cartoon-gif-16965463.gif";
  const LOSS_GIF = "https://tenor.com/view/omg-what-no-way-emoji-shock-gif-24390671.gif";

  let usedRabbitFoot = false;
  if (hasItem(userId, "pe_coelho") || hasItem(userId, "pe_de_coelho")) {
    const rabbitItem = hasItem(userId, "pe_coelho") ? "pe_coelho" : "pe_de_coelho";
    removeItem(userId, rabbitItem, 1);
    usedRabbitFoot = true;
  }

  // Se usou Pé de Coelho, ganha direto o Jackpot de 1000
  if (usedRabbitFoot) {
    const gain = 1000;
    addCoins(userId, gain);

    const embed = new EmbedBuilder()
      .setColor('#FF1493')
      .setTitle('🐰 BEIJO DA SORTE SUPREMA (PÉ DE COELHO)!')
      .setDescription(`**${message.author.username}**, seu Pé de Coelho evitou todo o azar do muro e te garantiu o prêmio máximo!`)
      .addFields({ name: '💰 Prêmio Máximo', value: `**+ ${gain} Nanacoins 🪙**` })
      .setImage(WIN_GIF)
      .setFooter({ text: 'A zoeira não tem limites no Caberé.' });

    return message.reply({ embeds: [embed] });
  }

  const roll = integerBetween(1, 100);

  // 15% de chance de Jackpot (1000 coins)
  if (roll <= 15) {
    const gain = 1000;
    addCoins(userId, gain);

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🎰 BEIJO DA SORTE SUPREMA!')
      .setDescription(`**${message.author.username}**, você beijou o muro e achou o TESOURO ESCONDIDO de 1000 moedas no tijolo!`)
      .addFields({ name: '💰 Prêmio Especial', value: `**+ ${gain} Nanacoins 🪙**` })
      .setImage(WIN_GIF)
      .setFooter({ text: 'A zoeira não tem limites no Caberé.' });

    return message.reply({ embeds: [embed] });
  }

  // 60% de chance de Ganho normal (200 a 700 coins)
  if (roll <= 75) {
    const gain = integerBetween(200, 700);
    addCoins(userId, gain);

    const embed = new EmbedBuilder()
      .setColor('#FF1493')
      .setTitle('💋 BEIJO DA SORTE GRANDE!')
      .setDescription(`**${message.author.username}**, você beijou o muro com paixão e encontrou um tesouro escondido!`)
      .addFields({ name: '💰 Prêmio', value: `**+ ${gain} Nanacoins 🪙**` })
      .setImage(WIN_GIF)
      .setFooter({ text: 'A zoeira não tem limites no Caberé.' });

    return message.reply({ embeds: [embed] });
  }

  // 25% de chance de Perda (100 a 300 coins)
  const loss = integerBetween(100, 300);
  removeCoins(userId, loss);

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('💥 O MURO DEU O TROCO!')
    .setDescription(`**${message.author.username}**, você beijou o muro de mau jeito, bateu a cara e teve que pagar o dentista!`)
    .addFields({ name: '💸 Prejuízo', value: `**- ${loss} Nanacoins 🪙**` })
    .setImage(LOSS_GIF)
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
