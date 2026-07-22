const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);

  try {
    const guildId = "1344557188617732137";
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
    
    if (!guild) {
      console.error("Guild not found!");
      process.exit(1);
    }

    const channel = guild.channels.cache.get("1528288021437354004") || 
                    guild.channels.cache.find(c => c.name.includes("avisos"));

    if (!channel) {
      console.error("Avisos channel not found!");
      process.exit(1);
    }

    console.log(`Found channel: ${channel.name} (${channel.id})`);

    const assetsDir = path.join(__dirname, "..", "assets");
    const bannerKabarePath = path.join(assetsDir, "banner_kabare.png");

    let files = [];
    if (fs.existsSync(bannerKabarePath)) {
      files.push(new AttachmentBuilder(bannerKabarePath, { name: "banner_kabare.png" }));
    }

    const embedAvisos = new EmbedBuilder()
      .setColor("#8A2BE2") // Purple color matching the Kabaré banner!
      .setTitle("🔮 Novo Banner Oficial do Caberé!")
      .setDescription("Sejam todos muito bem-vindos ao **Caberé**! Confira o nosso novo banner oficial com identidade visual novinha em folha!")
      .addFields(
        { name: "✨ Novo Visual", value: "Nosso servidor e o **BotBanana** estão de cara nova! Fiquem atentos às próximas novidades." },
        { name: "📌 Fique Atento", value: "Deixe as notificações deste canal ativadas para não perder eventos, novidades, raids e sorteios!" }
      )
      .setFooter({ text: "Equipe Caberé - BotBanana 🍌" })
      .setTimestamp();

    if (files.length > 0) {
      embedAvisos.setImage("attachment://banner_kabare.png");
    }

    const msg = await channel.send({
      content: "# 🔮 **Novo Banner Oficial do Servidor!**",
      embeds: [embedAvisos],
      files: files
    });

    console.log("✅ Message sent successfully! Message ID:", msg.id);
  } catch (err) {
    console.error("❌ Error sending message:", err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
