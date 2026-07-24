# 🍌 BotBanana (`bot-banana`) — Discord Bot Framework

[![CI Pipeline](https://github.com/dreyvinixz/bot-banana/actions/workflows/ci.yml/badge.svg)](https://github.com/dreyvinixz/bot-banana/actions/workflows/ci.yml)
[![CodeQL Security](https://github.com/dreyvinixz/bot-banana/actions/workflows/codeql.yml/badge.svg)](https://github.com/dreyvinixz/bot-banana/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Discord.js Version](https://img.shields.io/badge/discord.js-v14.21.0-blue.svg)](https://discord.js.org)

O **BotBanana** é uma aplicação completa e modular desenvolvida em Node.js e Discord.js para gestão de comunidades, gamificação, economia virtual, mini-games, moderação e inteligência artificial no Discord.

---

## ✨ Principais Funcionalidades

- 🏆 **Auto Roles & Conquistas Automáticas**: Atribuição automática de cargos por XP de texto, tempo em chamadas de voz, atividade semanal e conquistas (`Milionário de Taubaté`, `Ladrão`, `Campeão da Bagaça`, `Mão de Vaca`).
- 💰 **Economia & Banco Virtual**: Sistema de saldo, transferências (`!doar`), roleta diária (`!daily`), ranking de milionários (`!rank`), bolsa de valores e mercado entre jogadores.
- 🏪 **Loja & Proteção Parrudo**: Compra de proteções temporárias contra roubos (1h, 2h, 5h, 10h), lootboxes, materiais e consumíveis.
- 🥷 **Sistema de Assaltos & Prisão**: Comando `!roubar` com probabilidade calculada, itens de invasão (Ácido Corrosivo, Pé de Cabra), contra-ataques (Escudo de Espinhos) e tempo de prisão com sistema de fiança (`!timeout`, `!fianca`).
- ⚔️ **Guerras de Servidores (Raids)**: Disputa estratégica e guerras econômicas interservidores.
- 🐉 **Combates contra World Boss & Mini Boss**: Invocação de monstros com fases, ranking de dano, recompensas e loot.
- 🍌 **Menu Hub Central (`!menu`)**: Painel único navegável com botões interativos e select menu para fácil acesso a todos os recursos.
- 💖 **Verificação da Família (+200% XP)**: Leitura dupla no **Status Personalizado** e na **Bio** (via endpoint REST de perfil) com bônus de experiência imediato.
- 🎬 **Mídia, Reels & Voz (TTS)**: Envio automatizado de Reels diários, comandos de imagens por IA e sintetizador de voz nos canais de voz (`!f`).

---

## 🏗️ Estrutura da Arquitetura

O projeto é construído sobre uma arquitetura modular, onde cada responsabilidade é mantida em subpacotes isolados:

```text
bot-banana/
├── scripts/
│   ├── admin/          # Permissões, superadmins e geradores de painéis
│   ├── ai/             # Integração com OpenAI e Gemini
│   ├── app/            # Inicialização do client e roteamento de eventos
│   ├── core/           # Configurações, storage, utilitários e resolvers
│   ├── economy/        # Banco, loja, mercado, forja, bolsas e inventário
│   ├── features/       # Auto roles, boas-vindas, menu hub, reels, faq, família
│   ├── games/          # Duelos, assaltos, prisão, boss, forca e RPG
│   └── voice/          # Sintetizador de áudio e gerenciamento de chamadas
├── data/               # Banco de dados baseado em JSON persistente
├── tests/              # Suíte completa de 94 testes unitários e de integração
├── .github/workflows/  # CI/CD Workflows para GitHub Actions
└── index.js            # Ponto de entrada da aplicação
```

---

## 🚀 Como Executar o Projeto

### Pré-requisitos

- **Node.js**: Versão `>= 18.0.0`
- **npm**: Versão `>= 9.0.0`
- **Bot no Discord**: Aplicação criada no [Discord Developer Portal](https://discord.com/developers/applications) com a intent **Server Members Intent (GUILD_MEMBERS)** ativada.

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/dreyvinixz/botTTs.git
cd botTTs
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as Variáveis de Ambiente:
Copie o arquivo `.env.example` para `.env` e preencha suas credenciais:
```bash
cp .env.example .env
```

4. Execute a suíte de testes locais:
```bash
npm test
```

5. Inicie a aplicação:
```bash
npm start
```

---

## 🧪 Testes Automatizados

O projeto conta com **94 testes unitários e de integração** validados em pipeline de CI:

- **Executar todos os testes:** `npm test`
- **Executar verificação de sintaxe:** `npm run check`
- **Executar teste de validação de lançamento:** `node --test tests/release_validation.test.js`

---

## 🚀 Deployments & Produção

O **BotBanana** suporta múltiplos métodos de implantação em produção:

### 1. Docker & Docker Compose (Recomendado)
Execute a aplicação isolada em container com volumes para persistência de dados:
```bash
docker-compose up -d --build
```

### 2. PM2 Process Manager (Servidores Linux / VPS)
Gerencie o processo em segundo plano com auto-restart e logs rotacionados:
```bash
# Instalar PM2 globalmente se necessário
npm install -g pm2

# Iniciar o bot via PM2
pm2 start ecosystem.config.js --env production
```

### 3. GitHub Actions CD (Implantador Automático)
O repositório inclui o workflow em `.github/workflows/deploy.yml`. Basta configurar os Secrets no seu repositório GitHub (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`) para que cada commit na branch `main` atualize seu servidor de produção automaticamente!

---

## 📜 Licença

Este projeto está sob a licença [MIT](LICENSE).

---

Desenvolvido por **[dreyvinixz](https://github.com/dreyvinixz)** & **Comunidade Caberé**.
