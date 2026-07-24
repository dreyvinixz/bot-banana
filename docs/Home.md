# Bem-vindo à Wiki do BotBanana! 🍌

O **BotBanana** é um framework completo para Discord focado em engajamento, gamificação profunda, RPG de economia e automações avançadas com Inteligência Artificial.

Aqui na Wiki, você encontra todas as informações necessárias para operar, entender, configurar e estender o BotBanana no seu próprio servidor de Discord.

---

## 📚 Índice da Documentação

### 🛠️ Para Administradores (Setup)
Aprenda como colocar o bot para rodar e configurá-lo no seu servidor:
- **[Deploy e Hospedagem (Produção)](deployment.md)**: Como manter o bot online 24/7 usando Docker, PM2 ou Deploy automatizado via GitHub Actions.
- **[Instalação Rápida (README)](../README.md)**: Passos para rodar localmente no seu computador.
- **[Variáveis de Ambiente (`.env`)](../.env.example)**: Lista de tokens e IDs obrigatórios.

### 🧠 Para Desenvolvedores (Código)
Entenda como a lógica do BotBanana funciona sob o capô:
- **[Arquitetura e Modularidade](architecture.md)**: Guia completo de como o projeto é dividido (Pastas, Injeção de dependências e Persistência).
- **Testes Automatizados**: Como funciona a suíte nativa (`node:test`) de 94 testes e como garantir que suas implementações não quebrem o bot.

### 🎮 Recursos do Jogo (Em Breve)
*(Estas páginas podem ser criadas para detalhar mecânicas específicas aos jogadores)*
- **Sistema de Economia**: Como as Nanacoins funcionam, limites de doação, taxas e Mercado Global.
- **Guerras & Raids**: Mecânica de Invasão de Servidores e compra de Proteções (Escudos e Estandartes).
- **Inteligência Artificial (Caberé IA)**: Como o bot reage a conversas, lê fóruns, cria imagens via Forge e fala nos canais de voz via TTS.

---

> [!TIP]
> **Contribuições são bem-vindas!** 
> Para adicionar novos recursos, não se esqueça de ler o arquivo de [Arquitetura](architecture.md) para garantir que seu código respeite o design modular.
