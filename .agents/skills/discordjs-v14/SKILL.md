---
name: discordjs-v14
description: Boas práticas e guias para trabalhar com Discord.js v14 no BotBanana.
---

# Desenvolvimento com Discord.js v14

Este projeto utiliza **Discord.js v14**. Ao criar comandos e interagir com a API do Discord, lembre-se das seguintes regras específicas da v14:

1. **Intents:** O client deve ser inicializado com as intents adequadas (ex: `GatewayIntentBits.Guilds`, `GatewayIntentBits.GuildMessages`, `GatewayIntentBits.MessageContent`).
2. **Embeds:** Na v14, use `EmbedBuilder` em vez de `MessageEmbed`.
3. **Botões e Componentes:** Use `ActionRowBuilder`, `ButtonBuilder`, `StringSelectMenuBuilder`. 
4. **Interações:** Ao responder a uma interação (slash command, botão ou menu), lembre-se de usar `interaction.reply()`, `interaction.deferReply()`, ou `interaction.editReply()`. As interações expiram em 3 segundos se não houver um `deferReply` ou `reply`.
