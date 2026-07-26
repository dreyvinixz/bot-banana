const fs = require("fs");
const path = require("path");

const LOGS_DIR = path.join(process.cwd(), "logs");
const BOT_LOG_PATH = path.join(LOGS_DIR, "bot.log");
const ERROR_LOG_PATH = path.join(LOGS_DIR, "error.log");

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB — rotaciona ao ultrapassar

let _intercepted = false;
let _originalConsoleError = null;
let _originalConsoleWarn = null;

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function rotateIfNeeded(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_LOG_SIZE) return;

    const ext = path.extname(filePath);
    const base = filePath.slice(0, -ext.length);
    const rotated = `${base}_${new Date().toISOString().replace(/[:.]/g, "-")}${ext}`;
    fs.renameSync(filePath, rotated);
  } catch {
    // Falha silenciosa na rotação — não queremos causar erros no logger
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
    rotateIfNeeded(filePath);
    fs.appendFileSync(filePath, content, "utf-8");
  } catch (err) {
    // Usa o original se disponível para evitar recursão
    const errFn = _originalConsoleError || console.error;
    errFn("Erro ao escrever no arquivo de log:", err);
  }
}

function logInfo(context, message, details = null) {
  const entry = formatLogEntry("INFO", context, message, details);
  console.log(`ℹ️ [${context}] ${message}`);
  appendToFile(BOT_LOG_PATH, entry);
}

function logWarn(context, message, details = null) {
  const entry = formatLogEntry("WARN", context, message, details);
  // Usa o original para evitar recursão quando interceptado
  const warnFn = _originalConsoleWarn || console.warn;
  warnFn(`⚠️ [${context}] ${message}`);
  appendToFile(BOT_LOG_PATH, entry);
  appendToFile(ERROR_LOG_PATH, entry);
}

function logError(context, error, details = null) {
  const message = error?.message || String(error);
  const entry = formatLogEntry("ERROR", context, message, details, error);
  // Usa o original para evitar recursão quando interceptado
  const errFn = _originalConsoleError || console.error;
  errFn(`🔥 [${context}] ${message}`);
  appendToFile(BOT_LOG_PATH, entry);
  appendToFile(ERROR_LOG_PATH, entry);
}

/**
 * Serializa argumentos variádicos do console.error/warn em uma string legível.
 * Trata Error, objetos, e valores primitivos.
 */
function serializeArgs(args) {
  return args.map(arg => {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === "object" && arg !== null) {
      try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
    }
    return String(arg);
  }).join(" ");
}

/**
 * Extrai o primeiro Error dos argumentos, se existir.
 */
function extractError(args) {
  for (const arg of args) {
    if (arg instanceof Error) return arg;
  }
  return null;
}

/**
 * Intercepta console.error e console.warn globalmente.
 * Toda chamada a console.error em qualquer módulo será automaticamente
 * gravada em error.log com timestamp e stack trace.
 * O comportamento original (imprimir no terminal) é mantido.
 */
function interceptConsole() {
  if (_intercepted) return;
  _intercepted = true;

  _originalConsoleError = console.error;
  _originalConsoleWarn = console.warn;

  console.error = (...args) => {
    // Imprime normalmente no terminal
    _originalConsoleError.apply(console, args);

    // Grava no arquivo de log
    const text = serializeArgs(args);
    const error = extractError(args);
    const entry = formatLogEntry("ERROR", "CONSOLE", text, null, error instanceof Error ? null : null);
    // Se houver um Error, incluímos o stack diretamente na entry
    let fullEntry = entry;
    if (error && error.stack && !text.includes(error.stack)) {
      fullEntry = entry.trimEnd() + `\n  Stack: ${error.stack}\n`;
    }
    appendToFile(ERROR_LOG_PATH, fullEntry);
    appendToFile(BOT_LOG_PATH, fullEntry);
  };

  console.warn = (...args) => {
    _originalConsoleWarn.apply(console, args);

    const text = serializeArgs(args);
    const entry = formatLogEntry("WARN", "CONSOLE", text);
    appendToFile(BOT_LOG_PATH, entry);
    appendToFile(ERROR_LOG_PATH, entry);
  };
}

function setupGlobalErrorLogging() {
  process.on("uncaughtException", (error) => {
    logError("UNCAUGHT_EXCEPTION", error, { pid: process.pid });
  });

  process.on("unhandledRejection", (reason) => {
    logError("UNHANDLED_REJECTION", reason instanceof Error ? reason : new Error(String(reason)));
  });
}

/**
 * Restaura console.error/warn originais. Usado nos testes.
 */
function __restoreConsoleForTests() {
  if (_originalConsoleError) console.error = _originalConsoleError;
  if (_originalConsoleWarn) console.warn = _originalConsoleWarn;
  _intercepted = false;
  _originalConsoleError = null;
  _originalConsoleWarn = null;
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  interceptConsole,
  setupGlobalErrorLogging,
  LOGS_DIR,
  BOT_LOG_PATH,
  ERROR_LOG_PATH,
  __restoreConsoleForTests
};
