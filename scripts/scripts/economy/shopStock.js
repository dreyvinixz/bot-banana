const fs = require("fs");
const path = require("path");
const config = require("../core/config");
const { createDebouncedJsonWriter, writeJsonFileSync } = require("../core/storage");

const STOCK_PATH = path.join(process.cwd(), "data", "economy", "shopStock.json");

let stock = { items: {} };
let disableSavingForTests = false;

function loadStock() {
  try {
    if (fs.existsSync(STOCK_PATH)) {
      const loaded = JSON.parse(fs.readFileSync(STOCK_PATH, "utf-8"));
      stock = loaded && typeof loaded === "object" && loaded.items ? loaded : { items: {} };
    } else {
      stock = { items: {} };
      writeJsonFileSync(STOCK_PATH, stock);
    }
  } catch (err) {
    console.error("Erro ao carregar o estoque da Loja:", err);
    stock = { items: {} };
  }
}

const saveStock = createDebouncedJsonWriter(STOCK_PATH, () => stock, config.static.app.timers?.saveDebounceMs || 2000);

function saveStockSync() {
  if (disableSavingForTests) return;
  writeJsonFileSync(STOCK_PATH, stock);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function getConfiguredTargetStock(itemId, fallback = 50) {
  const item = config.static.shop?.boosts?.[itemId];
  const configured = Number(item?.targetStock);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : fallback;
}

function initItemStock(itemId, targetStock = getConfiguredTargetStock(itemId)) {
  if (!stock.items[itemId]) {
    const safeTarget = Number.isFinite(targetStock) && targetStock > 0 ? Math.floor(targetStock) : 50;
    stock.items[itemId] = {
      stock: safeTarget,
      targetStock: safeTarget,
      lastUpdated: Date.now(),
      totalBoughtFromShop: 0,
      totalSoldToShop: 0
    };
    saveStockSync();
  }
}

function getItemStockInfo(itemId, defaultTarget = getConfiguredTargetStock(itemId)) {
  if (!stock.items[itemId]) {
    initItemStock(itemId, defaultTarget);
  }
  if (!Number.isFinite(stock.items[itemId].stock) || stock.items[itemId].stock < 0) {
    stock.items[itemId].stock = 0;
  }
  if (!Number.isFinite(stock.items[itemId].targetStock) || stock.items[itemId].targetStock <= 0) {
    stock.items[itemId].targetStock = getConfiguredTargetStock(itemId, defaultTarget);
  }
  return stock.items[itemId];
}

function addStock(itemId, amount, defaultTarget = getConfiguredTargetStock(itemId)) {
  if (!isPositiveInteger(amount)) return false;
  if (!stock.items[itemId]) initItemStock(itemId, defaultTarget);
  stock.items[itemId].stock += amount;
  stock.items[itemId].totalSoldToShop += amount;
  stock.items[itemId].lastUpdated = Date.now();
  saveStockSync();
  return true;
}

function removeStock(itemId, amount, defaultTarget = getConfiguredTargetStock(itemId)) {
  if (!isPositiveInteger(amount)) return false;
  if (!stock.items[itemId]) initItemStock(itemId, defaultTarget);
  stock.items[itemId].stock = Math.max(0, stock.items[itemId].stock - amount);
  stock.items[itemId].totalBoughtFromShop += amount;
  stock.items[itemId].lastUpdated = Date.now();
  saveStockSync();
  return true;
}

function getDynamicPrice(itemId, basePrice, minPrice, maxPrice) {
  const stockInfo = getItemStockInfo(itemId, getConfiguredTargetStock(itemId));
  const stockRatio = stockInfo.stock / stockInfo.targetStock;
  
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  
  const fatorEstoque = 1 + clamp((1 - stockRatio) * 0.35, -0.40, 0.60);
  
  const { getSuggestedPrice } = require('./market');
  const marketPrice = getSuggestedPrice({ itemId, kind: "item", itemKey: `item:${itemId}`, basePrice }) || basePrice;
  const fatorMercado = clamp(marketPrice / basePrice, 0.70, 1.80);
  
  return Math.floor(clamp(basePrice * fatorMercado * fatorEstoque, minPrice, maxPrice));
}

function getSystemSellPrice(itemId, basePrice, minPrice, maxPrice) {
  const dynPrice = getDynamicPrice(itemId, basePrice, minPrice, maxPrice);
  const stockInfo = getItemStockInfo(itemId, 50);
  
  let precoVendaSistema = Math.floor(dynPrice * 0.60);
  if (stockInfo.stock > stockInfo.targetStock) {
    const maxSale = Math.floor(basePrice * 0.50);
    if (precoVendaSistema > maxSale) precoVendaSistema = maxSale;
  }
  return precoVendaSistema;
}

function getShopStock(itemKey) {
  return getItemStockInfo(itemKey);
}

function increaseShopStock(itemKey, amount) {
  return addStock(itemKey, amount);
}

function decreaseShopStock(itemKey, amount) {
  return removeStock(itemKey, amount);
}

function getTargetStock(itemKey) {
  return getItemStockInfo(itemKey).targetStock;
}

loadStock();

module.exports = {
  getDynamicPrice,
  getDynamicShopPrice: getDynamicPrice,
  getSystemSellPrice,
  getItemStockInfo,
  getShopStock,
  increaseShopStock,
  decreaseShopStock,
  getTargetStock,
  addStock,
  removeStock,
  __setStockForTests(nextStock) {
    stock = nextStock && typeof nextStock === "object" ? JSON.parse(JSON.stringify(nextStock)) : { items: {} };
    if (!stock.items) stock.items = {};
  },
  __getStockForTests() {
    return JSON.parse(JSON.stringify(stock));
  },
  __disableSavingForTests(value = true) {
    disableSavingForTests = value;
  }
};
