const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const config = require("../core/config");
const { escapeXml } = require("../core/utils");

const googleClient = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? new TextToSpeechClient()
  : null;
const writeFile = util.promisify(fs.writeFile);
let skipGoogleTts = false;

async function generateWithGoogle(text, filePath) {
  console.log("🎤 Gerando áudio com Google Cloud...");

  const request = {
    input: { text },
    voice: { languageCode: config.GOOGLE_TTS_LANGUAGE_CODE, name: config.GOOGLE_TTS_VOICE },
    audioConfig: { audioEncoding: "MP3" }
  };

  const [response] = await googleClient.synthesizeSpeech(request);
  await writeFile(filePath, response.audioContent, "binary");
  return "Google Cloud";
}

async function generateWithEdgeTts(text, filePath) {
  console.log("🎤 Gerando áudio com Microsoft Edge TTS...");

  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const tts = new MsEdgeTTS();
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bottts-"));

  try {
    await tts.setMetadata(config.EDGE_TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioFilePath } = await tts.toFile(tempDir, escapeXml(text));
    await fs.promises.copyFile(audioFilePath, filePath);
    return "Microsoft Edge TTS";
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function isBillingDisabledError(err) {
  return err?.reason === "BILLING_DISABLED"
    || /billing/i.test(err?.details || err?.message || "");
}

async function generateSpeech(text, filePath) {
  if (googleClient && !skipGoogleTts) {
    try {
      return await generateWithGoogle(text, filePath);
    } catch (err) {
      if (isBillingDisabledError(err)) {
        skipGoogleTts = true;
      }

      console.warn("⚠️ Google Cloud TTS falhou; usando fallback:", err.message);
    }
  }

  return generateWithEdgeTts(text, filePath);
}

module.exports = {
  generateSpeech
};
