const fs = require("fs");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { runVideoJobOnce } = require("../core/videoScheduler");
const { validateInstagramUrl, resolveAndDownloadVideo } = require("../core/videoFetcher");
const { addVideoUrl } = require("../core/videoStore");
const config = require("../core/config");

const lastCommandReelByChannel = new Map();

function formatReelsFailure(reason) {
  const messages = {
    already_running: "Já tem um envio de reel em andamento. Tenta de novo em instantes.",
    no_videos: "Não tem nenhum vídeo ativo em `data/videos.json`.",
    no_channels: "Não encontrei canal para enviar o reel.",
    no_valid_channels: "Não consegui usar este canal para enviar o reel.",
    send_failed: "Baixei o reel, mas o Discord recusou o upload. Pode estar grande demais.",
    upload_too_large: "Esse reel ficou maior do que o limite de upload do Discord neste servidor.",
    video_failed: "Falhou ao resolver ou baixar o reel. Marquei a falha no histórico do vídeo.",
    job_error: "O ciclo manual de reel falhou."
  };
  return messages[reason] || "Não consegui enviar um reel agora.";
}

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function isUploadTooLargeError(err) {
  const message = `${err?.message || ""} ${err?.rawError?.message || ""}`;
  return err?.code === 40005 || /request entity too large|payload too large|file.*large|excede|excedeu/i.test(message);
}

function formatUploadTooLargeMessage(bytes, limit) {
  const sizeText = Number.isFinite(bytes) ? ` (${formatBytes(bytes)})` : "";
  return `❌ Esse reel é grande demais para mandar como arquivo${sizeText}. Limite atual: **${formatBytes(limit)}**. Tenta um reel menor ou ajuste \`DISCORD_UPLOAD_MAX_BYTES\` se seu servidor aceitar uploads maiores.`;
}

function rememberCommandReel(message) {
  if (!message?.id || !message.channelId) return;
  lastCommandReelByChannel.set(message.channelId, message.id);
}

function buildReelsPanelPayload(ownerId) {
  const embed = new EmbedBuilder()
    .setColor("#E1306C")
    .setTitle("🎬 Painel de Reels")
    .setDescription("Escolha como quer mandar o próximo reel neste chat.")
    .addFields(
      { name: "🎲 Aleatório", value: "Usa um reel ativo do banco do bot.", inline: true },
      { name: "🔗 Link", value: "Abre um campo para colar um link do Instagram Reels.", inline: true },
      { name: "🧹 Limpar", value: "Apaga o último reel enviado por este painel no chat.", inline: true }
    )
    .setFooter({ text: "O painel só responde para quem abriu o comando." });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reels_random_${ownerId}`)
      .setLabel("Aleatório")
      .setEmoji("🎲")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`reels_link_${ownerId}`)
      .setLabel("Enviar por link")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reels_delete_${ownerId}`)
      .setLabel("Apagar último")
      .setEmoji("🧹")
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row], allowedMentions: { repliedUser: false, parse: [] } };
}

async function handleReelsCommand(message) {
  return message.reply(buildReelsPanelPayload(message.author.id));
}

function getReelsOwnerId(customId) {
  const parts = String(customId || "").split("_");
  return parts.length >= 3 ? parts.slice(2).join("_") : null;
}

async function sendRandomReel(interaction, options = {}) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await (options.runVideoJobOnce || runVideoJobOnce)(interaction.client, {
    channels: [interaction.channel],
    channelDelayMs: 0,
    onSentMessage: (sentMessage) => rememberCommandReel(sentMessage)
  });

  if (result.ok) {
    return interaction.editReply("✅ Reel aleatório enviado neste chat.");
  }

  return interaction.editReply(`❌ ${formatReelsFailure(result.reason)}`);
}

async function sendLinkedReel(interaction, rawUrl, options = {}) {
  let normalizedUrl;
  try {
    normalizedUrl = validateInstagramUrl(rawUrl);
  } catch (err) {
    return interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let downloaded = null;
  const video = {
    id: `reel_link_${Date.now()}`,
    url: normalizedUrl,
    title: "Reel por link"
  };

  const uploadMaxBytes = options.uploadMaxBytes || config.DISCORD_UPLOAD_MAX_BYTES;

  try {
    downloaded = await (options.resolveAndDownloadVideo || resolveAndDownloadVideo)(video, { maxBytes: uploadMaxBytes });
    if (downloaded.bytes > uploadMaxBytes) {
      return interaction.editReply(formatUploadTooLargeMessage(downloaded.bytes, uploadMaxBytes));
    }

    const sentMessage = await interaction.channel.send({
      files: [
        new AttachmentBuilder(downloaded.filePath, {
          name: `${video.id}.mp4`
        })
      ]
    });
    rememberCommandReel(sentMessage);
    const saved = (options.addVideoUrl || addVideoUrl)(normalizedUrl, {
      title: `Reel enviado por ${interaction.user.username || interaction.user.id}`,
      addedBy: interaction.user.id,
      source: "reels_panel"
    });
    const savedText = saved?.added ? " Salvei esse link no banco de reels." : " Esse link já estava no banco de reels.";
    return interaction.editReply(`✅ Reel enviado pelo link.${savedText}`);
  } catch (err) {
    if (isUploadTooLargeError(err)) {
      return interaction.editReply(formatUploadTooLargeMessage(downloaded?.bytes, uploadMaxBytes));
    }

    console.warn(`[reels] falha ao enviar link informado: ${err.message}`);
    return interaction.editReply("❌ Não consegui baixar/enviar esse reel. Confere se o link é público e tenta de novo.");
  } finally {
    if (downloaded?.filePath) {
      await fs.promises.unlink(downloaded.filePath).catch(() => {});
    }
  }
}

async function deleteLastCommandReel(interaction) {
  const messageId = lastCommandReelByChannel.get(interaction.channelId);
  if (!messageId) {
    return interaction.reply({ content: "Não encontrei nenhum reel enviado por este painel para apagar neste chat.", flags: MessageFlags.Ephemeral });
  }

  try {
    const message = await interaction.channel.messages.fetch(messageId);
    await message.delete();
    lastCommandReelByChannel.delete(interaction.channelId);
    return interaction.reply({ content: "🧹 Último reel do painel apagado.", flags: MessageFlags.Ephemeral });
  } catch (err) {
    lastCommandReelByChannel.delete(interaction.channelId);
    return interaction.reply({ content: "Não consegui apagar o último reel. Talvez ele já tenha sido removido.", flags: MessageFlags.Ephemeral });
  }
}

async function handleReelsInteraction(interaction, options = {}) {
  if (!interaction.customId?.startsWith("reels_")) return false;

  if (interaction.isModalSubmit?.() && interaction.customId.startsWith("reels_link_modal_")) {
    const ownerId = getReelsOwnerId(interaction.customId.replace("reels_link_modal_", "reels_link_"));
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "❌ Este painel de reels é de outro usuário. Digite `!reels` para abrir o seu.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const url = interaction.fields.getTextInputValue("reels_url");
    await sendLinkedReel(interaction, url, options);
    return true;
  }

  if (!interaction.isButton?.()) return false;

  const ownerId = getReelsOwnerId(interaction.customId);
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "❌ Este painel de reels é de outro usuário. Digite `!reels` para abrir o seu.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.customId.startsWith("reels_random_")) {
    await sendRandomReel(interaction, options);
    return true;
  }

  if (interaction.customId.startsWith("reels_link_")) {
    const modal = new ModalBuilder()
      .setCustomId(`reels_link_modal_${ownerId}`)
      .setTitle("Enviar Reel por Link");

    const urlInput = new TextInputBuilder()
      .setCustomId("reels_url")
      .setLabel("Link do Instagram Reels")
      .setPlaceholder("https://www.instagram.com/reel/...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.customId.startsWith("reels_delete_")) {
    await deleteLastCommandReel(interaction);
    return true;
  }

  return false;
}

module.exports = {
  buildReelsPanelPayload,
  formatReelsFailure,
  handleReelsCommand,
  handleReelsInteraction,
  rememberCommandReel,
  isUploadTooLargeError,
  __lastCommandReelByChannel: lastCommandReelByChannel
};
