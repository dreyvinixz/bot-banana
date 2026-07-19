const fs = require("fs");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const config = require("../core/config");
const { createDebouncedJsonWriter, writeJsonFileSync } = require("../core/storage");
const { getCoins, addCoins, removeCoins, formatCoins } = require("./economy");
const { getSystemSellPrice, addStock } = require("./shopStock");
const { recordLedgerEvent } = require("./ledger");
const {
  getUserInventory,
  lockInventoryEntry,
  unlockInventoryEntry,
  transferLockedEntry
} = require("./inventory");
const { getWeaponDef, formatWeaponLabel } = require("./weapons");

let db = { orders: [], history: [], trades: [] };
const marketConfig = config.static.app.market || {};
let disableSavingForTests = false;

function loadMarket() {
  try {
    if (fs.existsSync(config.paths.market)) {
      db = JSON.parse(fs.readFileSync(config.paths.market, "utf-8"));
    }
  } catch (err) {
    console.error("Erro ao carregar bolsa:", err);
  }
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Array.isArray(db.history)) db.history = [];
  if (!Array.isArray(db.trades)) db.trades = [];
}

const saveMarket = createDebouncedJsonWriter(config.paths.market, () => db, config.static.app.timers.saveDebounceMs);
loadMarket();

function saveMarketSync() {
  if (!disableSavingForTests) writeJsonFileSync(config.paths.market, db);
}

function scheduleMarketSave() {
  if (!disableSavingForTests) saveMarket();
}

function now() {
  return Date.now();
}

function cleanupExpiredOrders() {
  let changed = false;
  for (const order of db.orders) {
    if (order.status === "active" && order.expiresAt <= now()) {
      order.status = "expired";
      unlockInventoryEntry(order.sellerId, order.entry);
      changed = true;
    }
  }
  if (changed) scheduleMarketSave();
}

const ITEM_LABELS = {
  bomba_fumaca: "💨 Bomba de Fumaça",
  peCabra: "🔧 Pé de Cabra",
  escudoEspinhos: "🛡️ Escudo de Espinhos",
  acido_corrosivo: "🧪 Ácido Corrosivo",
  pe_coelho: "🐰 Pé de Coelho",
  pe_de_coelho: "🐰 Pé de Coelho"
};

function describeEntry(entry) {
  if (entry.kind === "item") {
    const label = ITEM_LABELS[entry.itemId] || entry.itemId;
    return `${label} x${entry.amount || 1}`;
  }
  const def = getWeaponDef(entry.weaponId);
  return def ? formatWeaponLabel({ ...entry, def }) : entry.weaponId;
}

function getActiveOrders() {
  cleanupExpiredOrders();
  return db.orders.filter((order) => order.status === "active");
}

function getSuggestedPrice(entry) {
  const base = entry.basePrice || 100;
  const recent = db.history
    .filter((sale) => sale.itemKey === entry.itemKey)
    .filter((sale) => sale.buyerId !== "system" && sale.sellerId !== "system")
    .slice(-10);
  if (recent.length === 0) return base;
  const avg = recent.reduce((sum, sale) => {
    const amount = sale.entry?.kind === "item" ? sale.entry.amount || 1 : 1;
    return sum + (sale.price / amount);
  }, 0) / recent.length;
  const floor = base * (marketConfig.suggestedPriceFloor || 0.5);
  const ceil = base * (marketConfig.suggestedPriceCeil || 2.5);
  return Math.floor(Math.max(floor, Math.min(ceil, avg)));
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function getEntryAmount(entry) {
  return entry.kind === "item" ? entry.amount || 1 : 1;
}

function sellableEntries(userId) {
  const inventory = getUserInventory(userId);
  const items = Object.entries(inventory.items)
    .filter(([, amount]) => amount > 0)
    .map(([itemId, amount]) => ({
      kind: "item",
      itemId,
      amount: 1,
      available: amount,
      itemKey: `item:${itemId}`,
      basePrice: 100,
      label: `${itemId} x${amount}`
    }));

  const weapons = inventory.weapons
    .filter((weapon) => !weapon.lockedUntil)
    .map((weapon) => {
      const def = getWeaponDef(weapon.weaponId);
      return {
        kind: "weapon",
        instanceId: weapon.instanceId,
        weaponId: weapon.weaponId,
        durabilityLeft: weapon.durabilityLeft,
        itemKey: `weapon:${weapon.weaponId}`,
        basePrice: def?.basePrice || 100,
        label: def ? formatWeaponLabel({ ...weapon, def }) : weapon.weaponId
      };
    });

  return [...items, ...weapons];
}

function createOrder(sellerId, entry, price) {
  cleanupExpiredOrders();
  if (!entry || !["item", "weapon"].includes(entry.kind)) {
    return { ok: false, reason: "Item inválido para venda." };
  }
  if (!isPositiveInteger(price)) {
    return { ok: false, reason: "Preço inválido." };
  }
  if (entry.kind === "item" && !isPositiveInteger(entry.amount || 1)) {
    return { ok: false, reason: "Quantidade inválida." };
  }

  const activeBySeller = db.orders.filter((order) => order.sellerId === sellerId && order.status === "active").length;
  if (activeBySeller >= (marketConfig.maxActiveOrdersPerUser || 10)) {
    return { ok: false, reason: "Você já atingiu o limite de ordens ativas." };
  }

  const lockedEntry = {
    ...entry,
    amount: getEntryAmount(entry),
    itemKey: entry.itemKey || (entry.kind === "item" ? `item:${entry.itemId}` : `weapon:${entry.weaponId}`),
    lockedUntil: now() + (marketConfig.orderExpireMs || 86400000)
  };
  if (!lockInventoryEntry(sellerId, lockedEntry)) {
    return { ok: false, reason: "Não consegui travar este item. Talvez ele já tenha sido usado ou vendido." };
  }

  const order = {
    id: `ord_${now()}_${Math.floor(Math.random() * 10000)}`,
    sellerId,
    entry: lockedEntry,
    itemKey: lockedEntry.itemKey,
    price,
    status: "active",
    createdAt: now(),
    expiresAt: lockedEntry.lockedUntil
  };
  db.orders.push(order);
  recordLedgerEvent("market_create_order", {
    userId: sellerId,
    orderId: order.id,
    itemKey: order.itemKey,
    itemId: lockedEntry.itemId,
    weaponId: lockedEntry.weaponId,
    amount: getEntryAmount(lockedEntry),
    price
  });
  saveMarketSync(); // Immediate sync save for critical operation
  scheduleMarketSave(); // Also schedule debounced save
  return { ok: true, order };
}

function buyOrder(buyerId, orderId) {
  cleanupExpiredOrders();
  const order = db.orders.find((item) => item.id === orderId && item.status === "active");
  if (!order) return { ok: false, reason: "Ordem não encontrada ou expirada." };
  if (order.sellerId === buyerId) return { ok: false, reason: "Você não pode comprar sua própria ordem." };
  if (getCoins(buyerId) < order.price) return { ok: false, reason: "Saldo insuficiente para comprar esta ordem." };

  const feePercent = marketConfig.marketFeePercent || 0.05;
  const fee = Math.floor(order.price * feePercent);
  const sellerReceives = order.price - fee;

  removeCoins(buyerId, order.price);
  addCoins(order.sellerId, sellerReceives);
  if (!transferLockedEntry(order.sellerId, buyerId, order.entry)) {
    addCoins(buyerId, order.price);
    removeCoins(order.sellerId, sellerReceives);
    return { ok: false, reason: "Falha ao transferir item. A compra foi revertida." };
  }

  recordLedgerEvent("market_buy", {
    userId: buyerId,
    targetId: order.sellerId,
    orderId,
    itemKey: order.itemKey,
    itemId: order.entry.itemId,
    weaponId: order.entry.weaponId,
    amount: getEntryAmount(order.entry),
    grossAmount: order.price,
    fee,
    netAmount: sellerReceives
  });
  recordLedgerEvent("market_fee", {
    userId: order.sellerId,
    targetId: buyerId,
    orderId,
    itemKey: order.itemKey,
    amount: fee,
    grossAmount: order.price,
    fee,
    netAmount: sellerReceives
  });

  order.status = "sold";
  order.buyerId = buyerId;
  order.soldAt = now();
  db.history.push({
    orderId: order.id,
    itemKey: order.itemKey,
    entry: order.entry,
    sellerId: order.sellerId,
    buyerId,
    price: order.price,
    soldAt: order.soldAt
  });
  while (db.history.length > (marketConfig.historyLimit || 100)) db.history.shift();
  saveMarketSync(); // Immediate sync save
  scheduleMarketSave();
  return { ok: true, order };
}

function createTrade({ proposerId, targetId, entry, price }) {
  const lockedEntry = {
    ...entry,
    lockedUntil: now() + (marketConfig.orderExpireMs || 86400000)
  };
  if (!lockInventoryEntry(proposerId, lockedEntry)) {
    return { ok: false, reason: "Não consegui travar este item para trade." };
  }

  const trade = {
    id: `trd_${now()}_${Math.floor(Math.random() * 10000)}`,
    proposerId,
    targetId,
    entry: lockedEntry,
    price,
    status: "pending",
    createdAt: now(),
    expiresAt: lockedEntry.lockedUntil
  };
  db.trades.push(trade);
  scheduleMarketSave();
  return { ok: true, trade };
}

function acceptTrade(targetId, tradeId) {
  const trade = db.trades.find((item) => item.id === tradeId && item.status === "pending");
  if (!trade) return { ok: false, reason: "Trade não encontrado ou já finalizado." };
  if (trade.targetId !== targetId) return { ok: false, reason: "Esse trade não é para você." };
  if (trade.expiresAt <= now()) {
    trade.status = "expired";
    unlockInventoryEntry(trade.proposerId, trade.entry);
    scheduleMarketSave();
    return { ok: false, reason: "Trade expirado." };
  }
  if (getCoins(targetId) < trade.price) return { ok: false, reason: "Saldo insuficiente para aceitar o trade." };

  removeCoins(targetId, trade.price);
  addCoins(trade.proposerId, trade.price);
  if (!transferLockedEntry(trade.proposerId, targetId, trade.entry)) {
    addCoins(targetId, trade.price);
    removeCoins(trade.proposerId, trade.price);
    return { ok: false, reason: "Falha ao transferir item. Trade revertido." };
  }

  trade.status = "accepted";
  trade.acceptedAt = now();
  db.history.push({
    orderId: trade.id,
    itemKey: trade.entry.itemKey,
    entry: trade.entry,
    sellerId: trade.proposerId,
    buyerId: targetId,
    price: trade.price,
    soldAt: trade.acceptedAt
  });
  scheduleMarketSave();
  return { ok: true, trade };
}

function cancelOrder(ownerId, orderId) {
  const order = db.orders.find((item) => item.id === orderId && item.status === "active");
  if (!order) return { ok: false, reason: "Ordem não encontrada ou já concluída." };
  if (order.sellerId !== ownerId) return { ok: false, reason: "Você não é dono desta ordem." };
  
  order.status = "cancelled";
  order.cancelledAt = now();
  unlockInventoryEntry(ownerId, order.entry);
  saveMarketSync();
  scheduleMarketSave();
  
  recordLedgerEvent("market_cancel_order", {
    userId: ownerId,
    orderId,
    itemKey: order.itemKey,
    itemId: order.entry.itemId,
    weaponId: order.entry.weaponId,
    amount: getEntryAmount(order.entry),
    price: order.price
  });
  return { ok: true, order };
}

async function showMyOrders(interaction, ownerId) {
  const orders = db.orders.filter(item => item.sellerId === ownerId && item.status === "active");
  if (orders.length === 0) {
    return interaction.update({ content: "📦 Você não tem nenhuma ordem ativa no momento.", embeds: [], components: marketRows(ownerId) });
  }
  
  const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require("discord.js");
  
  const embed = new EmbedBuilder()
    .setColor("#38BDF8")
    .setTitle("📦 Minhas Ordens Ativas")
    .setDescription(orders.map((order) => {
      const created = new Date(order.createdAt).toLocaleString("pt-BR");
      return `\`${order.id}\` - ${describeEntry(order.entry)} | ${formatCoins(order.price)} NC | ${created} | ${order.status}`;
    }).join("\n"));
    
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`market_cancel_pick_${ownerId}`)
      .setPlaceholder("Escolha uma ordem para cancelar...")
      .addOptions(orders.map((order) => ({
        label: describeEntry(order.entry).slice(0, 100),
        description: `Preço: ${formatCoins(order.price)} NC`.slice(0, 100),
        value: order.id
      })))
  );
  
  return interaction.update({ content: "", embeds: [embed], components: [row, ...marketRows(ownerId)] });
}

function rejectTrade(userId, tradeId) {
  const trade = db.trades.find((item) => item.id === tradeId && item.status === "pending");
  if (!trade) return { ok: false, reason: "Trade não encontrado ou já finalizado." };
  if (![trade.targetId, trade.proposerId].includes(userId)) return { ok: false, reason: "Você não faz parte deste trade." };
  trade.status = "rejected";
  unlockInventoryEntry(trade.proposerId, trade.entry);
  scheduleMarketSave();
  return { ok: true, trade };
}

function systemSell(userId, entry) {
  if (!entry || !["item", "weapon"].includes(entry.kind)) return { ok: false, reason: "Item inválido." };
  if (entry.kind === "item" && !isPositiveInteger(entry.amount || 1)) return { ok: false, reason: "Quantidade inválida." };

  let price = 0;
  if (entry.kind === "item") {
    // Busca basePrice da configuração para o item/material
    const BOOST_PRICES = config.static.shop.boosts || {};
    const itemConf = BOOST_PRICES[entry.itemId] || {};
    const baseP = itemConf.basePrice || itemConf.cost || getSuggestedPrice(entry);
    const minP = itemConf.minPrice || itemConf.cost || baseP;
    const maxP = itemConf.maxPrice || itemConf.cost || baseP;
    
    // Calcula valor dinâmico com trava anti-arbitragem
    price = getSystemSellPrice(entry.itemId, baseP, minP, maxP);
    // Venda em lote se houver amount
    if (entry.amount && entry.amount > 1) {
      price = price * entry.amount;
    }
  } else {
    // Para armas ou itens sem estoque virtual
    price = Math.floor(getSuggestedPrice(entry) * (marketConfig.systemSellPercent || 0.55));
  }

  if (!lockInventoryEntry(userId, entry)) return { ok: false, reason: "Não consegui vender este item." };
  
  if (entry.kind === "item") {
    addStock(entry.itemId, entry.amount || 1, 50);
  } else {
    transferLockedEntry(userId, "system", entry);
  }

  addCoins(userId, price);
  db.history.push({
    orderId: `sys_${now()}`,
    itemKey: entry.itemKey,
    entry,
    sellerId: userId,
    buyerId: "system",
    price,
    soldAt: now()
  });
  
  recordLedgerEvent("system_sell", {
    userId,
    itemKey: entry.itemKey,
    itemId: entry.itemId,
    weaponId: entry.weaponId,
    price,
    amount: entry.amount || 1
  });
  
  scheduleMarketSave();
  return { ok: true, price };
}

function marketRows(ownerId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`market_home_${ownerId}`).setLabel("Mercado").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`market_sell_${ownerId}`).setLabel("Vender").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`market_buy_${ownerId}`).setLabel("Comprar").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`market_trade_${ownerId}`).setLabel("Trade").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`market_history_${ownerId}`).setLabel("Historico").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`market_myorders_${ownerId}`).setLabel("Minhas Ordens").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`market_shop_${ownerId}`).setLabel("Voltar p/ Loja").setStyle(ButtonStyle.Danger)
    )
  ];
}

function ownerFromCustomId(customId) {
  // market_home_OWNER, market_sell_OWNER, market_buy_OWNER, market_trade_OWNER, market_history_OWNER, market_shop_OWNER
  // All of these have owner at index 2
  return customId.split("_")[2];
}

// Returns owner only for simple market_VERB_OWNER style customIds
function simpleOwner(customId) {
  const parts = customId.split("_");
  // Simple pattern: market_VERB_OWNER  where VERB is single word
  return parts[2];
}

async function handleMarketCommand(message) {
  const orders = getActiveOrders();
  const ownerId = message.author?.id || message.user?.id;
  
  let embed;
  if (orders.length === 0) {
    embed = new EmbedBuilder()
      .setColor("#38BDF8")
      .setTitle("📈 Bolsa de Valores")
      .setDescription("📭 Nenhuma ordem ativa na Bolsa no momento.");
  } else {
    const lines = orders.slice(0, 30).map((order) => `\`${order.id}\` — **${describeEntry(order.entry)}**\n💰 Valor: **${formatCoins(order.price)} NC** | 👤 Vendedor: <@${order.sellerId}>`);
    embed = new EmbedBuilder()
      .setColor("#FBBF24")
      .setTitle("📋 Murais de Anúncios da Bolsa")
      .setDescription(lines.join("\n\n"));
  }
  
  if (message.reply) {
    return message.reply({ embeds: [embed], components: marketRows(ownerId) });
  } else if (message.update) {
    return message.update({ content: "", embeds: [embed], components: marketRows(ownerId) });
  }
}

async function showSell(interaction, ownerId) {
  const entries = sellableEntries(ownerId).slice(0, 25);
  if (entries.length === 0) {
    return interaction.reply({ content: "Você não tem itens ou armas livres para vender.", flags: MessageFlags.Ephemeral });
  }
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`market_sell_pick_${ownerId}`)
      .setPlaceholder("Escolha o que vender...")
      .addOptions(entries.map((entry, index) => ({
        label: entry.label.slice(0, 100),
        description: `Sugerido: ${formatCoins(getSuggestedPrice(entry))} NC`.slice(0, 100),
        value: String(index)
      })))
  );
  return interaction.update({ content: "📤 **Escolha o item/arma para vender.**", embeds: [], components: [row, ...marketRows(ownerId)] });
}

async function showBuy(interaction, ownerId) {
  const orders = getActiveOrders().slice(0, 25);
  if (orders.length === 0) {
    return interaction.update({ content: "📭 Nenhuma ordem ativa na Bolsa.", embeds: [], components: marketRows(ownerId) });
  }
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`market_buy_pick_${ownerId}`)
      .setPlaceholder("Escolha uma ordem para comprar...")
      .addOptions(orders.map((order) => ({
        label: `${describeEntry(order.entry)} - ${formatCoins(order.price)} NC`.slice(0, 100),
        description: `Vendedor: ${order.sellerId}`.slice(0, 100),
        value: order.id
      })))
  );
  return interaction.update({ content: "🛒 **Escolha uma ordem para confirmar compra.**", embeds: [], components: [row, ...marketRows(ownerId)] });
}

async function showHistory(interaction, ownerId) {
  const lines = db.history.slice(-10).reverse().map((sale) => `${describeEntry(sale.entry)} por **${formatCoins(sale.price)} NC**`);
  return interaction.update({ content: `📊 **Histórico da Bolsa**\n${lines.join("\n") || "Sem vendas ainda."}`, embeds: [], components: marketRows(ownerId) });
}

async function showTrade(interaction, ownerId) {
  const entries = sellableEntries(ownerId).slice(0, 25);
  if (entries.length === 0) {
    return interaction.reply({ content: "Você não tem itens ou armas livres para oferecer em trade.", flags: MessageFlags.Ephemeral });
  }
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`market_trade_pick_${ownerId}`)
      .setPlaceholder("Escolha o item/arma para oferecer...")
      .addOptions(entries.map((entry, index) => ({
        label: entry.label.slice(0, 100),
        description: "Depois informe alvo e valor em Nanacoins.",
        value: String(index)
      })))
  );
  return interaction.update({ content: "🤝 **Escolha o que deseja oferecer em trade.**", embeds: [], components: [row, ...marketRows(ownerId)] });
}

async function handleMarketInteraction(interaction) {
  if (!interaction.customId?.startsWith("market_")) return false;

  if (interaction.isButton()) {
    // IMPORTANT: check more-specific prefixes FIRST before generic ones
    if (interaction.customId.startsWith("market_sell_order_") || interaction.customId.startsWith("market_sell_system_")) {
      const parts = interaction.customId.split("_");
      const mode = parts[2];
      const ownerId = parts[3];
      const kind = parts[4];
      const ref = parts.slice(5).join("_");
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: "❌ Esta Bolsa foi aberta por outro jogador.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const entry = sellableEntries(ownerId).find((item) => kind === "weapon" ? item.instanceId === ref : item.itemId === ref);
      if (!entry) {
        await interaction.reply({ content: "Item não encontrado ou já travado.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (mode === "system") {
        if (entry.kind === "item") {
          const modal = new ModalBuilder()
            .setCustomId(`market_sell_systemamount_${ownerId}_${entry.kind}_${entry.itemId}`)
            .setTitle("Venda Instantânea (Sistema)")
            .addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("amount")
                .setLabel(`Quantidade (Máximo: ${entry.available || 1})`)
                .setStyle(TextInputStyle.Short)
                .setValue("1")
                .setRequired(true)
            ));
          await interaction.showModal(modal);
          return true;
        }

        const result = systemSell(ownerId, entry);
        await interaction.update({ content: result.ok ? `✅ Venda instantânea concluída por **${formatCoins(result.price)} NC**.` : `❌ ${result.reason}`, embeds: [], components: [] });
        return true;
      }

      const modal = new ModalBuilder()
        .setCustomId(`market_sell_price_${ownerId}_${entry.kind}_${entry.kind === "weapon" ? entry.instanceId : entry.itemId}`)
        .setTitle("Definir venda")
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("price")
            .setLabel(`Preço (Sugerido: ${getSuggestedPrice(entry)} NC)`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ));

      if (entry.kind === "item") {
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("amount")
            .setLabel(`Quantidade (Máximo: ${entry.available || 1})`)
            .setStyle(TextInputStyle.Short)
            .setValue("1")
            .setRequired(true)
        ));
      }
      
      await interaction.showModal(modal);
      return true;
    }

    const ownerId = ownerFromCustomId(interaction.customId);
    if (
      interaction.user.id !== ownerId &&
      !interaction.customId.startsWith("market_confirm_buy_") &&
      !interaction.customId.startsWith("market_confirm_trade_") &&
      !interaction.customId.startsWith("market_reject_trade_")
    ) {
      await interaction.reply({ content: "❌ Esta Bolsa foi aberta por outro jogador. Use `!bolsa` para abrir a sua.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (interaction.customId.startsWith("market_confirm_buy_")) {
      const orderId = interaction.customId.split("_").slice(4).join("_");
      const result = buyOrder(interaction.user.id, orderId);
      await interaction.update({ content: result.ok ? `✅ Compra concluída: **${describeEntry(result.order.entry)}**.` : `❌ ${result.reason}`, components: [] });
      return true;
    }

    if (interaction.customId.startsWith("market_confirm_trade_")) {
      const tradeId = interaction.customId.split("_").slice(3).join("_");
      const result = acceptTrade(interaction.user.id, tradeId);
      await interaction.update({ content: result.ok ? `✅ Trade aceito: **${describeEntry(result.trade.entry)}** por **${formatCoins(result.trade.price)} NC**.` : `❌ ${result.reason}`, components: [] });
      return true;
    }

    if (interaction.customId.startsWith("market_reject_trade_")) {
      const tradeId = interaction.customId.split("_").slice(3).join("_");
      const result = rejectTrade(interaction.user.id, tradeId);
      await interaction.update({ content: result.ok ? "❌ Trade recusado/cancelado. O item voltou ao dono." : `❌ ${result.reason}`, components: [] });
      return true;
    }

    if (interaction.customId.startsWith("market_home_")) return handleMarketCommand({ user: interaction.user, update: (payload) => interaction.update(payload) });
    if (interaction.customId.startsWith("market_sell_")) return showSell(interaction, ownerId);
    if (interaction.customId.startsWith("market_buy_")) return showBuy(interaction, ownerId);
    if (interaction.customId.startsWith("market_trade_")) return showTrade(interaction, ownerId);
    if (interaction.customId.startsWith("market_history_")) return showHistory(interaction, ownerId);
    if (interaction.customId.startsWith("market_myorders_")) return showMyOrders(interaction, ownerId);
    
    if (interaction.customId.startsWith("market_shop_")) {
      const { handleBoostCommand } = require("./boosts");
      return handleBoostCommand({ user: interaction.user, update: (payload) => interaction.update(payload) });
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("market_sell_pick_")) {
    const ownerId = interaction.customId.split("_")[3];
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "❌ Esta Bolsa foi aberta por outro jogador.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const entry = sellableEntries(ownerId)[Number(interaction.values[0])];
    if (!entry) {
      await interaction.reply({ content: "Item inválido.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const ref = entry.kind === "weapon" ? entry.instanceId : entry.itemId;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`market_sell_order_${ownerId}_${entry.kind}_${ref}`).setLabel("Criar Ordem").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`market_sell_system_${ownerId}_${entry.kind}_${ref}`).setLabel("Venda Instantânea").setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder()
      .setColor("#F59E0B")
      .setTitle(`📤 Vender ${entry.label}`)
      .setDescription(`Preço médio na Bolsa: **${formatCoins(getSuggestedPrice(entry))} NC**\n\nEscolha como deseja vender o seu item:`)
      .addFields(
        { 
          name: "🛒 Criar Ordem (Bolsa de Valores)", 
          value: "Você escolhe o preço e o item fica na Bolsa aguardando outro jogador comprar. O lucro é maior, mas pode demorar."
        },
        { 
          name: "⚡ Venda Instantânea (Sistema)", 
          value: `Venda agora mesmo para o Bot e receba o dinheiro na hora! Porém, o Bot compra por apenas **55%** do valor sugerido (aprox. **${formatCoins(Math.floor(getSuggestedPrice(entry) * (marketConfig.systemSellPercent || 0.55)))} NC**).` 
        }
      );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("market_cancel_pick_")) {
    const ownerId = interaction.customId.split("_")[3];
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "❌ Esta Bolsa foi aberta por outro jogador.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const orderId = interaction.values[0];
    const result = cancelOrder(ownerId, orderId);
    if (!result.ok) {
      await interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: `✅ Ordem cancelada! O item voltou para o seu inventário.`, flags: MessageFlags.Ephemeral });
      // update the current message UI to remove the order from the list
      return showMyOrders({ update: (p) => interaction.message.edit(p) }, ownerId);
    }
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("market_buy_pick_")) {
    const orderId = interaction.values[0];
    const order = getActiveOrders().find((item) => item.id === orderId);
    if (!order) {
      await interaction.reply({ content: "Ordem não encontrada.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`market_confirm_buy_${interaction.user.id}_${orderId}`).setLabel("Confirmar Compra").setStyle(ButtonStyle.Success)
    );
    await interaction.reply({ content: `Confirmar compra de **${describeEntry(order.entry)}** por **${formatCoins(order.price)} NC**?`, components: [row], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("market_trade_pick_")) {
    const ownerId = interaction.customId.split("_")[3];
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "❌ Esta Bolsa foi aberta por outro jogador.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const entry = sellableEntries(ownerId)[Number(interaction.values[0])];
    if (!entry) {
      await interaction.reply({ content: "Item inválido.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const ref = entry.kind === "weapon" ? entry.instanceId : entry.itemId;
    const modal = new ModalBuilder()
      .setCustomId(`market_trade_offer_${ownerId}_${entry.kind}_${ref}`)
      .setTitle("Propor trade")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("targetId")
            .setLabel("ID do usuário que receberá a oferta")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("price")
            .setLabel("Preço em Nanacoins")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("market_sell_price_")) {
    const parts = interaction.customId.split("_");
    const ownerId = parts[3];
    const kind = parts[4];
    const ref = parts.slice(5).join("_");
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "❌ Esta Bolsa foi aberta por outro jogador.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const rawPrice = interaction.fields.getTextInputValue("price").trim();
    const price = Number(rawPrice);
    if (!isPositiveInteger(price)) {
      await interaction.reply({ content: "Preço inválido.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const entry = sellableEntries(ownerId).find((item) => kind === "weapon" ? item.instanceId === ref : item.itemId === ref);
    if (!entry) {
      await interaction.reply({ content: "Item não encontrado.", flags: MessageFlags.Ephemeral });
      return true;
    }
    
    let amountToSell = 1;
    if (kind === "item") {
      try {
        amountToSell = Number(interaction.fields.getTextInputValue("amount").trim());
      } catch(e) {}
      if (!isPositiveInteger(amountToSell) || amountToSell > (entry.available || 1)) {
        await interaction.reply({ content: "Quantidade inválida.", flags: MessageFlags.Ephemeral });
        return true;
      }
      entry.amount = amountToSell;
    }

    const result = createOrder(ownerId, entry, price);
    const feePercent = marketConfig.marketFeePercent || 0.05;
    const fee = Math.floor(price * feePercent);
    await interaction.reply({
      content: result.ok
        ? `✅ Ordem criada: \`${result.order.id}\`\nPreço: **${formatCoins(price)} NC**\nTaxa da Bolsa: **${formatCoins(fee)} NC**\nVocê receberá: **${formatCoins(price - fee)} NC**`
        : `❌ ${result.reason}`,
      flags: MessageFlags.Ephemeral
    });

    if (result.ok) {
      const suggested = getSuggestedPrice(entry);
      // Se o preço estiver abaixo do mercado e for uma quantia razoável, faz o anúncio
      if (suggested > 0 && price < suggested) {
        const channel = interaction.client.channels.cache.get(interaction.channelId);
        if (channel) {
          channel.send(`🚨 **OFERTA NA BOLSA!**\n<@${ownerId}> acabou de listar **${describeEntry(entry)}** por **${formatCoins(price)} NC**!\n*(Isto está abaixo do valor de mercado estimado de ${formatCoins(suggested)} NC)*\n\n🛒 Confira em \`!bolsa\` para comprar antes que acabe!`);
        }
      }
    }

    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("market_sell_systemamount_")) {
    const parts = interaction.customId.split("_");
    const ownerId = parts[3];
    const kind = parts[4];
    const ref = parts.slice(5).join("_");
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "❌ Esta Bolsa foi aberta por outro jogador.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const entry = sellableEntries(ownerId).find((item) => item.itemId === ref);
    if (!entry) {
      await interaction.reply({ content: "Item não encontrado.", flags: MessageFlags.Ephemeral });
      return true;
    }
    
    let amountToSell = 1;
    try {
      amountToSell = Number(interaction.fields.getTextInputValue("amount").trim());
    } catch(e) {}
    
    if (!isPositiveInteger(amountToSell) || amountToSell > (entry.available || 1)) {
      await interaction.reply({ content: "Quantidade inválida.", flags: MessageFlags.Ephemeral });
      return true;
    }
    
    entry.amount = amountToSell;
    
    const result = systemSell(ownerId, entry);
    await interaction.reply({ content: result.ok ? `✅ Venda instantânea de ${amountToSell}x ${entry.itemId} concluída por **${formatCoins(result.price)} NC**.` : `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("market_trade_offer_")) {
    const parts = interaction.customId.split("_");
    const ownerId = parts[3];
    const kind = parts[4];
    const ref = parts.slice(5).join("_");
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "❌ Esta Bolsa foi aberta por outro jogador.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const targetId = interaction.fields.getTextInputValue("targetId").trim();
    const price = parseInt(interaction.fields.getTextInputValue("price"), 10);
    if (!targetId || targetId === ownerId) {
      await interaction.reply({ content: "Usuário alvo inválido.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!Number.isFinite(price) || price < 0) {
      await interaction.reply({ content: "Preço inválido.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const entry = sellableEntries(ownerId).find((item) => kind === "weapon" ? item.instanceId === ref : item.itemId === ref);
    const result = entry ? createTrade({ proposerId: ownerId, targetId, entry, price }) : { ok: false, reason: "Item não encontrado." };
    if (!result.ok) {
      await interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
      return true;
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`market_confirm_trade_${result.trade.id}`).setLabel("Aceitar Trade").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`market_reject_trade_${result.trade.id}`).setLabel("Recusar").setStyle(ButtonStyle.Danger)
    );
    await interaction.reply({ content: `✅ Trade criado para <@${targetId}>.`, flags: MessageFlags.Ephemeral });
    await interaction.channel.send({
      content: `<@${targetId}> recebeu uma oferta de trade de <@${ownerId}>: **${describeEntry(result.trade.entry)}** por **${formatCoins(price)} NC**.`,
      components: [row]
    });
    return true;
  }

  return false;
}

module.exports = {
  handleMarketCommand,
  handleMarketInteraction,
  createOrder,
  buyOrder,
  createTrade,
  acceptTrade,
  rejectTrade,
  systemSell,
  getSuggestedPrice,
  getActiveOrders,
  sellableEntries,
  cancelOrder,
  showMyOrders,
  __setDbForTests(nextDb) {
    db = JSON.parse(JSON.stringify(nextDb));
  },
  __getDbForTests() {
    return JSON.parse(JSON.stringify(db));
  },
  __disableSavingForTests(value = true) {
    disableSavingForTests = value;
  }
};
