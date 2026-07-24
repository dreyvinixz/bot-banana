const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
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
    .setName("xp")
    .setDescription("Consulta seu cartão de nível, XP e barra de progresso visual."),
  new SlashCommandBuilder()
    .setName("rankxp")
    .setDescription("Mostra o ranking dos membros com maior nível e XP do servidor."),
  new SlashCommandBuilder()
    .setName("setup_regras")
    .setDescription("[Admin] Configura as regras do Caberé em um canal."),
  new SlashCommandBuilder()
    .setName("setup_cargos_info")
    .setDescription("[Admin] Configura o painel informativo de cargos."),
  new SlashCommandBuilder()
    .setName("setup_avisos")
    .setDescription("[Admin] Configura o painel informativo de avisos."),
  new SlashCommandBuilder()
    .setName("setup_caixa_info")
    .setDescription("[Admin] Configura o painel informativo da caixa do servidor."),
  new SlashCommandBuilder()
    .setName("setup_cabere")
    .setDescription("[SuperAdmin] Cria a estrutura completa de canais e categorias do servidor")
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

if (require.main === module) {
  registerSlashCommands();
}
