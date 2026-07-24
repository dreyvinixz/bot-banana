---
name: botbanana-arch
description: Guia de arquitetura modular do projeto BotBanana. Use quando for criar novas funcionalidades no bot.
---

# Arquitetura Modular do BotBanana

O projeto é dividido em domínios dentro de `scripts/`. Quando criar um novo arquivo ou funcionalidade, coloque-o na pasta correta:

- `scripts/admin/`: Scripts de permissões, superadmins e comandos administrativos.
- `scripts/ai/`: Lógicas de integração com OpenAI, Gemini, ou outras IA.
- `scripts/app/`: Roteamento de eventos e inicialização (`client.on`).
- `scripts/core/`: Utilitários, storage (JSON), e resoluções compartilhadas.
- `scripts/economy/`: Sistemas de banco, inventário, roleta e lojas.
- `scripts/features/`: Comandos de boas-vindas, menu e auto roles.
- `scripts/games/`: Assaltos, boss fights, rpg e mini-games.
- `scripts/voice/`: Controle de canais de voz e integrações TTS.

## Banco de Dados Local
Os dados dos usuários e servidores são armazenados na pasta `data/`. Ao criar um sistema que exige persistência, não crie conexões com bancos externos sem necessidade; utilize o sistema de storage JSON nativo do projeto (ver `scripts/core/`).
