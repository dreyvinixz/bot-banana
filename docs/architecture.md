# Arquitetura do BotBanana

O **BotBanana** foi construído seguindo rigorosos padrões de arquitetura modular. Para garantir escalabilidade e fácil manutenção (conforme descrito na skill `botbanana-arch`), o projeto separa responsabilidades de forma clara e evita alto acoplamento entre sistemas.

## 🏗️ Estrutura de Diretórios (`scripts/`)

Todo o domínio de lógica de negócio está contido na pasta `scripts/`, dividida em 8 domínios principais:

- **`admin/`**: Scripts dedicados às permissões, configurações de SuperAdmins e geradores de painéis do servidor (Cargos, Regras, Setup).
- **`ai/`**: Centraliza a integração com IA. Seja a OpenAI ou Gemini, a lógica de geração de prompts e parsing das respostas da Inteligência Artificial acontece aqui.
- **`app/`**: Responsável pelo core do Discord. Instancia o `client` do Discord.js, roteia os eventos (como `messageCreate` e `interactionCreate`) e gerencia a inicialização do Bot.
- **`core/`**: O "coração" utilitário. Gerencia leitura e gravação no banco de dados JSON (`storage`), processa os arquivos `.env`, cria utilitários globais (como funções RNG criptograficamente seguras em `random.js`), valida usuários e controla agendadores.
- **`economy/`**: Toda a infraestrutura bancária do jogo. Banco Central (Nanacoins), inventário de jogadores, loja, mercado global de trocas e forja de itens de RPG.
- **`features/`**: Funcionalidades gerais para o usuário do Discord. Sistemas como Auto-roles por XP, mensagens automáticas de Boas-Vindas, integração com as regras do clã (ex: "Família Caberé"), e o menu hub principal (`!menu`).
- **`games/`**: Regras isoladas de mini-games. Duelos, assaltos (`!roubar`), Boss Fights, e o jogo da Forca. Tudo o que for gamificação fica aqui.
- **`voice/`**: Módulo que lida com canais de voz do Discord. Toca áudios, lê mensagens de texto através de Text-To-Speech (TTS) e controla as filas de música/voz usando o pacote `@discordjs/voice`.

## 💾 Persistência de Dados (Database Local)

O BotBanana toma a decisão arquitetural de **não depender de um SGBD externo** (como MongoDB, PostgreSQL, etc.) inicialmente, priorizando a simplicidade de self-hosting.

Toda a persistência ocorre através de arquivos `.json` gravados dentro da pasta `data/`.
O arquivo `scripts/core/storage.js` gerencia isso criando _Debounced JSON Writers_. Ou seja, as operações de leitura são feitas inteiramente na memória RAM (`db = {}`) para velocidade máxima (O(1)), e as escritas no disco (`fs.writeFile`) são enfileiradas e agrupadas a cada intervalo de tempo para evitar travamentos de I/O bloqueante (I/O Bottleneck).

## 🔀 Injeção de Dependências e Coesão

Quando estiver programando novas funções:
1. **Mantenha Alta Coesão**: Se você criar uma lógica sobre "Assaltos", ela deve ficar no módulo `games/robbery.js` e não espalhada no `index.js`.
2. **Utilize o `core/config.js`**: Não utilize `process.env` diretamente no meio do código. Sempre adicione as variáveis no `config.js` e puxe de lá, pois o `config` injeta fallbacks padrão.
3. **Cuidado com Loops Assíncronos**: Para não estourar o limite de conexões (Rate Limit do Discord e da IA), operações que mandam múltiplas mensagens usam delays internos gerenciados pelo `core/`.
