require("dotenv").config({ path: "../../.env" });
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

// Ajuste para carregar o config relativo
const config = require("./config");

const commands = [
  new SlashCommandBuilder()
    .setName("ajuda")
    .setDescription("Mostra a lista de comandos do BotBanana!"),
  new SlashCommandBuilder()
    .setName("saldo")
    .setDescription("Verifica seu saldo bancário em Nanacoins e seu rank global."),
  new SlashCommandBuilder()
    .setName("diario")
    .setDescription("Resgate sua recompensa diária!"),
  new SlashCommandBuilder()
    .setName("setup_regras")
    .setDescription("[SuperAdmin] Configura o canal de regras do servidor Caberé")
];

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

async function registerSlashCommands() {
  try {
    console.log("Iniciando o registro dos comandos de barra (/) do BotBanana...");

    if (!process.env.DISCORD_CLIENT_ID) {
      console.error("ERRO: Variável DISCORD_CLIENT_ID não definida no seu arquivo .env!");
      console.error("Para registrar Slash Commands, você precisa do ID do seu bot no Discord Developer Portal.");
      process.exit(1);
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    console.log("✅ Slash Commands registrados com sucesso no Discord!");
  } catch (error) {
    console.error("❌ Ocorreu um erro ao registrar os comandos:");
    console.error(error);
  }
}

registerSlashCommands();
