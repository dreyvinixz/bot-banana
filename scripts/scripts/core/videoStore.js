const config = require("./config");
const { readJsonFile, writeJsonFileSync } = require("./storage");

function normalizeVideo(entry, index = 0) {
  if (typeof entry === "string") {
    return {
      id: `video_${String(index + 1).padStart(3, "0")}`,
      url: entry,
      active: true,
      title: "",
      tags: [],
      lastSentAt: null,
      failures: 0
    };
  }

  return {
    ...entry,
    id: entry.id || `video_${String(index + 1).padStart(3, "0")}`,
    url: entry.url,
    active: entry.active !== false,
    title: entry.title || "",
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    lastSentAt: entry.lastSentAt || null,
    failures: Number.isInteger(entry.failures) ? entry.failures : 0,
    cachedDirectUrl: entry.cachedDirectUrl || null,
    cachedAt: entry.cachedAt || null
  };
}

function readVideos(options = {}) {
  const filePath = options.videosPath || config.paths.videos;
  const rawVideos = readJsonFile(filePath, []);
  if (!Array.isArray(rawVideos)) return [];
  return rawVideos
    .map((entry, index) => normalizeVideo(entry, index))
    .filter((entry) => entry.url);
}

function saveVideos(videos, options = {}) {
  writeJsonFileSync(options.videosPath || config.paths.videos, videos);
}

function nextVideoId(videos) {
  const maxNumber = videos.reduce((max, video) => {
    const match = String(video.id || "").match(/^video_(\d+)$/);
    const number = match ? Number(match[1]) : 0;
    return Number.isFinite(number) && number > max ? number : max;
  }, 0);
  return `video_${String(maxNumber + 1).padStart(3, "0")}`;
}

function addVideoUrl(url, meta = {}, options = {}) {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) return { added: false, video: null, reason: "invalid_url" };

  const videos = readVideos(options);
  const existing = videos.find((video) => video.url === normalizedUrl);
  if (existing) {
    return { added: false, video: existing, reason: "duplicate_url" };
  }

  const video = normalizeVideo({
    id: meta.id || nextVideoId(videos),
    url: normalizedUrl,
    active: meta.active !== false,
    title: meta.title || "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    lastSentAt: meta.lastSentAt || null,
    failures: 0,
    cachedDirectUrl: null,
    cachedAt: null,
    addedAt: meta.addedAt || Date.now(),
    addedBy: meta.addedBy || null,
    source: meta.source || "manual"
  }, videos.length);

  videos.push(video);
  saveVideos(videos, options);
  return { added: true, video };
}

function readHistory(options = {}) {
  const filePath = options.historyPath || config.paths.videoHistory;
  const history = readJsonFile(filePath, []);
  return Array.isArray(history) ? history : [];
}

function saveHistory(history, options = {}) {
  const limit = options.historyLimit || config.VIDEO_HISTORY_LIMIT;
  writeJsonFileSync(options.historyPath || config.paths.videoHistory, history.slice(-limit));
}

function selectVideo(videos, history, options = {}) {
  const maxFailures = options.maxFailures ?? config.VIDEO_MAX_FAILURES;
  const recentLimit = options.recentLimit ?? config.VIDEO_RECENT_HISTORY_LIMIT;
  const rng = options.rng || Math.random;

  const eligible = videos.filter((video) => video.active !== false && (video.failures || 0) < maxFailures);
  if (eligible.length === 0) return null;

  const recentIds = new Set(history.slice(-recentLimit).map((item) => item.videoId));
  const fresh = eligible.filter((video) => !recentIds.has(video.id));
  const pool = fresh.length > 0 ? fresh : eligible;
  return pool[Math.floor(rng() * pool.length)];
}

function updateVideo(videoId, updater, options = {}) {
  const videos = readVideos(options);
  const index = videos.findIndex((video) => video.id === videoId);
  if (index < 0) return null;
  videos[index] = updater({ ...videos[index] });
  saveVideos(videos, options);
  return videos[index];
}

function markVideoSent(videoId, meta = {}, options = {}) {
  const sentAt = meta.sentAt || Date.now();
  const updated = updateVideo(videoId, (video) => ({
    ...video,
    lastSentAt: sentAt,
    failures: 0
  }), options);

  const history = readHistory(options);
  history.push({
    videoId,
    sentAt,
    channelIds: meta.channelIds || [],
    bytes: meta.bytes || 0,
    title: meta.title || updated?.title || ""
  });
  saveHistory(history, options);
  return updated;
}

function recordVideoFailure(videoId, reason, options = {}) {
  const maxFailures = options.maxFailures ?? config.VIDEO_MAX_FAILURES;
  return updateVideo(videoId, (video) => {
    const failures = (video.failures || 0) + 1;
    return {
      ...video,
      failures,
      active: failures >= maxFailures ? false : video.active,
      lastFailureAt: Date.now(),
      lastFailureReason: String(reason || "unknown").slice(0, 300)
    };
  }, options);
}

function getNextVideo(options = {}) {
  const videos = readVideos(options);
  const history = readHistory(options);
  return selectVideo(videos, history, options);
}

module.exports = {
  normalizeVideo,
  readVideos,
  saveVideos,
  addVideoUrl,
  readHistory,
  saveHistory,
  selectVideo,
  getNextVideo,
  markVideoSent,
  recordVideoFailure
};
