const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
// No duel directly here, we show a modal for Duelo

async function handleGamesCommand(message) {
  const userId = message.author.id;
  const embed = new EmbedBuilder()
    .setColor('#FF00FF') // Magenta neon
    .setTitle('🎰 BEM-VINDO AO FLIPERAMA DO NANA 🎰')
    .setDescription('Escolha o seu veneno! Aqui você pode multiplicar seu dinheiro ou perder tudo. Clique em um dos botões abaixo para jogar:')
    .addFields(
      { name: '🎮 Forca da IA', value: 'Sobreviva à forca gerada por imagens da IA. Escolha entre 1, 3 ou 5 rodadas!' },
      { name: '🌌 Multiverso (RPG/Trivia)', value: 'Improviso maluco ou Show do Milhão. Teste sua inteligência.' },
      { name: '⚔️ Duelo Clandestino', value: 'Desafie um amigo para uma rinha tática valendo Nanacoins.' }
    )
    .setImage('https://media.giphy.com/media/l41YkxvU8c7J7Bba0/giphy.gif')
    .setFooter({ text: 'A casa sempre ganha... mentira, pode apostar tranquilo!' });

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`games_menu_forca_${userId}`)
        .setLabel('🎮 Forca')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`games_menu_aventura_${userId}`)
        .setLabel('🌌 RPG / Trivia')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`games_menu_duelo_${userId}`)
        .setLabel('⚔️ Duelo')
        .setStyle(ButtonStyle.Danger)
    );

  const payload = { embeds: [embed], components: [row] };
  if (message.update) return message.update(payload);
  await message.reply(payload);
}

async function handleGamesInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('games_menu_forca_')) {
      const ownerId = interaction.customId.replace('games_menu_forca_', '');
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: "❌ Apenas quem digitou `!games` pode usar este menu! Digite o seu próprio `!games`.", flags: MessageFlags.Ephemeral });
      }
      const { promptForcaRounds } = require("./forca");
      return promptForcaRounds(interaction, ownerId);
    }
    
    if (interaction.customId.startsWith('games_menu_lootbox_')) {
      const ownerId = interaction.customId.replace('games_menu_lootbox_', '');
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: "❌ Apenas quem digitou `!games` pode usar este menu!", flags: MessageFlags.Ephemeral });
      }
      const { handleBoostCommand } = require("../economy/boosts");
      return handleBoostCommand({ author: interaction.user, user: interaction.user, update: (p) => interaction.update(p) });
    }
    
    if (interaction.customId.startsWith('games_menu_aventura_')) {
      const ownerId = interaction.customId.replace('games_menu_aventura_', '');
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: "❌ Apenas quem digitou `!games` pode usar este menu! Digite o seu próprio `!games`.", flags: MessageFlags.Ephemeral });
      }
      const { handleAventuraCommandMenu } = require("./rpg");
      return handleAventuraCommandMenu(interaction, ownerId);
    }

    if (interaction.customId.startsWith('games_menu_duelo_')) {
      const ownerId = interaction.customId.replace('games_menu_duelo_', '');
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: "❌ Apenas quem digitou `!games` pode usar este menu! Digite o seu próprio `!games`.", flags: MessageFlags.Ephemeral });
      }
      const modal = new ModalBuilder()
        .setCustomId('modal_duelo_start')
        .setTitle('⚔️ Novo Duelo Clandestino');

      const targetInput = new TextInputBuilder()
        .setCustomId('duelo_target')
        .setLabel('Nome, @Menção ou ID do oponente')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Zezinho')
        .setRequired(true);

      const amountInput = new TextInputBuilder()
        .setCustomId('duelo_amount')
        .setLabel('Valor da Aposta (Nanacoins)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 100')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(targetInput),
        new ActionRowBuilder().addComponents(amountInput)
      );

      return interaction.showModal(modal);
    }
  }

  // Handle Duelo Modal Submit
  if (interaction.isModalSubmit() && interaction.customId === 'modal_duelo_start') {
    const { handleDueloModalSubmit } = require("./duel");
    return handleDueloModalSubmit(interaction);
  }

  return false;
}

module.exports = {
  handleGamesCommand,
  handleGamesInteraction
};
