const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const config = require("../scripts/core/config");
const path = require("path");
const fs = require("fs");

async function run() {
  if (!config.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN não configurado.");
    process.exit(1);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  client.on("clientReady", async () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);

    const targetChannelId = "1528288021437354004";
    let channel = client.channels.cache.get(targetChannelId);

    if (!channel) {
      try {
        channel = await client.channels.fetch(targetChannelId);
      } catch (e) {
        console.error("Não foi possível buscar pelo ID, procurando por nome...");
      }
    }

    if (!channel) {
      for (const guild of client.guilds.cache.values()) {
        const found = guild.channels.cache.find(c => c.name.includes("anuncio") || c.name.includes("aviso"));
        if (found) {
          channel = found;
          break;
        }
      }
    }

    if (!channel) {
      console.error("❌ Canal de anúncios/avisos não encontrado!");
      client.destroy();
      process.exit(1);
    }

    console.log(`Found channel: ${channel.name} (${channel.id})`);

    const bannerPath = path.join(process.cwd(), "assets", "banner_kabare.png");
    let files = [];
    if (fs.existsSync(bannerPath)) {
      files.push(new AttachmentBuilder(bannerPath, { name: "banner_kabare.png" }));
    }

    const embed = new EmbedBuilder()
      .setColor("#D4AF37") // Dourado luxuoso
      .setTitle("✨ NOVO BANNER OFICIAL DO KABARÉ! 🎭")
      .setDescription("Apresentamos a nova identidade visual do **Kabaré**!\nUm design exclusivo e luxuoso digno da nossa comunidade!")
      .setImage("attachment://banner_kabare.png")
      .setFooter({ text: "Kabaré — A nossa resenha de cara nova!" })
      .setTimestamp();

    const msg = await channel.send({
      content: "🎭 **CONFIRA A NOVA IDENTIDADE VISUAL DO KABARÉ!**",
      embeds: [embed],
      files: files
    });

    console.log(`✅ Anúncio do novo banner enviado com sucesso! Message ID: ${msg.id}`);
    client.destroy();
    process.exit(0);
  });

  client.login(config.DISCORD_TOKEN);
}

run().catch((err) => {
  console.error("🔥 Erro ao executar script de anúncio do banner:", err);
  process.exit(1);
});
