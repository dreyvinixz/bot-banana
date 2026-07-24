const {
  isSuperAdmin,
  requireSuperAdmin,
  handleAdminAuthCommand,
  handleSpawnBossCommand,
  handleSpawnMiniBossCommand,
  handleEconAdminCommand
} = require("./adminAuth");

const {
  getOrFetchRoleTag,
  getFaviconEmoji,
  handleSetupRegrasCommand,
  handleSetupCargosInfoCommand,
  handleSetupAvisosCommand,
  handleSetupPubliCommand,
  handleSetupCompeticoesCommand,
  handleSetupCaixaInfoCommand,
  handleSetupReviewsCommand,
  sendStartupAnnouncement
} = require("./setupPanels");

async function handleAdminCommand(message) {
  const command = message.content.trim().toLowerCase();

  if (command.startsWith("!spawn_boss") || command.startsWith("!spawnboss")) {
    return handleSpawnBossCommand(message);
  }
  if (command.startsWith("!spawn_miniboss") || command.startsWith("!spawn_mini")) {
    return handleSpawnMiniBossCommand(message);
  }
  if (command.startsWith("!econadmin")) {
    return handleEconAdminCommand(message);
  }
  if (command.startsWith("!setup_regras")) {
    return handleSetupRegrasCommand(message);
  }
  if (command.startsWith("!setup_cargos_info") || command.startsWith("!setup_cargos")) {
    return handleSetupCargosInfoCommand(message);
  }
  if (command.startsWith("!setup_avisos") || command.startsWith("!anunciar_novidades")) {
    return handleSetupAvisosCommand(message);
  }
  if (command.startsWith("!setup_publi")) {
    return handleSetupPubliCommand(message);
  }
  if (command.startsWith("!setup_competicoes") || command.startsWith("!setup_competicao")) {
    return handleSetupCompeticoesCommand(message);
  }
  if (command.startsWith("!setup_caixa_info")) {
    return handleSetupCaixaInfoCommand(message);
  }
  if (command.startsWith("!setup_reviews")) {
    return handleSetupReviewsCommand(message);
  }
  if (command.startsWith("!setup_familia")) {
    const { handleSetupFamiliaCommand } = require("../features/familia");
    return handleSetupFamiliaCommand(message);
  }

  return handleAdminAuthCommand(message);
}

module.exports = {
  isSuperAdmin,
  requireSuperAdmin,
  handleAdminCommand,
  handleSetupRegrasCommand,
  handleSetupCargosInfoCommand,
  handleSetupAvisosCommand,
  handleSetupPubliCommand,
  handleSetupCompeticoesCommand,
  handleSetupCaixaInfoCommand,
  handleSetupReviewsCommand,
  sendStartupAnnouncement,
  getOrFetchRoleTag,
  getFaviconEmoji
};
