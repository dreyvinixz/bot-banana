const fs = require("fs");
const path = require("path");
const config = require("../core/config");
const { createDebouncedJsonWriter, writeJsonFileSync } = require("../core/storage");

const LEDGER_PATH = path.join(process.cwd(), "data", "economy", "ledger.json");
const MAX_EVENTS = 10000;

let ledger = [];
let disableSavingForTests = false;

function loadLedger() {
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      const loaded = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf-8"));
      ledger = Array.isArray(loaded) ? loaded : [];
    } else {
      ledger = [];
      writeJsonFileSync(LEDGER_PATH, ledger);
    }
  } catch (err) {
    console.error("Erro ao carregar o ledger econômico:", err);
    ledger = [];
  }
}

const saveLedger = createDebouncedJsonWriter(LEDGER_PATH, () => ledger, config.static.app.timers?.saveDebounceMs || 2000);

function recordLedgerEvent(type, data) {
  if (!type || typeof type !== "string") {
    return null;
  }

  const event = {
    type,
    ...(data && typeof data === "object" ? data : {}),
    createdAt: Date.now()
  };

  ledger.push(event);

  if (ledger.length > MAX_EVENTS) {
    ledger = ledger.slice(ledger.length - MAX_EVENTS);
  }

  if (!disableSavingForTests) saveLedger();
  return event;
}

function getRecentEvents(limit = 50) {
  return ledger.slice(-limit);
}

function readLedger() {
  return JSON.parse(JSON.stringify(ledger));
}

loadLedger();

module.exports = {
  recordLedgerEvent,
  getRecentEvents,
  readLedger,
  __setLedgerForTests(nextLedger) {
    ledger = Array.isArray(nextLedger) ? JSON.parse(JSON.stringify(nextLedger)) : [];
  },
  __getLedgerForTests() {
    return JSON.parse(JSON.stringify(ledger));
  },
  __disableSavingForTests(value = true) {
    disableSavingForTests = value;
  }
};
