const config = require("./config");

async function assertLocalService(url, name) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const serviceRoot = new URL(url).origin;

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${name} respondeu status ${response.status}`);
    }
  } catch (err) {
    throw new Error(`${name} não está aberto em ${serviceRoot}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function assertForgeReady() {
  await assertLocalService(`${config.FORGE_HOST}/sdapi/v1/options`, "Forge WebUI");
}

module.exports = {
  assertLocalService,
  assertForgeReady
};
