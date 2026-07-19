const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder } = require("discord.js");
const config = require("../core/config");
const { getDynamicPrice, removeStock, getItemStockInfo } = require("./shopStock");
const { recordLedgerEvent } = require("./ledger");
const { getCoins, addCoins, removeCoins, formatCoins } = require("./economy");

const fs = require("fs");
const path = require("path");
const { createDebouncedJsonWriter } = require("../core/storage");

// Estruturas de memória para guardar os boosts ativos
// Map<userId, { mult: number, expire: timestamp }>
const gameBoosts = new Map();

// Map<userId, { chanceExtra: number, expire: timestamp }>
const stealBoosts = new Map();

// Map<userId, expire_timestamp>
const peCabraBoosts = new Map();
const escudoBoosts = new Map();

const BOOSTS_PATH = path.join(config.paths.data, "boosts.json");

function carregarBoosts() {
  try {
    if (fs.existsSync(BOOSTS_PATH)) {
      const data = JSON.parse(fs.readFileSync(BOOSTS_PATH, "utf-8"));
      if (data.gameBoosts) data.gameBoosts.forEach(([k, v]) => gameBoosts.set(k, v));
      if (data.stealBoosts) data.stealBoosts.forEach(([k, v]) => stealBoosts.set(k, v));
      if (data.peCabraBoosts) data.peCabraBoosts.forEach(([k, v]) => peCabraBoosts.set(k, v));
      if (data.escudoBoosts) data.escudoBoosts.forEach(([k, v]) => escudoBoosts.set(k, v));
    }
  } catch (err) {
    console.error("Erro ao carregar boosts:", err);
  }
}

const salvarBoosts = createDebouncedJsonWriter(BOOSTS_PATH, () => ({
  gameBoosts: Array.from(gameBoosts.entries()),
  stealBoosts: Array.from(stealBoosts.entries()),
  peCabraBoosts: Array.from(peCabraBoosts.entries()),
  escudoBoosts: Array.from(escudoBoosts.entries())
}), config.static.app.timers.saveDebounceMs || 5000);

carregarBoosts();

const BOOST_PRICES = config.static.shop.boosts || {};
const BOOST_MENU_ORDER = config.static.shop.menuOrder || Object.keys(BOOST_PRICES);

// Funções para uso em outros módulos
function getGameMultiplier(userId) {
  if (!gameBoosts.has(userId)) return 1;
  const boost = gameBoosts.get(userId);
  if (Date.now() > boost.expire) {
    gameBoosts.delete(userId);
    salvarBoosts();
    return 1;
  }
  return boost.mult;
}

function getStealChanceExtra(userId) {
  if (!stealBoosts.has(userId)) return 0;
  const boost = stealBoosts.get(userId);
  if (Date.now() > boost.expire) {
    stealBoosts.delete(userId);
    salvarBoosts();
    return 0;
  }
  return boost.chanceExtra;
}

function hasPeCabra(userId) {
  if (!peCabraBoosts.has(userId)) return false;
  if (Date.now() > peCabraBoosts.get(userId)) {
    peCabraBoosts.delete(userId);
    salvarBoosts();
    return false;
  }
  return true;
}

function hasEscudoEspinhos(userId) {
  if (!escudoBoosts.has(userId)) return false;
  if (Date.now() > escudoBoosts.get(userId)) {
    escudoBoosts.delete(userId);
    salvarBoosts();
    return false;
  }
  return true;
}

// Limpeza de Memória Periódica (a cada 1 hora)
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [userId, boost] of gameBoosts.entries()) {
    if (now > boost.expire) { gameBoosts.delete(userId); changed = true; }
  }
  for (const [userId, boost] of stealBoosts.entries()) {
    if (now > boost.expire) { stealBoosts.delete(userId); changed = true; }
  }
  for (const [userId, expire] of peCabraBoosts.entries()) {
    if (now > expire) { peCabraBoosts.delete(userId); changed = true; }
  }
  for (const [userId, expire] of escudoBoosts.entries()) {
    if (now > expire) { escudoBoosts.delete(userId); changed = true; }
  }
  if (changed) salvarBoosts();
}, config.static.app.boosts.cleanupIntervalMs);
cleanupInterval.unref?.();

function shopButtons(ownerId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shop_cat_boosts_${ownerId}`).setLabel("🚀 Boosts").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`shop_cat_items_${ownerId}`).setLabel("🎒 Itens").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`shop_cat_lootbox_${ownerId}`).setLabel("📦 Lootboxes").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`shop_cat_market_${ownerId}`).setLabel("📈 Bolsa de Valores").setStyle(ButtonStyle.Danger)
    )
  ];
}

function boostOptions(category) {
  return BOOST_MENU_ORDER
    .filter((key) => {
      const item = BOOST_PRICES[key];
      if (category === "items") return ["item", "freeItem", "spawnBoss", "spawnMiniBoss", "material"].includes(item.type);
      if (category === "boosts") return !["item", "freeItem", "spawnBoss", "spawnMiniBoss", "material"].includes(item.type);
      return true;
    })
    .map((key) => {
      const item = BOOST_PRICES[key];
      let dynPrice = item.cost;
      let stockIndicator = "";
      
      if (item.type === "material" || item.type === "item") {
        dynPrice = getDynamicPrice(key, item.basePrice || item.cost, item.minPrice || item.cost, item.maxPrice || item.cost);
        const stockInfo = getItemStockInfo(key, item.targetStock || 50);
        if (stockInfo.stock < stockInfo.targetStock * 0.5) stockIndicator = " 📉 Baixo Estoque";
        else if (stockInfo.stock > stockInfo.targetStock * 1.5) stockIndicator = " 📈 Promoção";
      }

      return {
        label: item.menuLabel || item.label,
        description: `${formatCoins(dynPrice)} NC${stockIndicator} - ${item.description}`.slice(0, 100),
        value: key,
        emoji: item.emoji
      };
    });
}

function buildBoostSelect(ownerId, category = "all") {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`boost_select_${ownerId}`)
      .setPlaceholder('Escolha uma compra...')
      .addOptions(boostOptions(category).slice(0, 25))
  );
  return row;
}

// Handler do comando !boost
async function handleBoostCommand(message) {
  const payload = {
    content: "🏪 **MERCADO NANACOIN**\nEscolha uma categoria. Armas agora só vêm de **craft na Forja**, **drops** ou compra de outros jogadores na `!bolsa`.",
    embeds: [],
    components: shopButtons(message.author?.id || message.user?.id)
  };
  
  if (message.update) return message.update(payload);
  return message.reply(payload);
}

async function showShopCategory(interaction, category) {
  const ownerId = interaction.customId.split("_").at(-1);
  if (interaction.user.id !== ownerId) {
    return interaction.reply({ content: "❌ Esta loja foi aberta por outro jogador! Digite `!loja` no chat para abrir a sua.", flags: MessageFlags.Ephemeral });
  }

  if (category === "weapons" || category === "legendary") {
    return interaction.reply({
      content: "⚒️ A compra direta de armas saiu da loja. Use `!inv` > **Forja** para craftar, ou `!bolsa` para comprar de outro jogador.",
      flags: MessageFlags.Ephemeral
    });
  }

  if (category === "market") {
    const { handleMarketCommand } = require("./market");
    return handleMarketCommand({ user: interaction.user, update: (payload) => interaction.update(payload) });
  }

  if (category === "lootbox") {
    const { handleFliperamaCommand } = require("./fliperama");
    return handleFliperamaCommand({
      author: interaction.user,
      user: interaction.user,
      update: (payload) => interaction.update(payload)
    });
  }

  const { EmbedBuilder } = require("discord.js");

  const isItems = category === "items";
  const embed = new EmbedBuilder()
    .setColor(isItems ? "#3B82F6" : "#8B5CF6")
    .setTitle(isItems ? "🎒 Suprimentos e Consumíveis" : "🚀 Mercado de Boosts")
    .setDescription(isItems
      ? "Itens de uso único que podem te salvar de prisões, castigos ou furar as defesas inimigas!"
      : "Multiplique seus ganhos, aumente suas chances de roubo e compre proteções temporárias.")
    .setFooter({ text: "Selecione um item no menu abaixo para comprar." });

  return interaction.update({
    content: "",
    embeds: [embed],
    components: [buildBoostSelect(ownerId, category), ...shopButtons(ownerId)]
  });
}

// Handler da interação do menu
async function handleBoostInteraction(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("weapon_select_")) {
    return interaction.reply({
      content: "⚒️ A compra direta de armas saiu da loja. Use `!inv` > **Forja** para craftar, ou `!bolsa` para comprar de outro jogador.",
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.isButton() && interaction.customId.startsWith("shop_cat_")) {
    return showShopCategory(interaction, interaction.customId.split("_")[2]);
  }

  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('boost_select_')) return false;

  const ownerId = interaction.customId.split('_')[2];
  if (interaction.user.id !== ownerId) {
    return interaction.reply({ content: "❌ Esta loja foi aberta por outro jogador! Digite `!loja` no chat para abrir a sua própria loja.", flags: MessageFlags.Ephemeral });
  }

  const userId = interaction.user.id;
  const choice = interaction.values[0];
  const boostConfig = BOOST_PRICES[choice];

  if (!boostConfig) {
    return interaction.reply({ content: "Opção inválida.", flags: MessageFlags.Ephemeral });
  }

  // Casos especiais
  if (choice === 'bomba_fumaca_free') {
    const { addItem, canClaimSmokeBomb, updateSmokeBombTimer } = require("./inventory");
    if (!canClaimSmokeBomb(userId)) {
      return interaction.reply({ content: `❌ Você já resgatou sua Bomba de Fumaça recentemente! Volte depois de 12 horas.`, flags: MessageFlags.Ephemeral });
    }
    addItem(userId, boostConfig.grants || 'bomba_fumaca', 1);
    updateSmokeBombTimer(userId);
    return interaction.reply({ content: `✅ **SUCESSO!** Você resgatou uma **Bomba de Fumaça 💨** gratuita! Use-a com sabedoria.`, flags: MessageFlags.Ephemeral });
  }

  let dynPrice = boostConfig.cost;
  if (boostConfig.type === "material" || boostConfig.type === "item") {
    dynPrice = getDynamicPrice(choice, boostConfig.basePrice || boostConfig.cost, boostConfig.minPrice || boostConfig.cost, boostConfig.maxPrice || boostConfig.cost);
  }

  const myCoins = getCoins(userId);
  if (myCoins < dynPrice) {
    return interaction.reply({ 
      content: `❌ Fundos insuficientes! Você precisa de **${formatCoins(dynPrice)} Nanacoins 🪙** para comprar "${boostConfig.label}". (Seu saldo: ${formatCoins(myCoins)})`, 
      flags: MessageFlags.Ephemeral 
    });
  }

  removeCoins(userId, dynPrice);
  
  if (boostConfig.type === 'item' || boostConfig.type === 'material') {
    removeStock(choice, 1, boostConfig.targetStock || 50);
  }
  recordLedgerEvent("shop_buy", { userId, itemId: choice, price: dynPrice, amount: 1 });

  // Aplica o boost na memória ou adiciona item
  if (boostConfig.type === 'game') {
    gameBoosts.set(userId, {
      mult: boostConfig.mult,
      expire: Date.now() + boostConfig.durationMs
    });
    salvarBoosts();
  } else if (boostConfig.type === 'steal') {
    stealBoosts.set(userId, {
      chanceExtra: boostConfig.chanceExtra,
      expire: Date.now() + boostConfig.durationMs
    });
    salvarBoosts();
  } else if (boostConfig.type === 'buff' && boostConfig.buff === 'peCabra') {
    peCabraBoosts.set(userId, Date.now() + boostConfig.durationMs);
    salvarBoosts();
  } else if (boostConfig.type === 'buff' && boostConfig.buff === 'escudoEspinhos') {
    escudoBoosts.set(userId, Date.now() + boostConfig.durationMs);
    salvarBoosts();
  } else if (boostConfig.type === 'item' || boostConfig.type === 'material') {
    const { addItem } = require("./inventory");
    addItem(userId, choice, 1);
  } else if (boostConfig.type === 'spawnBoss' || boostConfig.type === 'spawnMiniBoss') {
    const { spawnWorldBoss, spawnMiniBoss } = require("../games/boss");
    const { resetBossTimer } = require("../games/forca");
    
    // Força o reset das 12h no games.js se for o World Boss principal
    if (boostConfig.type === 'spawnBoss' && resetBossTimer) resetBossTimer();

    // Spawna apenas no canal em que a compra foi efetuada
    if (boostConfig.type === 'spawnBoss') {
      spawnWorldBoss([interaction.channel]);
    } else {
      spawnMiniBoss([interaction.channel]);
    }
  }

  // Responde efemeramente
  await interaction.reply({ 
    content: `✅ **SUCESSO!** Você comprou o **${boostConfig.label}** por ${formatCoins(boostConfig.cost)} Nanacoins. O efeito já está ativo!`, 
    flags: MessageFlags.Ephemeral 
  });

  // Avisa publicamente no canal
  const channel = interaction.client.channels.cache.get(interaction.channelId);
  if (channel) {
    channel.send(`🚀 **ALERTA DE BOOST!** O(A) jogador(a) **${interaction.user.username}** acaba de ativar um **${boostConfig.label}**! O mercado de Nanacoins está aquecido!`);
  }
}
// Função helper para dar boost diretamente (usado no Fliperama)
function giveBoost(userId, choice) {
  const boostConfig = BOOST_PRICES[choice];
  if (!boostConfig) return;

  if (boostConfig.type === 'game') {
    gameBoosts.set(userId, {
      mult: boostConfig.mult,
      expire: Date.now() + boostConfig.durationMs
    });
    salvarBoosts();
  } else if (boostConfig.type === 'steal') {
    stealBoosts.set(userId, {
      chanceExtra: boostConfig.chanceExtra,
      expire: Date.now() + boostConfig.durationMs
    });
    salvarBoosts();
  } else if (boostConfig.type === 'buff' && boostConfig.buff === 'peCabra') {
    peCabraBoosts.set(userId, Date.now() + boostConfig.durationMs);
    salvarBoosts();
  } else if (boostConfig.type === 'buff' && boostConfig.buff === 'escudoEspinhos') {
    escudoBoosts.set(userId, Date.now() + boostConfig.durationMs);
    salvarBoosts();
  } else if (boostConfig.type === 'item' || boostConfig.type === 'spawnBoss' || boostConfig.type === 'spawnMiniBoss') {
    const { addItem } = require("./inventory");
    addItem(userId, choice, 1);
  }
}


module.exports = {
  handleBoostCommand,
  handleBoostInteraction,
  getGameMultiplier,
  getStealChanceExtra,
  hasPeCabra,
  hasEscudoEspinhos,
  giveBoost
};
