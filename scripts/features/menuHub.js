const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require("discord.js");
const { formatCoins, getCoins, getTopPlayers } = require("../economy/economy");
const { getUserXpStats, createProgressBar } = require("./xp");

function buildMenuEmbed(user) {
  return new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle("🍌 CENTRAL DO BOT BANANA 🍌")
    .setDescription(`Olá **${user.username}**! Use o menu abaixo ou os botões de atalho para navegar rapidamente pelas funções do servidor!`)
    .addFields(
      { name: "🎮 Mini-Games & Cassino", value: "Acesse `!games` para Jogos da Forca, Trivia/RPG, Duelos e Lootboxes!", inline: false },
      { name: "🏪 Loja, Parrudo & Bolsa", value: "Compre boosts, Proteção Parrudo e itens na `!loja` ou negocie na `!bolsa`!", inline: false },
      { name: "⚔️ Crimes & Ações Rápidas", value: "Use `!roubar`, `!parrudo`, `!timeout`, `!fianca` ou testar a sorte em `!beijarmuro`!", inline: false },
      { name: "📈 Progressão & Economia", value: "Resgate seu `!daily`, veja seu `!saldo`, confira seu card no `!xp` e o `!rank`!", inline: false },
      { name: "🎬 Mídia & IA", value: "Abra o painel de vídeos em `!reels` ou gere artes com `!img` / `!anime`!", inline: false }
    )
    .setFooter({ text: "Dica: Você também pode usar qualquer comando direto no chat!" });
}

function buildMenuComponents(ownerId) {
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`menu_btn_games_${ownerId}`).setLabel("🎮 Jogos").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`menu_btn_loja_${ownerId}`).setLabel("🏪 Loja").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`menu_btn_inv_${ownerId}`).setLabel("🎒 Inventário").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`menu_btn_saldo_${ownerId}`).setLabel("💳 Saldo").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`menu_btn_xp_${ownerId}`).setLabel("⚡ Meu XP").setStyle(ButtonStyle.Secondary)
  );

  const rowSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`menu_select_${ownerId}`)
      .setPlaceholder("Navegar por categoria...")
      .addOptions([
        { label: "🎮 Central de Jogos", value: "games", description: "Hub de Jogos: Forca, Trivia, Duelo e Lootboxes", emoji: "🎮" },
        { label: "🏪 Loja Oficial & Proteção Parrudo", value: "loja", description: "Compre Proteção Parrudo, boosts e consumíveis", emoji: "🏪" },
        { label: "🎒 Inventário & Forja", value: "inv", description: "Seus itens, armas e criação de equipamentos", emoji: "🎒" },
        { label: "📈 Bolsa de Valores", value: "bolsa", description: "Mercado livre de compra e venda de itens", emoji: "📈" },
        { label: "💳 Extrato Bancário", value: "saldo", description: "Verifique suas Nanacoins e ranking", emoji: "💳" },
        { label: "⚡ Cartão de Nível & XP", value: "xp", description: "Veja seu progresso de nível e cargos", emoji: "⚡" },
        { label: "🎬 Painel de Reels", value: "reels", description: "Gerenciar e assistir Reels do Instagram", emoji: "🎬" },
        { label: "📜 Lista Completa de Comandos", value: "help", description: "Ver todos os comandos do servidor", emoji: "📜" }
      ])
  );

  return [rowButtons, rowSelect];
}

async function handleMenuCommand(message) {
  const ownerId = message.author?.id || message.user?.id;
  const embed = buildMenuEmbed(message.author || message.user);
  const components = buildMenuComponents(ownerId);

  const payload = { content: "", embeds: [embed], components };

  if (message.update) return message.update(payload);
  return message.reply(payload);
}

async function handleMenuInteraction(interaction) {
  const isButton = interaction.isButton() && interaction.customId.startsWith("menu_btn_");
  const isSelect = interaction.isStringSelectMenu() && interaction.customId.startsWith("menu_select_");

  if (!isButton && !isSelect) return false;

  const parts = interaction.customId.split("_");
  const ownerId = parts.at(-1);

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ Este menu foi aberto por outro jogador! Digite `!menu` no chat para abrir o seu.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  let action = "";
  if (isButton) {
    action = parts[2];
  } else if (isSelect) {
    action = interaction.values[0];
  }

  const mockMessage = {
    author: interaction.user,
    user: interaction.user,
    client: interaction.client,
    guild: interaction.guild,
    channel: interaction.channel,
    channelId: interaction.channelId,
    reply: async (content) => {
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp(content);
      }
      return interaction.reply(content);
    },
    update: async (payload) => interaction.update(payload)
  };

  if (action === "games") {
    const { handleGamesCommand } = require("../games/menu");
    await handleGamesCommand(mockMessage);
    return true;
  }

  if (action === "loja") {
    const { handleBoostCommand } = require("../economy/boosts");
    await handleBoostCommand(mockMessage);
    return true;
  }

  if (action === "inv") {
    const { handleInventoryCommand } = require("../economy/weapons");
    await handleInventoryCommand(mockMessage);
    return true;
  }

  if (action === "bolsa") {
    const { handleMarketCommand } = require("../economy/market");
    await handleMarketCommand(mockMessage);
    return true;
  }

  if (action === "reels") {
    const { handleReelsCommand } = require("../features/reels");
    await handleReelsCommand(mockMessage);
    return true;
  }

  if (action === "saldo") {
    const coins = getCoins(interaction.user.id);
    const topPlayers = getTopPlayers(100);
    const myRank = topPlayers.findIndex(p => p.id === interaction.user.id) + 1;
    const rankStr = myRank > 0 ? `#${myRank}` : 'Não rankeado';

    const embed = new EmbedBuilder()
      .setColor('#000000')
      .setTitle('💳 BANCO NANACOIN')
      .setDescription(`Extrato bancário de **${interaction.user.username}**`)
      .addFields(
        { name: '💵 Saldo Disponível', value: `\`🪙 ${formatCoins(coins)} Nanacoins\``, inline: true },
        { name: '🏆 Posição no Rank', value: `\`${rankStr}\``, inline: true }
      )
      .setFooter({ text: 'Dica: Use a loja para gastar ou roubar para tentar a sorte.' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "xp") {
    const { handleXpCommand } = require("./xp");
    await handleXpCommand(mockMessage, "");
    return true;
  }

  if (action === "help") {
    const { buildHelpEmbed } = require("../app/bot");
    if (typeof buildHelpEmbed === "function") {
      await interaction.reply({ embeds: [buildHelpEmbed()], flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  return false;
}

module.exports = {
  buildMenuEmbed,
  buildMenuComponents,
  handleMenuCommand,
  handleMenuInteraction
};
