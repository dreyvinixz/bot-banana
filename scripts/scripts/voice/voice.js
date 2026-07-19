const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require("@discordjs/voice");
const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../core/config");
const { generateSpeech } = require("./tts");

const voiceSessions = new Map();

function scheduleVoiceLeave(guildId) {
  const session = voiceSessions.get(guildId);
  if (!session) return;

  clearTimeout(session.leaveTimer);
  session.leaveTimer = setTimeout(() => {
    const current = voiceSessions.get(guildId);
    if (!current) return;

    const elapsedSinceUse = Date.now() - current.lastUsedAt;
    if (elapsedSinceUse < config.VOICE_IDLE_TIMEOUT_MS || current.player.state.status !== AudioPlayerStatus.Idle) {
      scheduleVoiceLeave(guildId);
      return;
    }

    current.connection.destroy();
    voiceSessions.delete(guildId);
    console.log(`👋 Saí do canal de voz por inatividade (${config.VOICE_IDLE_TIMEOUT_MS / 1000}s).`);
  }, config.VOICE_IDLE_TIMEOUT_MS);
}

function getVoiceSession(message) {
  const guildId = message.guild.id;
  const channelId = message.member.voice.channel.id;
  const existing = voiceSessions.get(guildId);

  if (existing && existing.channelId === channelId) {
    clearTimeout(existing.leaveTimer);
    existing.lastUsedAt = Date.now();
    return existing;
  }

  if (existing) {
    clearTimeout(existing.leaveTimer);
    existing.connection.destroy();
    voiceSessions.delete(guildId);
  }

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: message.guild.voiceAdapterCreator
  });
  const player = createAudioPlayer();
  connection.subscribe(player);

  const session = { channelId, connection, player, leaveTimer: null, lastUsedAt: Date.now() };
  voiceSessions.set(guildId, session);
  return session;
}

function markVoiceInUse(message) {
  const existing = voiceSessions.get(message.guild.id);
  if (!existing) return;

  clearTimeout(existing.leaveTimer);
  existing.lastUsedAt = Date.now();
}

async function handleVoiceCommand(message, texto) {
  if (!texto) {
    await message.delete();
    return message.channel.send("Digite algo para eu falar: `!voz Olá mundo`").then((msg) => {
      setTimeout(() => msg.delete(), config.TEMP_ERROR_DELETE_MS);
    });
  }

  if (!message.member.voice.channel) {
    return message.reply("❌ Você precisa estar em um canal de voz!");
  }

  markVoiceInUse(message);

  let tempDir = null;
  try {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bottts-voice-"));
    const filePath = path.join(tempDir, "voz.mp3");
    await message.delete().catch(() => null);
    const provider = await generateSpeech(texto, filePath);

    console.log(`▶️  Reproduzindo áudio no canal de voz (${provider})...`);

    const session = getVoiceSession(message);
    const resource = createAudioResource(filePath);
    session.player.play(resource);
    session.player.once(AudioPlayerStatus.Idle, async () => {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => null);
      scheduleVoiceLeave(message.guild.id);
    });
  } catch (err) {
    console.error("🔥 Erro ao gerar ou reproduzir a fala:", err);
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => null);
    }
    message.channel.send(`⚠️ Erro só na voz: ${err.message}`).then((msg) => {
      setTimeout(() => msg.delete(), config.TEMP_ERROR_DELETE_MS);
    });
  }
}

module.exports = {
  handleVoiceCommand
};
