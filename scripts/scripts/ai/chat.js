const fs = require("fs");
const config = require("../core/config");
const { limparResposta, perguntarMensagensIa } = require("./question");

const chatCache = new Map();
const userCooldown = new Map();
const channelCooldown = new Map();
let ultimoGifEnviado = 0;
let mensagemCountFofoca = 0;

function textoChamaBot(conteudo) {
  return /\b(?:nana|botbanana)\b/i.test(conteudo);
}

function formatUserForContext(msg) {
  return `${msg.author.username}: ${msg.content}`;
}

function passouCooldown(message) {
  const agora = Date.now();
  const ultimoUser = userCooldown.get(message.author.id) || 0;
  const ultimoCanal = channelCooldown.get(message.channel.id) || 0;

  if (agora - ultimoUser < config.COOLDOWN_USUARIO_MS) return false;
  if (agora - ultimoCanal < config.COOLDOWN_CANAL_MS) return false;

  userCooldown.set(message.author.id, agora);
  channelCooldown.set(message.channel.id, agora);
  return true;
}

function deveResponder(message) {
  const conteudo = message.content.toLowerCase();
  const foiMencionado = message.mentions.has(message.client.user)
    || textoChamaBot(conteudo);
  const temPergunta = conteudo.includes("?");
  const temMidia = message.attachments.some((att) =>
    att.contentType && (att.contentType.includes("image") || att.contentType.includes("video"))
  ) || conteudo.includes("http") || conteudo.includes(".mp4");

  if (foiMencionado) {
    return { responder: true, motivo: "mencao" };
  }

  if (temMidia) {
    return {
      responder: Math.random() < config.CHANCE_RESPONDER_MIDIA,
      motivo: "midia"
    };
  }

  if (temPergunta) {
    return {
      responder: Math.random() < config.CHANCE_RESPONDER_PERGUNTA,
      motivo: "pergunta"
    };
  }

  return {
    responder: Math.random() < config.CHANCE_RESPONDER_CASUAL,
    motivo: "casual"
  };
}

function coletarGifs(message) {
  const gifRegex = /https?:\/\/(?:tenor\.com|giphy\.com)\S+/gi;
  const gifLinks = message.content.match(gifRegex) || [];
  message.attachments.forEach((att) => {
    if (att.contentType && att.contentType.includes("gif")) {
      gifLinks.push(att.url);
    }
  });

  if (gifLinks.length === 0) return;

  let savedGifs = [];
  try { savedGifs = JSON.parse(fs.readFileSync(config.GIFS_PATH, "utf-8")); } catch (e) { }

  let novosGifs = false;
  gifLinks.forEach((link) => {
    if (!savedGifs.includes(link)) {
      savedGifs.push(link);
      novosGifs = true;
    }
  });

  if (novosGifs) {
    fs.writeFileSync(config.GIFS_PATH, JSON.stringify(savedGifs, null, 2));
  }
}

function cachearMensagem(message) {
  if (!chatCache.has(message.channel.id)) {
    chatCache.set(message.channel.id, []);
  }

  const channelCache = chatCache.get(message.channel.id);
  channelCache.push(message);
  if (channelCache.length > config.CHAT_CACHE_LIMIT) {
    channelCache.shift();
  }
}

async function maybeExtrairFofocas(message) {
  if (!config.SERVIDOR_FOFOCA || message.guild.id !== config.SERVIDOR_FOFOCA) return;

  mensagemCountFofoca++;
  if (mensagemCountFofoca >= config.FOFOCA_MIN_MESSAGES) {
    mensagemCountFofoca = 0;
    extrairFofocas(message.channel.id);
  }
}

async function extrairFofocas(channelId) {
  const cache = chatCache.get(channelId);
  if (!cache || cache.length < 10) return;

  const conversa = cache.map((msg) => `${msg.author.username}: ${msg.content}`).join("\n");
  const prompt = [
    { role: "system", content: "Você é um espião. Analise as mensagens abaixo. Extraia em português APENAS fatos curtos, fofocas, segredos e características das pessoas. Retorne uma lista de bullet points com no máximo 3 itens cruciais. REGRA CRÍTICA: Se não houver fofoca real ou for apenas papo furado, retorne EXATAMENTE a palavra NADA e nada mais." },
    { role: "user", content: conversa }
  ];

  try {
    const resposta = await perguntarMensagensIa(prompt, { logLabel: "Fofoca/IA" });
    const invalida = resposta.toUpperCase().includes("NADA")
      || resposta.toLowerCase().includes("não há")
      || resposta.toLowerCase().includes("não contém");

    if (resposta && resposta.length > 5 && !invalida) {
      let fofocas = [];
      try { fofocas = JSON.parse(fs.readFileSync(config.FOFOCAS_PATH, "utf-8")); } catch (e) { }

      fofocas.push(`[${new Date().toLocaleDateString()}] ${resposta.replace(/\n/g, " ")}`);
      while (fofocas.length > config.FOFOCA_MAX_ITEMS) fofocas.shift();

      fs.writeFileSync(config.FOFOCAS_PATH, JSON.stringify(fofocas, null, 2));
      console.log("🕵️ Nova fofoca gravada no banco de dados!");
    }
  } catch (err) {
    console.log("Falha na fofoca secreta: ", err.message);
  }
}

async function montarContexto(message, motivo) {
  let fofocaContexto = "";
  if (message.guild && message.guild.id === config.SERVIDOR_FOFOCA) {
    try {
      const fofocas = JSON.parse(fs.readFileSync(config.FOFOCAS_PATH, "utf-8"));
      if (fofocas.length > 0) {
        fofocaContexto = "\n\nMEMÓRIA LONGA (Fofocas que você sabe sobre as pessoas deste servidor):\n" + fofocas.join("\n");
      }
    } catch (e) { }
  }

  const historico = chatCache.get(message.channel.id) || [];
  const formatHistorico = historico
    .slice(-config.CONTEXT_HISTORY_LIMIT)
    .filter((msg) => !msg.author.bot || msg.author.id === message.client.user.id)
    .map((msg) => ({
      role: msg.author.id === message.client.user.id ? "assistant" : "user",
      content: msg.author.id === message.client.user.id ? msg.content : formatUserForContext(msg)
    }));

  return [
    {
      role: "system",
      content: `
Use a configuração principal do dono do bot que foi enviada antes deste contexto.${fofocaContexto}

[SITUAÇÃO ATUAL]
- Motivo da sua fala agora: ${motivo}.
- O usuário principal é: @${message.author.username}.
- REGRA CRÍTICA 1: Responda diretamente ao @${message.author.username}.
- REGRA CRÍTICA 2: NUNCA diga seu próprio nome no início da frase e NUNCA imite o formato "usuario: mensagem".
- REGRA CRÍTICA 3: Você é o bot ${message.client.user.username}. NUNCA crie falas para outros usuários. Apenas responda com a SUA fala, sem prefixos.
`
    },
    ...formatHistorico
  ];
}

async function responderComIa(message, motivo) {
  await message.channel.sendTyping();
  const contexto = await montarContexto(message, motivo);
  const respostaBruta = await perguntarMensagensIa(contexto, { logLabel: "Chat/IA" });
  let resposta = limparResposta(respostaBruta);

  resposta = resposta.replace(/^(?:Nana|BotBanana|[^:]+)\s*[:]\s*/i, "");
  resposta = resposta.replace(/^Nana,\s*/i, "");
  resposta = resposta.replace(new RegExp(`^${message.author.username}[,:]?\\s*`, "i"), "");
  resposta = resposta.replace(/^@[^:]+:\s*/i, ""); // Remove se imitar outro usuario
  resposta = resposta.replace(/^[0-9]+\):\s*/, ""); // Remove restos de IDs ex: 12345):
  resposta = resposta.replace(/^["']|["']$/g, "").trim();

  let enviarGif = false;
  let gifUrl = null;
  if (resposta.includes("[GIF]")) {
    resposta = resposta.replace(/\[GIF\]/g, "").trim();
    if (Date.now() - ultimoGifEnviado > config.GIF_COOLDOWN_MS) {
      enviarGif = true;
    }
  }

  if (message.content.toLowerCase().match(/mand[ae].*gif/)) {
    enviarGif = true;
  }

  if (!resposta) return;

  if (enviarGif) {
    try {
      const savedGifs = JSON.parse(fs.readFileSync(config.GIFS_PATH, "utf-8"));
      if (savedGifs.length > 0) {
        gifUrl = savedGifs[Math.floor(Math.random() * savedGifs.length)];
        ultimoGifEnviado = Date.now();
      } else {
        gifUrl = config.DEFAULT_GIF_URL;
      }
    } catch (e) {
      gifUrl = config.DEFAULT_GIF_URL;
    }

    if (gifUrl) {
      resposta = "";
    }
  }

  if (!resposta && !gifUrl) return;

  const conteudoFinal = (resposta ? resposta.slice(0, 1800) : "") + (gifUrl ? (resposta ? `\n${gifUrl}` : gifUrl) : "");

  await message.reply({
    content: conteudoFinal,
    allowedMentions: {
      repliedUser: true
    }
  });
}

async function maybeResponderEspontaneo(message) {
  const conteudo = message.content.trim();
  if (!conteudo || conteudo.startsWith("!")) return;

  const decisao = deveResponder(message);
  if (!decisao.responder) return;
  if (decisao.motivo !== "mencao" && !passouCooldown(message)) return;

  console.log(`💬 Respondendo ao usuário @${message.author.username} no canal #${message.channel.name} (Motivo: ${decisao.motivo})...`);

  try {
    await responderComIa(message, decisao.motivo);
    console.log(`✅ Resposta enviada para @${message.author.username} com sucesso.`);
  } catch (err) {
    console.log("🔥 Erro ao responder com IA (espontâneo):", err.message);

    if (message.mentions.has(message.client.user)) {
      await message.reply({
        content: "Deu erro aqui ao chamar a IA. Confere se a chave da OpenAI está configurada.",
        allowedMentions: {
          repliedUser: false,
          parse: []
        }
      }).catch(() => null);
    }
  }
}

module.exports = {
  coletarGifs,
  cachearMensagem,
  maybeExtrairFofocas,
  maybeResponderEspontaneo
};
