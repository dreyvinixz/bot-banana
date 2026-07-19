const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, MessageFlags } = require("discord.js");
const config = require("../core/config");
const { getCoins, addCoins, removeCoins, formatCoins } = require("./economy");
const { giveBoost } = require("./boosts");
const { integerBetween, weightedChoice } = require("../core/random");
const { styleFromName } = require("../core/ui");

const lootboxData = config.static.games.lootboxes;
const LOOTBOXES = lootboxData.boxes || {};

function renderPrizeText(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

async function applyReward(interaction, reward, userId) {
  if (reward.type === "boost") {
    giveBoost(userId, reward.value);
    return { text: reward.text };
  }

  if (reward.type === "weapon") {
    const { grantWeapon, getWeaponDef, formatWeaponLabel } = require("./weapons");
    const instance = grantWeapon(userId, reward.value);
    const def = instance ? getWeaponDef(instance.weaponId) : null;
    return { text: reward.text || `uma arma **${def ? formatWeaponLabel(def) : reward.value}**!` };
  }

  if (reward.type === "weaponByRarity") {
    const { grantRandomWeapon, getWeaponDef, formatWeaponLabel } = require("./weapons");
    const instance = grantRandomWeapon(userId, { rarity: reward.rarity });
    const def = instance ? getWeaponDef(instance.weaponId) : null;
    return { text: reward.text || `uma arma **${def ? formatWeaponLabel(def) : reward.rarity}**!` };
  }

  if (reward.type === "coinsRange") {
    const amount = integerBetween(reward.min, reward.max);
    addCoins(userId, amount);
    return { text: renderPrizeText(reward.text, { amount: formatCoins(amount) }) };
  }

  if (reward.type === "coinsPenalty") {
    const penalty = Math.min(getCoins(userId), reward.amount);
    if (penalty > 0) removeCoins(userId, penalty);
    return {
      text: renderPrizeText(reward.text, { amount: formatCoins(penalty) }),
      color: reward.color
    };
  }

  if (reward.type === "spawnBoss") {
    const { spawnWorldBoss } = require("../games/boss");
    const { resetBossTimer } = require("../games/forca");
    if (resetBossTimer) resetBossTimer();
    await spawnWorldBoss([interaction.channel]);
    return { text: reward.text };
  }

  return { text: reward.text };
}

async function handleFliperamaCommand(message) {
  const viewer = message.author || message.user;
  if (!viewer?.id) {
    return message.reply?.("Não consegui identificar quem abriu as lootboxes.");
  }

  const row = new ActionRowBuilder().addComponents(
    ...Object.entries(LOOTBOXES).map(([key, box]) =>
      new ButtonBuilder()
        .setCustomId(`fliperama_buy_${key}_${viewer.id}`)
        .setLabel(box.buttonLabel || `Abrir ${box.label}`)
        .setStyle(styleFromName(box.buttonStyle))
    )
  );

  const description = Object.values(LOOTBOXES)
    .map((box) => `**${box.label}** - ${formatCoins(box.cost)} NC\n> ${box.desc}`)
    .join("\n\n");

  const embed = new EmbedBuilder()
    .setColor("#FF00FF")
    .setTitle("📦 LOOTBOXES DA LOJA NANA 📦")
    .setDescription(`Gaste suas Nanacoins para abrir LootBoxes direto pela loja!\n\n${description}`)
    .setFooter({ text: "Apenas você pode clicar nestes botões." });

  const payload = { embeds: [embed], components: [row] };
  if (message.update) return message.update(payload);
  await message.reply(payload);
}

async function handleFliperamaInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("fliperama_buy_")) return false;

  const parts = interaction.customId.split("_");
  const type = parts[2];
  const ownerId = parts[3];

  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ Esta máquina não é sua! Digite `!fliperama` no chat para jogar.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const box = LOOTBOXES[type];
  if (!box) return true;

  const userId = interaction.user.id;
  const balance = getCoins(userId);
  if (balance < box.cost) {
    await interaction.reply({ content: `❌ Você precisa de **${formatCoins(box.cost)} NC** para abrir a ${box.label}. (Seu saldo: ${formatCoins(balance)})`, flags: MessageFlags.Ephemeral });
    return true;
  }

  removeCoins(userId, box.cost);
  const reward = weightedChoice(box.rewards);
  const result = await applyReward(interaction, reward, userId);
  const embedColor = result.color || box.color;

  const tempEmbed = new EmbedBuilder()
    .setColor(box.color)
    .setTitle(`Abrindo a ${box.label}...`)
    .setDescription("Girando a roleta... `[ 🎲 | 🎲 | 🎲 ]`");

  await interaction.reply({ embeds: [tempEmbed] });

  for (const frame of lootboxData.frames || []) {
    await new Promise((resolve) => setTimeout(resolve, lootboxData.animationDelayMs || 800));
    tempEmbed.setDescription(`Girando a roleta... ${frame}`);
    await interaction.editReply({ embeds: [tempEmbed] }).catch(() => null);
  }

  await new Promise((resolve) => setTimeout(resolve, lootboxData.animationDelayMs || 800));

  const resultEmbed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(`Você abriu a ${box.label}`)
    .setDescription(`O botão foi apertado... a caixa estremece e se abre revelando:\n\n🎉 **${result.text}**`)
    .setFooter({ text: `Custou ${formatCoins(box.cost)} NC.` });

  await interaction.editReply({ embeds: [resultEmbed] }).catch(() => null);
  return true;
}

module.exports = {
  handleFliperamaCommand,
  handleFliperamaInteraction,
  applyReward,
  LOOTBOXES
};
