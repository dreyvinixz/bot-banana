const { EmbedBuilder } = require("discord.js");

const faqDictionary = [
  {
    keywords: ["ganhar", "dinheiro", "nanacoin", "nanacoins", "saldo", "moeda", "comprar"],
    title: "💰 Como ganhar dinheiro no Caberé?",
    response: "Você pode ganhar Nanacoins usando o comando `/diario`, participando de eventos, roubando outros membros (cuidado com a prisão!) ou investindo no `/market`!"
  },
  {
    keywords: ["cargo", "cargos", "xp", "nivel", "nível", "subir", "ganhar xp", "conquista", "conquistas"],
    title: "📈 Como ganhar Cargos e XP?",
    response: "Basta conversar nos chats! Quanto mais você interage e participa da resenha, mais rápido você sobe de nível e conquista os cargos de progressão."
  },
  {
    keywords: ["patrocinar", "boost", "impulsos", "impulso", "booster", "patrocinador"],
    title: "🚀 Como patrocinar o Caberé?",
    response: "Se você der um Impulso (Boost) no servidor, você ganha automaticamente o cargo '🚀 Patrocinador da Baguga' e ganha acesso ao Camarim VIP exclusivo!"
  }
];

async function handleFaqMessage(message) {
  const content = message.content.toLowerCase();
  
  // Tentar encontrar uma resposta baseada no conteúdo
  for (const faq of faqDictionary) {
    const isMatch = faq.keywords.some(keyword => content.includes(keyword));
    
    if (isMatch) {
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`🤖 Auto-Resumo: ${faq.title}`)
        .setDescription(faq.response)
        .setFooter({ text: "O BotBanana já sabe de tudo!" });

      await message.reply({ 
        content: `Oi <@${message.author.id}>, vi que você perguntou sobre isso!`, 
        embeds: [embed] 
      });

      return true; // Indica que o bot respondeu
    }
  }

  return false;
}

module.exports = {
  handleFaqMessage
};
