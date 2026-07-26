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
    const channelId = "1529584034869678171";
    let channel = client.channels.cache.get(channelId);

    if (!channel && client.channels.fetch) {
      channel = await client.channels.fetch(channelId).catch(() => null);
    }

    if (!channel) {
      console.error(`❌ Channel ${channelId} not found! Searching by name...`);
      for (const guild of client.guilds.cache.values()) {
        const found = guild.channels.cache.find(c => c.name.includes("sortei") || c.name.includes("sorteio"));
        if (found) {
          channel = found;
          break;
        }
      }
    }

    if (!channel) {
      console.error("❌ Sorteio channel not found anywhere!");
      process.exit(1);
    }

    console.log(`Found channel: ${channel.name} (${channel.id})`);

    const guild = channel.guild;
    const guildIcon = guild?.iconURL({ dynamic: true, size: 512 }) || null;

    const embed = new EmbedBuilder()
      .setColor("#FF73FA")
      .setTitle("🎁 SORTEIO: 1x DISCORD NITRO 🚀")
      .setDescription("Reaja com **🎉** abaixo para participar!")
      .setThumbnail(guildIcon)
      .setFooter({ text: "Kabaré • Boa sorte!" });

    const sentMsg = await channel.send({
      content: "@everyone 🎉 **SORTEIO DE DISCORD NITRO!**",
      embeds: [embed]
    });

    await sentMsg.react("🎉").catch(() => null);

    console.log("✅ Nitro Giveaway message sent successfully! Message ID:", sentMsg.id);
  } catch (err) {
    console.error("❌ Error sending sorteio message:", err);
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
