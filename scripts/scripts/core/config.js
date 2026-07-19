const fs = require("fs");
const path = require("path");
const { readJsonFile } = require("./storage");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
require("dotenv").config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

function getEnvNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function getEnvBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function getEnvString(name, fallback) {
  return process.env[name] || fallback;
}

function getEnvList(name) {
  return getEnvString(name, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

const DATA_DIR = path.resolve(ROOT_DIR, getEnvString("DATA_DIR", "data"));
ensureDir(DATA_DIR);

const GIFS_PATH = path.resolve(ROOT_DIR, getEnvString("GIFS_PATH", path.join("data", "gifs.json")));
const FOFOCAS_PATH = path.resolve(ROOT_DIR, getEnvString("FOFOCAS_PATH", path.join("data", "fofocas.json")));
const ECONOMIA_PATH = path.resolve(ROOT_DIR, getEnvString("ECONOMIA_PATH", path.join("data", "economia.json")));
const TIMERS_PATH = path.resolve(ROOT_DIR, getEnvString("TIMERS_PATH", path.join("data", "timers.json")));
ensureDir(path.dirname(GIFS_PATH));
ensureDir(path.dirname(FOFOCAS_PATH));
ensureDir(path.dirname(ECONOMIA_PATH));
ensureDir(path.dirname(TIMERS_PATH));

const STATIC_CONFIG_DIR = path.resolve(ROOT_DIR, getEnvString("STATIC_CONFIG_DIR", path.join("data", "config")));
const STATIC_GAMES_DIR = path.resolve(ROOT_DIR, getEnvString("STATIC_GAMES_DIR", path.join("data", "games")));
ensureDir(STATIC_CONFIG_DIR);
ensureDir(STATIC_GAMES_DIR);

const staticData = {
  app: readJsonFile(path.join(STATIC_CONFIG_DIR, "app.json"), {}),
  shop: readJsonFile(path.join(STATIC_CONFIG_DIR, "shop.json"), { boosts: {}, menuOrder: [] }),
  weapons: readJsonFile(path.join(STATIC_CONFIG_DIR, "weapons.json"), { rarities: {}, classes: {}, weapons: {} }),
  games: {
    forca: readJsonFile(path.join(STATIC_GAMES_DIR, "forca.json"), { themes: {}, promptHints: {}, themeContext: {} }),
    trivia: readJsonFile(path.join(STATIC_GAMES_DIR, "trivia.json"), { themes: {}, difficulties: {}, questions: {} }),
    improviso: readJsonFile(path.join(STATIC_GAMES_DIR, "improviso.json"), { scenarios: [] }),
    lootboxes: readJsonFile(path.join(STATIC_GAMES_DIR, "lootboxes.json"), { boxes: {} })
  }
};

const config = {
  ROOT_DIR,
  DATA_DIR,
  GIFS_PATH,
  FOFOCAS_PATH,
  ECONOMIA_PATH,
  TIMERS_PATH,
  DEFAULT_GIF_URL: getEnvString("DEFAULT_GIF_URL", "https://media.tenor.com/Z4cOQWc-DscAAAAC/banana.gif"),
  POLITICAS_PATH: path.resolve(ROOT_DIR, getEnvString("POLITICAS_PATH", path.join("data", "policies", "politicas.txt"))),
  POLITICAS_IMAGEM_PATH: path.resolve(ROOT_DIR, getEnvString("POLITICAS_IMAGEM_PATH", path.join("data", "policies", "politicas_imagem.txt"))),

  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  SERVIDOR_FOFOCA: process.env.SERVIDOR_FOFOCA,
  SUPERADMIN_IDS: getEnvList("SUPERADMIN_IDS"),



  AI_PROVIDER: getEnvString("AI_PROVIDER", process.env.OPENAI_API_KEY ? "openai" : getEnvString("QUESTION_PROVIDER", "gemini_cli")).toLowerCase(),
  QUESTION_PROVIDER: getEnvString("QUESTION_PROVIDER", process.env.OPENAI_API_KEY ? "openai" : "gemini_cli").toLowerCase(),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: getEnvString("OPENAI_MODEL", "gpt-4.1-mini"),
  OPENAI_TIMEOUT_MS: getEnvNumber("OPENAI_TIMEOUT_MS", 60_000),
  OPENAI_MAX_OUTPUT_TOKENS: getEnvNumber("OPENAI_MAX_OUTPUT_TOKENS", 700),
  GEMINI_CLI_MODEL: getEnvString("GEMINI_CLI_MODEL", "auto").toLowerCase(),
  GEMINI_CLI_TIMEOUT_MS: getEnvNumber("GEMINI_CLI_TIMEOUT_MS", 120_000),

  FORGE_HOST: getEnvString("FORGE_HOST", "http://127.0.0.1:7860"),
  FORGE_REALISTIC_MODEL: getEnvString("FORGE_REALISTIC_MODEL", "DreamShaper_8_pruned.safetensors"),
  FORGE_ANIME_MODEL: getEnvString("FORGE_ANIME_MODEL", "MeinaMix_V11.safetensors"),
  FORGE_STEPS: getEnvNumber("FORGE_STEPS", 25),
  FORGE_WIDTH: getEnvNumber("FORGE_WIDTH", 512),
  FORGE_HEIGHT: getEnvNumber("FORGE_HEIGHT", 512),
  FORGE_CFG_SCALE: getEnvNumber("FORGE_CFG_SCALE", 6.5),
  FORGE_SAMPLER: getEnvString("FORGE_SAMPLER", "Euler a"),
  FORGE_BATCH_SIZE: getEnvNumber("FORGE_BATCH_SIZE", 1),
  FORGE_REALISTIC_NEGATIVE_PROMPT: getEnvString("FORGE_REALISTIC_NEGATIVE_PROMPT", "ugly, low quality, bad anatomy, deformed, watermark, text, extra fingers, mutated hands, poorly drawn, blurry, artifacts, cluttered background, messy composition, incoherent, abstract, unreadable subject, duplicate subject"),
  FORGE_ANIME_NEGATIVE_PROMPT: getEnvString("FORGE_ANIME_NEGATIVE_PROMPT", "ugly, low quality, bad anatomy, deformed, poorly drawn face, poorly drawn hands, missing fingers, missing limbs, cluttered background, messy composition, watermark, text, blurry, incoherent, abstract, unreadable subject, duplicate subject"),

  VIDEO_JOB_ENABLED: getEnvBoolean("VIDEO_JOB_ENABLED", false),
  VIDEO_PROVIDER_URL: getEnvString("VIDEO_PROVIDER_URL", "https://api.cobalt.tools/api/json"),
  VIDEO_PROVIDER_RETRIES: getEnvNumber("VIDEO_PROVIDER_RETRIES", 1),
  VIDEO_INTERVAL_MS: getEnvNumber("VIDEO_INTERVAL_MS", 3_600_000),
  VIDEO_INITIAL_DELAY_MS: getEnvNumber("VIDEO_INITIAL_DELAY_MS", 3_600_000),
  VIDEO_JITTER_MS: getEnvNumber("VIDEO_JITTER_MS", 300_000),
  VIDEO_CHANNEL_SEND_DELAY_MS: getEnvNumber("VIDEO_CHANNEL_SEND_DELAY_MS", 1500),
  VIDEO_API_TIMEOUT_MS: getEnvNumber("VIDEO_API_TIMEOUT_MS", 15_000),
  VIDEO_DOWNLOAD_TIMEOUT_MS: getEnvNumber("VIDEO_DOWNLOAD_TIMEOUT_MS", 60_000),
  MAX_VIDEO_BYTES: getEnvNumber("MAX_VIDEO_BYTES", 25 * 1024 * 1024),
  DISCORD_UPLOAD_MAX_BYTES: getEnvNumber("DISCORD_UPLOAD_MAX_BYTES", Math.min(getEnvNumber("MAX_VIDEO_BYTES", 25 * 1024 * 1024), 10 * 1024 * 1024)),
  VIDEO_MAX_FAILURES: getEnvNumber("VIDEO_MAX_FAILURES", 5),
  VIDEO_RECENT_HISTORY_LIMIT: getEnvNumber("VIDEO_RECENT_HISTORY_LIMIT", 3),
  VIDEO_HISTORY_LIMIT: getEnvNumber("VIDEO_HISTORY_LIMIT", 50),
  VIDEO_CHANNEL_IDS: getEnvList("VIDEO_CHANNEL_IDS"),

  EDGE_TTS_VOICE: getEnvString("EDGE_TTS_VOICE", "pt-BR-AntonioNeural"),
  GOOGLE_TTS_LANGUAGE_CODE: getEnvString("GOOGLE_TTS_LANGUAGE_CODE", "pt-BR"),
  GOOGLE_TTS_VOICE: getEnvString("GOOGLE_TTS_VOICE", "pt-BR-Wavenet-A"),
  VOICE_IDLE_TIMEOUT_MS: getEnvNumber("VOICE_IDLE_TIMEOUT_MS", 300_000),

  CHANCE_RESPONDER_PERGUNTA: getEnvNumber("CHANCE_RESPONDER_PERGUNTA", 0.12),
  CHANCE_RESPONDER_CASUAL: getEnvNumber("CHANCE_RESPONDER_CASUAL", 0.003),
  CHANCE_RESPONDER_MIDIA: getEnvNumber("CHANCE_RESPONDER_MIDIA", 0.10),
  COOLDOWN_USUARIO_MS: getEnvNumber("COOLDOWN_USUARIO_MS", 120_000),
  COOLDOWN_CANAL_MS: getEnvNumber("COOLDOWN_CANAL_MS", 60_000),
  CHAT_CACHE_LIMIT: getEnvNumber("CHAT_CACHE_LIMIT", 100),
  CONTEXT_HISTORY_LIMIT: getEnvNumber("CONTEXT_HISTORY_LIMIT", 6),
  FOFOCA_MIN_MESSAGES: getEnvNumber("FOFOCA_MIN_MESSAGES", 50),
  FOFOCA_MAX_ITEMS: getEnvNumber("FOFOCA_MAX_ITEMS", 30),
  GIF_COOLDOWN_MS: getEnvNumber("GIF_COOLDOWN_MS", 180_000),
  TEMP_ERROR_DELETE_MS: getEnvNumber("TEMP_ERROR_DELETE_MS", 5_000)
};

config.paths = {
  root: ROOT_DIR,
  data: DATA_DIR,
  staticConfig: STATIC_CONFIG_DIR,
  staticGames: STATIC_GAMES_DIR,
  gifs: GIFS_PATH,
  fofocas: FOFOCAS_PATH,
  economia: ECONOMIA_PATH,
  timers: TIMERS_PATH,
  inventory: path.resolve(DATA_DIR, "inventory.json"),
  market: path.resolve(DATA_DIR, "market.json"),
  triviaHistory: path.resolve(DATA_DIR, "triviaHistory.json"),
  videos: path.resolve(ROOT_DIR, getEnvString("VIDEOS_PATH", path.join("data", "videos.json"))),
  videoHistory: path.resolve(ROOT_DIR, getEnvString("VIDEO_HISTORY_PATH", path.join("data", "videoHistory.json"))),
  videoTmp: path.resolve(ROOT_DIR, getEnvString("VIDEO_TMP_DIR", path.join("data", "tmp", "videos")))
};

const staticVideoChannelIds = Array.isArray(staticData.app.videoChannels) ? staticData.app.videoChannels : [];
config.VIDEO_CHANNEL_IDS = config.VIDEO_CHANNEL_IDS.length > 0 ? config.VIDEO_CHANNEL_IDS : staticVideoChannelIds;

config.env = {
  discordToken: config.DISCORD_TOKEN,
  servidorFofoca: config.SERVIDOR_FOFOCA,
  superAdminIds: config.SUPERADMIN_IDS,

  forge: {
    host: config.FORGE_HOST,
    realisticModel: config.FORGE_REALISTIC_MODEL,
    animeModel: config.FORGE_ANIME_MODEL
  },
  videos: {
    enabled: config.VIDEO_JOB_ENABLED,
    channels: config.VIDEO_CHANNEL_IDS,
    maxBytes: config.MAX_VIDEO_BYTES
  }
};

config.static = staticData;

module.exports = config;
