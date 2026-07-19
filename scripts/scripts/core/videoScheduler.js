const fs = require("fs");
const { AttachmentBuilder } = require("discord.js");
const config = require("./config");
const { resolveAndDownloadVideo } = require("./videoFetcher");
const {
  getNextVideo,
  markVideoSent,
  recordVideoFailure
} = require("./videoStore");

let videoJobRunning = false;
let videoJobTimer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDelay(baseDelay = config.VIDEO_INTERVAL_MS, jitterMs = config.VIDEO_JITTER_MS) {
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  return baseDelay + jitter;
}

function isUploadTooLargeError(err) {
  const message = `${err?.message || ""} ${err?.rawError?.message || ""}`;
  return err?.code === 40005 || /request entity too large|payload too large|file.*large/i.test(message);
}

async function resolveVideoChannels(client, channelIds = config.VIDEO_CHANNEL_IDS) {
  const channels = [];
  for (const channelId of channelIds) {
    try {
      const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId);
      if (channel?.send) channels.push(channel);
      else console.warn(`[videos] canal inválido ou sem send(): ${channelId}`);
    } catch (err) {
      console.warn(`[videos] não consegui carregar canal ${channelId}: ${err.message}`);
    }
  }
  return channels;
}

async function sendVideoToChannels(channels, video, filePath, bytes, options = {}) {
  const sentChannelIds = [];
  let failedReason = null;
  const delayMs = options.channelDelayMs ?? config.VIDEO_CHANNEL_SEND_DELAY_MS;
  for (const channel of channels) {
    try {
      const attachment = new AttachmentBuilder(filePath, {
        name: `${video.id || "video"}.mp4`
      });
      const sentMessage = await channel.send({ files: [attachment] });
      sentChannelIds.push(channel.id);
      if (options.onSentMessage && sentMessage) {
        await options.onSentMessage(sentMessage, { channel, video, bytes });
      }
      if (delayMs > 0) await sleep(delayMs);
    } catch (err) {
      if (isUploadTooLargeError(err)) failedReason = "upload_too_large";
      console.warn(`[videos] falha ao enviar ${video.id} no canal ${channel.id}: ${err.message}`);
    }
  }

  return { sentChannelIds, bytes, failedReason };
}

async function runVideoJob(client, options = {}) {
  let channels = Array.isArray(options.channels) ? options.channels.filter((channel) => channel?.send) : null;
  if (!channels) {
    const channelIds = options.channelIds || config.VIDEO_CHANNEL_IDS;
    if (!Array.isArray(channelIds) || channelIds.length === 0) {
      console.warn("[videos] nenhum canal configurado em VIDEO_CHANNEL_IDS ou data/config/app.json.videoChannels.");
      return { ok: false, reason: "no_channels" };
    }
    channels = await resolveVideoChannels(client, channelIds);
  }

  if (channels.length === 0) {
    return { ok: false, reason: "no_valid_channels" };
  }

  const video = getNextVideo(options.storeOptions || {});
  if (!video) {
    console.warn("[videos] nenhum vídeo ativo disponível.");
    return { ok: false, reason: "no_videos" };
  }

  let downloaded = null;
  try {
    downloaded = await (options.resolveAndDownload || resolveAndDownloadVideo)(video, options.fetchOptions || {});
    const sent = await sendVideoToChannels(channels, video, downloaded.filePath, downloaded.bytes, options);

    if (sent.sentChannelIds.length > 0) {
      markVideoSent(video.id, {
        channelIds: sent.sentChannelIds,
        bytes: downloaded.bytes,
        title: video.title
      }, options.storeOptions || {});
      console.log(`[videos] enviado ${video.id} para ${sent.sentChannelIds.length} canal(is).`);
      return { ok: true, videoId: video.id, channelIds: sent.sentChannelIds };
    }

    console.warn(`[videos] ${video.id} baixado, mas nenhum envio foi aceito pelo Discord.`);
    return { ok: false, reason: sent.failedReason || "send_failed", videoId: video.id };
  } catch (err) {
    recordVideoFailure(video.id, err.message, options.storeOptions || {});
    console.warn(`[videos] falha em ${video.id}: ${err.message}`);
    return { ok: false, reason: "video_failed", videoId: video.id, error: err };
  } finally {
    if (downloaded?.filePath) {
      await fs.promises.unlink(downloaded.filePath).catch(() => {});
    }
  }
}

async function runVideoJobOnce(client, options = {}) {
  if (videoJobRunning) {
    return { ok: false, reason: "already_running" };
  }

  videoJobRunning = true;
  try {
    return await (options.runJob || runVideoJob)(client, options);
  } catch (err) {
    console.warn("[videos] ciclo manual falhou:", err.message);
    return { ok: false, reason: "job_error", error: err };
  } finally {
    videoJobRunning = false;
  }
}

function scheduleNextVideoJob(client, delayMs = nextDelay(), options = {}) {
  if (videoJobTimer) clearTimeout(videoJobTimer);
  videoJobTimer = setTimeout(() => {
    runVideoJobSafe(client, options).catch((err) => {
      console.warn("[videos] ciclo falhou:", err.message);
    });
  }, delayMs);
  videoJobTimer.unref?.();
  return videoJobTimer;
}

async function runVideoJobSafe(client, options = {}) {
  if (videoJobRunning) return false;
  videoJobRunning = true;

  try {
    await (options.runJob || runVideoJob)(client, options);
    return true;
  } catch (err) {
    console.warn("[videos] ciclo falhou:", err.message);
    return false;
  } finally {
    videoJobRunning = false;
    if (options.scheduleNext !== false) {
      scheduleNextVideoJob(client, nextDelay(options.intervalMs, options.jitterMs), options);
    }
  }
}

function startVideoScheduler(client, options = {}) {
  const enabled = options.enabled ?? config.VIDEO_JOB_ENABLED;
  if (!enabled) {
    console.log("[videos] envio automático desativado.");
    return null;
  }

  const initialDelay = options.initialDelayMs ?? config.VIDEO_INITIAL_DELAY_MS;
  console.log(`[videos] envio automático ativado. Primeiro ciclo em ${Math.round(initialDelay / 60000)} min.`);
  return scheduleNextVideoJob(client, initialDelay, options);
}

function stopVideoScheduler() {
  if (videoJobTimer) {
    clearTimeout(videoJobTimer);
    videoJobTimer = null;
  }
}

module.exports = {
  startVideoScheduler,
  stopVideoScheduler,
  runVideoJob,
  runVideoJobOnce,
  runVideoJobSafe,
  scheduleNextVideoJob,
  resolveVideoChannels,
  sendVideoToChannels,
  nextDelay
};
