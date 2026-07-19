const fs = require("fs");
const path = require("path");
const { AttachmentBuilder } = require("discord.js");
const config = require("../core/config");
const { assertForgeReady } = require("../core/services");
const { limparResposta, perguntarMensagensIa } = require("./question");

function limparIdeiaImagem(texto) {
  return texto
    .replace(/^\s*(gere|gera|crie|cria|faça|faca|desenhe|desenha|generate|create|make|draw)\s+(uma?\s+)?(imagem|foto|desenho|arte|picture|image|photo)\s+(de|do|da|com|about|of)?\s*/i, "")
    .trim();
}

function limparPromptImagem(texto) {
  return limparResposta(texto)
    .replace(/^```(?:json|txt)?/i, "")
    .replace(/```$/i, "")
    .replace(/^prompt\s*[:=-]\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function promptFallbackImagem(ideia, isAnime) {
  const base = limparIdeiaImagem(ideia) || ideia;

  if (isAnime) {
    return `masterpiece anime art, single clear subject: ${base}, centered composition, simple background, vibrant colors, detailed, best quality`;
  }

  return `professional realistic photo, single clear subject: ${base}, centered composition, simple background, sharp focus, natural lighting, high detail`;
}

function lerPoliticasImagem() {
  try {
    return fs.readFileSync(config.POLITICAS_IMAGEM_PATH, "utf-8").trim();
  } catch (e) {
    console.warn(`⚠️ ${path.basename(config.POLITICAS_IMAGEM_PATH)} não encontrado ou não pôde ser lido.`);
    return "";
  }
}

async function melhorarPromptImagem(ideiaOriginal, isAnime) {
  const ideia = limparIdeiaImagem(ideiaOriginal);
  const estilo = isAnime ? "anime illustration" : "realistic photography";
  const politicasImagem = lerPoliticasImagem();

  const systemPrompt = `
You are a Stable Diffusion prompt engineer.
Your job is to transform short Portuguese or English image ideas into one strong English prompt.

Rules:
- Reply with ONLY the final prompt, no explanations, no markdown, no quotes.
- Always write in English.
- Preserve the user's main subject and intent.
- Keep the prompt simple and powerful. Do not overload it with many objects.
- Prefer one clear subject only. Use centered composition and a simple readable background.
- Use this structure: quality/style, single main subject, one action/pose, one simple place/background, one lighting phrase.
- If the input is vague, add only the most useful missing details.
- Do not add random celebrities, brands, text, logos, watermarks, or extra people unless requested.
- Avoid abstract, chaotic, surreal, or symbolic imagery unless the user explicitly asks for it.
- Avoid moral commentary. This is prompt engineering, not chat.
- Keep it between 20 and 40 words.
- Style target: ${estilo}.

Image-only policy/configuration from politicas_imagem.txt:
${politicasImagem || "No image-only policy configured."}

Examples:
Input: "Gere uma imagem de um Uruguaiano"
Output: "professional realistic portrait, adult Uruguayan man, casual streetwear, centered composition, simple Montevideo street background, golden hour lighting, sharp focus"

Input: "um guerreiro medieval com espada"
Output: "cinematic realistic photo, medieval warrior holding a sword, worn armor, centered composition, simple battlefield background, dramatic cloudy lighting, sharp focus"

Input: "gato astronauta"
Output: "cute astronaut cat, detailed space suit, centered composition, simple spaceship interior background, soft cinematic lighting, sharp focus, high detail"
`.trim();

  try {
    const resposta = await perguntarMensagensIa([
      { role: "system", content: systemPrompt },
      { role: "user", content: ideia || ideiaOriginal }
    ], { logLabel: "Imagem/IA" });

    const promptMelhorado = limparPromptImagem(resposta);
    if (promptMelhorado && promptMelhorado.length >= 20) {
      return promptMelhorado;
    }
  } catch (e) {
    console.log("Falha ao melhorar prompt, usando fallback:", e.message);
  }

  return promptFallbackImagem(ideia || ideiaOriginal, isAnime);
}

async function gerarImagemNoForge(promptEmIngles, isAnime, customNegativePrompt) {
  const modelo = isAnime ? config.FORGE_ANIME_MODEL : config.FORGE_REALISTIC_MODEL;
  let negative_prompt = isAnime ? config.FORGE_ANIME_NEGATIVE_PROMPT : config.FORGE_REALISTIC_NEGATIVE_PROMPT;
  if (customNegativePrompt) {
    negative_prompt = customNegativePrompt + ", " + negative_prompt;
  }

  const payload = {
    prompt: promptEmIngles,
    negative_prompt,
    steps: config.FORGE_STEPS,
    cfg_scale: config.FORGE_CFG_SCALE,
    width: config.FORGE_WIDTH,
    height: config.FORGE_HEIGHT,
    override_settings: {
      sd_model_checkpoint: modelo
    },
    sampler_name: config.FORGE_SAMPLER,
    batch_size: config.FORGE_BATCH_SIZE
  };

  await assertForgeReady();
  const response = await fetch(`${config.FORGE_HOST}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Status ${response.status}`);
  }

  const data = await response.json();
  const imageBase64 = data.images[0];
  const buffer = Buffer.from(imageBase64, "base64");
  return new AttachmentBuilder(buffer, { name: "imagem.png" });
}

async function handleImageCommand(message, { prompt, isAnime, cmd }) {
  if (!prompt) {
    return message.reply(`Digite o que você quer desenhar: \`${cmd} um gato cibernético\``);
  }

  const m = await message.channel.send("🎨 Melhorando o prompt da imagem. Aguarde...");

  try {
    const promptEmIngles = await melhorarPromptImagem(prompt, isAnime);
    console.log(`🖼️ Prompt melhorado: ${promptEmIngles}`);
    
    const startTime = Date.now();
    const attachment = await gerarImagemNoForge(promptEmIngles, isAnime);
    const latency = Date.now() - startTime;
    console.log(`⏱️ [Imagem/Forge] Latência: ${latency}ms para o prompt "${prompt}"`);

    await message.reply({ content: `✨ Imagem gerada em ${latency / 1000}s: \`${prompt}\``, files: [attachment] });
    await m.delete().catch(() => null);
  } catch (err) {
    console.error("Erro ao gerar imagem:", err);
    m.edit(`❌ Erro só na imagem: ${err.message}. Abra o Forge com \`stable-diffusion-webui-forge\\webui-user.bat\`.`);
  }
}

module.exports = {
  handleImageCommand,
  gerarImagemNoForge
};
