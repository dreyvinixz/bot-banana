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
    const channelId = "1528288021437354004";
    let channel = client.channels.cache.get(channelId);

    if (!channel && client.channels.fetch) {
      channel = await client.channels.fetch(channelId).catch(() => null);
    }

    if (!channel) {
      console.error(`❌ Channel ${channelId} not found!`);
      process.exit(1);
    }

    console.log(`Found channel: ${channel.name} (${channel.id})`);

    const bannerPath = path.join(__dirname, "..", "assets", "banner_kabare.png");
    let files = [];
    if (fs.existsSync(bannerPath)) {
      files.push(new AttachmentBuilder(bannerPath, { name: "banner_kabare.png" }));
    }

    const embedAvisos = new EmbedBuilder()
      .setColor("#8A2BE2")
      .setTitle("🔮 ATUALIZAÇÕES DO BOTBANANA & SORTEIO DE NITRO! 🍌")
      .setDescription("Chegaram super atualizações no **Kabaré** e um sorteio imperdível rolando agora!")
      .addFields(
        {
          name: "🎁 Sorteio de 1x Discord Nitro (Meta: 100 Membros!)",
          value: "Está rolando um sorteio de **1x Discord Nitro** no canal <#1529584034869678171>!\n⚠️ **Importante:** O sorteio será executado assim que atingirmos a marca de **100 membros** no servidor!\nCorra no canal de sorteios e reaja com **🎉** para participar!"
        },
        {
          name: "⚡ Notificações de Nível Corrigidas",
          value: "Agora ao subir de nível no chat, o bot faz a menção direta te notificando com alerta no canal <#1529586599099371550>!"
        },
        {
          name: "💖 Verificação da Família Kabaré Aprimorada",
          value: "A verificação no painel do canal <#1528288031101026405> agora lê seu **Status Personalizado** com precisão em tempo real, concedendo cargo e **+200% de XP**!"
        },
        {
          name: "🍌 Painel Central (`!menu`) & Economia (`!loja`)",
          value: "Acesse todos os minigames, estatísticas de XP, forja e Proteção Parrudo pelo comando `!menu`!"
        }
      )
      .setFooter({ text: "Kabaré — BotBanana • Fique atento às novidades!" })
      .setTimestamp();

    if (files.length > 0) {
      embedAvisos.setImage("attachment://banner_kabare.png");
    }

    const msg = await channel.send({
      content: "||@everyone|| 📢 **ATENÇÃO KABARÉ — NOVIDADES E SORTEIO DE NITRO (META DE 100 MEMBROS)!**",
      embeds: [embedAvisos],
      files: files
    });

    console.log("✅ Announcement message sent successfully! Message ID:", msg.id);
  } catch (err) {
    console.error("❌ Error sending announcement message:", err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing in .env!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
