const fs = require("fs");
const path = require("path");

const LOGS_DIR = path.join(process.cwd(), "logs");
const BOT_LOG_PATH = path.join(LOGS_DIR, "bot.log");
const ERROR_LOG_PATH = path.join(LOGS_DIR, "error.log");

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function formatLogEntry(level, context, message, details = null, error = null) {
  const timestamp = new Date().toISOString();
  let text = `[${timestamp}] [${level.toUpperCase()}] [${context || "GENERAL"}] ${message}`;

  if (details && typeof details === "object") {
    try {
      text += ` | Details: ${JSON.stringify(details)}`;
    } catch (e) {
      text += ` | Details: [Unserializable Object]`;
    }
  } else if (details) {
    text += ` | Details: ${details}`;
  }

  if (error) {
    if (error.stack) {
      text += `\n  Stack: ${error.stack}`;
    } else {
      text += `\n  Error: ${error.message || error}`;
    }
  }

  return text + "\n";
}

function appendToFile(filePath, content) {
  try {
    ensureLogsDir();
    fs.appendFileSync(filePath, content, "utf-8");
  } catch (err) {
    console.error("Erro ao escrever no arquivo de log:", err);
  }
}

function logInfo(context, message, details = null) {
  const entry = formatLogEntry("INFO", context, message, details);
  console.log(`ℹ️ [${context}] ${message}`);
  appendToFile(BOT_LOG_PATH, entry);
}

function logWarn(context, message, details = null) {
  const entry = formatLogEntry("WARN", context, message, details);
  console.warn(`⚠️ [${context}] ${message}`);
  appendToFile(BOT_LOG_PATH, entry);
  appendToFile(ERROR_LOG_PATH, entry);
}

function logError(context, error, details = null) {
  const message = error?.message || String(error);
  const entry = formatLogEntry("ERROR", context, message, details, error);
  console.error(`🔥 [${context}] ${message}`);
  appendToFile(BOT_LOG_PATH, entry);
  appendToFile(ERROR_LOG_PATH, entry);
}

function setupGlobalErrorLogging() {
  process.on("uncaughtException", (error) => {
    logError("UNCAUGHT_EXCEPTION", error, { pid: process.pid });
  });

  process.on("unhandledRejection", (reason) => {
    logError("UNHANDLED_REJECTION", reason instanceof Error ? reason : new Error(String(reason)));
  });
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  setupGlobalErrorLogging,
  LOGS_DIR,
  BOT_LOG_PATH,
  ERROR_LOG_PATH
};
