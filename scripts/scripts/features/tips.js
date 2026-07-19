const { EmbedBuilder } = require("discord.js");
const config = require("../core/config");

const TIPS = config.static.app.tips.items || [];

const messageCountMap = new Map();
const lastTipTimeMap = new Map();

async function checkAndSendTip(message) {
  const channelId = message.channel.id;
  const isTestChannel = channelId === config.static.app.test.channelId;

  // Limites adaptativos (para podermos testar rápido no canal de testes)
  const threshold = isTestChannel ? config.static.app.tips.testThreshold : config.static.app.tips.threshold;
  const cooldown = isTestChannel ? config.static.app.tips.testCooldownMs : config.static.app.tips.cooldownMs;

  // Atualiza o contador de mensagens deste canal
  const count = (messageCountMap.get(channelId) || 0) + 1;
  messageCountMap.set(channelId, count);

  // Verifica se chegou na cota mínima de mensagens exigidas
  if (count >= threshold) {
    const now = Date.now();
    const lastTime = lastTipTimeMap.get(channelId) || 0;

    // Se já passou o cooldown de tempo exigido
    if (now - lastTime >= cooldown) {
      // Reseta os contadores para este canal
      messageCountMap.set(channelId, 0);
      lastTipTimeMap.set(channelId, now);

      // Sorteia uma dica aleatória
      const tipText = TIPS[Math.floor(Math.random() * TIPS.length)];
      if (!tipText) return;

      const embed = new EmbedBuilder()
        .setColor('#FFE135') // Amarelo Banana (Único)
        .setAuthor({ name: '💡 Dicas do Nana:' })
        .setDescription(`*${tipText}*`)
        .setFooter({ text: 'Continue interagindo para descobrir mais segredos!' });

      await message.channel.send({ embeds: [embed] }).catch(() => null);
    }
  }
}

module.exports = {
  checkAndSendTip
};
