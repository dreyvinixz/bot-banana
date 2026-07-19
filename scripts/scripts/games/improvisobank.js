const config = require("../core/config");
const { choice } = require("../core/random");

const improvisoData = config.static.games.improviso;
const BANCO_CENARIOS = improvisoData.scenarios || [];
const cenariosUsados = new Map();

function getCenarioAleatorio(channelId, nomeJogador, rng = Math.random) {
  if (BANCO_CENARIOS.length === 0) {
    return {
      cenario: `**${nomeJogador}** abriu um portal estranho. O que acontece agora?`,
      img: "funny portal opening in a room cartoon style"
    };
  }

  if (!cenariosUsados.has(channelId)) cenariosUsados.set(channelId, []);

  const historyLimit = improvisoData.historyLimit || 60;
  const resetKeepLast = improvisoData.resetKeepLast || 5;
  const historico = cenariosUsados.get(channelId);
  let disponiveis = BANCO_CENARIOS.map((_, i) => i).filter((i) => !historico.includes(i));

  if (disponiveis.length === 0) {
    const recentes = historico.slice(-resetKeepLast);
    cenariosUsados.set(channelId, recentes);
    disponiveis = BANCO_CENARIOS.map((_, i) => i).filter((i) => !recentes.includes(i));
  }

  const idx = choice(disponiveis, rng);
  cenariosUsados.get(channelId).push(idx);
  while (cenariosUsados.get(channelId).length > historyLimit) cenariosUsados.get(channelId).shift();

  const entry = BANCO_CENARIOS[idx];
  return {
    cenario: entry.cenario.replace(/\{NOME\}/g, nomeJogador),
    img: entry.img
  };
}

function resetCenariosUsados() {
  cenariosUsados.clear();
}

module.exports = {
  BANCO_CENARIOS,
  getCenarioAleatorio,
  resetCenariosUsados
};
