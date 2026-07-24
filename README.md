# 🍌 BotBanana (`bot-banana`) — Discord Bot Framework

[![CI Pipeline](https://github.com/dreyvinixz/bot-banana/actions/workflows/ci.yml/badge.svg)](https://github.com/dreyvinixz/bot-banana/actions/workflows/ci.yml)
[![CodeQL Security](https://github.com/dreyvinixz/bot-banana/actions/workflows/codeql.yml/badge.svg)](https://github.com/dreyvinixz/bot-banana/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Discord.js Version](https://img.shields.io/badge/discord.js-v14.21.0-blue.svg)](https://discord.js.org)

O **BotBanana** é um framework hiper-modular desenvolvido em Node.js e Discord.js. Ele transforma servidores do Discord em comunidades altamente engajadas através de economia virtual, auto-roles por atividade, IA integrada, RPG de mesa interativo e assaltos PVP.

---

## 📖 Wiki & Documentação Oficial

Movimentamos toda a documentação avançada para a nossa Wiki! Consulte os links abaixo para masterizar o bot:

- 🏠 **[Página Inicial da Wiki](docs/Home.md)**: Explore todos os guias e manuais de recursos do bot.
- 🏗️ **[Arquitetura de Software](docs/architecture.md)**: Descubra como a engine do bot funciona sob o capô, os 8 domínios e a infraestrutura do banco de dados (ideal para desenvolvedores).
- 🚀 **[Guia de Deploy Automático](docs/deployment.md)**: Manuais detalhados para rodar o bot no PM2, no Docker Compose, ou automatizar atualizações pelo GitHub Actions na sua VPS Linux.

---

## ✨ Principais Funcionalidades

- 🏆 **Auto Roles & Conquistas Automáticas**: Atribuição automática de cargos por XP de texto, tempo em chamadas de voz e atividade semanal.
- 💰 **Economia & Banco Virtual**: Sistema de saldo, transferências, Mercado Global e Bolsa de Valores de Itens.
- 🥷 **Sistema de Assaltos & Prisão**: Comando `!roubar` PvP, itens estratégicos defensivos/ofensivos (Escudo de Espinhos) e sistema de fiança.
- ⚔️ **Guerras de Servidores (Raids)**: Disputa estratégica e roubos massivos interservidores (Cross-Guild).
- 🐉 **World Boss & Mini Boss**: Lutas contra monstros de fase, ranking de dano cooperativo, e forja de armas.
- 🍌 **Menu Hub Central (`!menu`)**: Navegação fluida com UI limpa via Message Components (Select Menus e botões interativos).
- 🎬 **Integração IA e Voz**: Integração robusta com a API do Gemini e da OpenAI, Geração de imagens via Stable Diffusion (Forge) e envio automático de clipes (Reels) usando Edge-TTS e Google WaveNet.

---

## 💻 Começando (Instalação Local)

Se você é desenvolvedor e quer rodar o bot no seu PC para testar, siga os passos abaixo:

### Pré-requisitos
- **Node.js**: `>= 18.0.0`
- Aplicação criada no [Discord Developer Portal](https://discord.com/developers/applications) com a intent **GUILD_MEMBERS** ativada.

### Rodando o Bot

```bash
# 1. Clone o projeto e entre na pasta
git clone https://github.com/dreyvinixz/bot-banana.git
cd bot-banana

# 2. Instale os pacotes e dependências
npm ci

# 3. Defina seus tokens e credenciais
cp .env.example .env

# 4. (Opcional) Valide a integridade do código com nossa suíte automatizada de testes
npm test

# 5. Inicialize a engine
npm start
```

---

## 📜 Licença

Distribuído sob a licença [MIT](LICENSE).

Desenvolvido por **[dreyvinixz](https://github.com/dreyvinixz)** & **Comunidade Caberé**.
