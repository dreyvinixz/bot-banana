const fs = require("fs");
const { once } = require("events");
const path = require("path");
const config = require("./config");
const { ensureDir } = require("./storage");
const { instagramGetUrl } = require("instagram-url-direct");

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

function assertHttpsUrl(rawUrl, label = "URL") {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label} inválida.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} precisa usar HTTPS.`);
  }
  return parsed;
}

function validateInstagramUrl(rawUrl) {
  const parsed = assertHttpsUrl(rawUrl, "URL do Instagram");
  if (!INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Apenas links do Instagram são aceitos para vídeos automáticos.");
  }
  return parsed.toString();
}

function sanitizeFilePart(value) {
  return String(value || "video")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "video";
}

function isMp4ContentType(contentType) {
  if (!contentType) return false;
  return contentType.split(";")[0].trim().toLowerCase() === "video/mp4";
}

function assertMp4Headers(headers, maxBytes, source = "arquivo") {
  const contentType = headers.get?.("content-type") || "";
  if (contentType && !isMp4ContentType(contentType)) {
    throw new Error(`${source} não é MP4. Content-Type: ${contentType}`);
  }

  const rawLength = headers.get?.("content-length");
  if (rawLength) {
    const length = Number(rawLength);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error(`${source} excede o limite de ${maxBytes} bytes.`);
    }
  }
}

async function fetchWithTimeout(url, options, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Timeout ao acessar ${new URL(url).origin}.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function extractDirectMp4Url(providerPayload) {
  if (!providerPayload || typeof providerPayload !== "object") return null;
  if (typeof providerPayload.url === "string") return providerPayload.url;

  const pickers = Array.isArray(providerPayload.picker) ? providerPayload.picker : [];
  const pickedVideo = pickers.find((item) => item?.type === "video" && typeof item.url === "string")
    || pickers.find((item) => typeof item?.url === "string");
  if (pickedVideo) return pickedVideo.url;

  const urls = Array.isArray(providerPayload.urls) ? providerPayload.urls : [];
  const pickedUrl = urls.find((item) => typeof item === "string");
  return pickedUrl || null;
}

async function resolveDirectMp4Url(instagramUrl, options = {}) {
  const sourceUrl = validateInstagramUrl(instagramUrl);
  const retries = Number.isInteger(options.retries) ? options.retries : config.VIDEO_PROVIDER_RETRIES;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (options.providerUrl) {
        const response = await fetchWithTimeout(options.providerUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: sourceUrl })
        }, options.providerTimeoutMs || config.VIDEO_PROVIDER_TIMEOUT_MS || config.VIDEO_DOWNLOAD_TIMEOUT_MS, options.fetchImpl || fetch);

        if (!response.ok) {
          throw new Error(`Provider respondeu status ${response.status}.`);
        }

        const payload = await response.json();
        const directUrl = extractDirectMp4Url(payload);
        if (!directUrl) throw new Error("Provider não retornou URL direta do MP4.");
        return assertHttpsUrl(directUrl, "URL direta do MP4").toString();
      }

      const payload = await instagramGetUrl(sourceUrl);
      
      if (!payload || !payload.url_list || payload.url_list.length === 0) {
        throw new Error("Provider não retornou URL direta do MP4.");
      }
      
      const directUrl = payload.url_list[0];
      return assertHttpsUrl(directUrl, "URL direta do MP4").toString();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Falha ao resolver URL direta do MP4.");
}

async function probeRemoteMp4(directUrl, options = {}) {
  try {
    const response = await fetchWithTimeout(directUrl, { method: "HEAD" }, options.downloadTimeoutMs || config.VIDEO_DOWNLOAD_TIMEOUT_MS, options.fetchImpl || fetch);
    if (response.ok) {
      assertMp4Headers(response.headers, options.maxBytes || config.MAX_VIDEO_BYTES, "MP4 remoto");
    }
  } catch (err) {
    if (/não é MP4|excede/.test(err.message)) throw err;
    console.warn("[videos] HEAD do MP4 falhou, validando no GET:", err.message);
  }
}

async function writeResponseBodyToFile(response, filePath, maxBytes) {
  const output = fs.createWriteStream(filePath, { flags: "wx" });
  let bytes = 0;

  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        throw new Error(`Download excedeu o limite de ${maxBytes} bytes.`);
      }
      if (!output.write(chunk)) {
        await once(output, "drain");
      }
    }

    output.end();
    await once(output, "finish");
    return bytes;
  } catch (err) {
    output.destroy();
    await once(output, "close").catch(() => {});
    await fs.promises.unlink(filePath).catch(() => {});
    throw err;
  }
}

async function downloadMp4ToTemp(directUrl, videoId, options = {}) {
  const maxBytes = options.maxBytes || config.MAX_VIDEO_BYTES;
  const tmpDir = options.tmpDir || config.paths.videoTmp;
  ensureDir(tmpDir);

  const response = await fetchWithTimeout(directUrl, {
    method: "GET",
    headers: { "Accept": "video/mp4" }
  }, options.downloadTimeoutMs || config.VIDEO_DOWNLOAD_TIMEOUT_MS, options.fetchImpl || fetch);

  if (!response.ok) {
    throw new Error(`Download do MP4 respondeu status ${response.status}.`);
  }
  assertMp4Headers(response.headers, maxBytes, "Download do MP4");
  if (!isMp4ContentType(response.headers.get?.("content-type"))) {
    throw new Error("Download do MP4 não informou Content-Type video/mp4.");
  }

  const fileName = `${sanitizeFilePart(videoId)}_${Date.now()}.mp4`;
  const filePath = path.join(tmpDir, fileName);
  const bytes = await writeResponseBodyToFile(response, filePath, maxBytes);
  return { filePath, bytes };
}

async function resolveAndDownloadVideo(video, options = {}) {
  if (!video?.url) throw new Error("Vídeo sem URL configurada.");
  const directUrl = await resolveDirectMp4Url(video.url, options);
  await probeRemoteMp4(directUrl, options);
  const downloaded = await downloadMp4ToTemp(directUrl, video.id, options);
  return { ...downloaded, directUrl };
}

module.exports = {
  validateInstagramUrl,
  extractDirectMp4Url,
  resolveDirectMp4Url,
  probeRemoteMp4,
  downloadMp4ToTemp,
  resolveAndDownloadVideo,
  isMp4ContentType
};
