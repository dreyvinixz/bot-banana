const config = require("../core/config");

function getChannel(client, channelId) {
  if (!client || !channelId) return null;
  return client.channels?.cache?.get(channelId) || null;
}

function buildWelcomePrincipalMessage(userId) {
  const guiaChannelId = config.WELCOME_GUIA_CHANNEL_ID || "1530089852106834091";
  return `Boas-vindas ao servidor, <@${userId}>! 🎉\nFique à vontade para conversar por aqui! Dica: dê uma olhada no canal <#${guiaChannelId}> para conferir o guia com novidades e regras do server. 🍌✨`;
}

function buildWelcomeGuiaMessage(userId) {
  const ideiasId = config.IDEIAS_CHANNEL_ID || "1530085098047930600";
  const fotosId = config.FOTOS_CHANNEL_ID || "1528288033986842725";
  const memesId = config.MEMES_CHANNEL_ID || "1529494487729176798";
  const comandosId = config.COMANDOS_CHANNEL_ID || "1529496411446444202";

  return [
    `Oii <@${userId}> ❤️! Seja muito bem-vindo(a) ao servidor!`,
    ``,
    `⚡ **Progresso & Nível:** Converse no chat para subir de nível! Use \`!xp\` para ver seu progresso.`,
    `🪙 **Nanacoins:** Ganhe nanacoins jogando nos chats de mini-games e resgate com \`!daily\`.`,
    `🚀 **Bump:** Ajude nosso servidor a crescer dando um \`/bump\`.`,
    `💡 **Ideias:** Adicione e vote em ideias para o servidor em <#${ideiasId}>.`,
    `📸 **Fotos:** Compartilhe fotos com a galera em <#${fotosId}>.`,
    `😂 **Memes:** Compartilhe seus melhores memes em <#${memesId}>.`,
    `📜 **Comandos:** Veja a lista completa de comandos em <#${comandosId}>.`
  ].join('\n');
}

async function sendWelcomeToChannel(client, channelId, messageContent) {
  if (!client || !channelId) return false;
  try {
    let channel = getChannel(client, channelId);
    if (!channel && client.channels && typeof client.channels.fetch === "function") {
      channel = await client.channels.fetch(channelId).catch(() => null);
    }
    if (channel && typeof channel.send === "function") {
      await channel.send(messageContent);
      return true;
    }
  } catch (err) {
    console.error(`🔥 Erro ao enviar mensagem de boas-vindas para canal ${channelId}:`, err.message || err);
  }
  return false;
}

async function handleMemberJoin(member) {
  if (!member || !member.id) return;
  const client = member.client;
  const userId = member.id;

  const msgPrincipal = buildWelcomePrincipalMessage(userId);
  const msgGuia = buildWelcomeGuiaMessage(userId);

  const principalChannelId = config.WELCOME_PRINCIPAL_CHANNEL_ID || "1528288031101026405";
  const guiaChannelId = config.WELCOME_GUIA_CHANNEL_ID || "1530089852106834091";

  await sendWelcomeToChannel(client, principalChannelId, msgPrincipal);
  await sendWelcomeToChannel(client, guiaChannelId, msgGuia);
}

async function handleWelcomeTestCommand(message) {
  const targetUser = message.mentions?.users?.first() || message.author;
  const userId = targetUser?.id || message.author.id;

  const msgPrincipal = buildWelcomePrincipalMessage(userId);
  const msgGuia = buildWelcomeGuiaMessage(userId);

  const principalChannelId = config.WELCOME_PRINCIPAL_CHANNEL_ID || "1528288031101026405";
  const guiaChannelId = config.WELCOME_GUIA_CHANNEL_ID || "1530089852106834091";

  const client = message.client;

  let sentPrincipal = await sendWelcomeToChannel(client, principalChannelId, msgPrincipal);
  let sentGuia = await sendWelcomeToChannel(client, guiaChannelId, msgGuia);

  if (!sentPrincipal || !sentGuia) {
    await message.reply({
      content: `🧪 **Preview das Mensagens de Boas-Vindas para <@${userId}>:**\n\n` +
        `**[Chat Principal - <#${principalChannelId}>]:**\n${msgPrincipal}\n\n` +
        `**[Chat de Guia - <#${guiaChannelId}>]:**\n${msgGuia}`
    });
  } else {
    await message.reply(`✅ Mensagens de boas-vindas enviadas nos canais <#${principalChannelId}> e <#${guiaChannelId}> para <@${userId}>!`);
  }
  return true;
}

module.exports = {
  buildWelcomePrincipalMessage,
  buildWelcomeGuiaMessage,
  handleMemberJoin,
  handleWelcomeTestCommand
};
