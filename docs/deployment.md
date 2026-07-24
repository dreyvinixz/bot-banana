# Deploy & Produção 🚀

O BotBanana foi projetado para rodar 24/7 sem interrupções. Ele suporta múltiplos ambientes de hospedagem, mas recomendamos o uso de Docker ou PM2 em uma VPS Linux para a melhor experiência.

---

## Opção 1: Docker Compose (Recomendado)

O Docker encapsula todo o ambiente (Node, FFmpeg, dependências) em um container isolado, garantindo que o bot funcione exatamente da mesma forma em qualquer máquina.

### Passos:
1. Clone o repositório na sua VPS:
   ```bash
   git clone https://github.com/dreyvinixz/bot-banana.git
   cd bot-banana
   ```
2. Configure as variáveis de ambiente:
   ```bash
   cp .env.example .env
   nano .env
   ```
3. Suba o container em background:
   ```bash
   docker-compose up -d --build
   ```

*(Nota: Os dados da pasta `data/` são mapeados como volumes para não serem perdidos quando o container for reiniciado).*

---

## Opção 2: PM2 (Gerenciador de Processos Node.js)

Se você preferir rodar nativamente (sem Docker), o PM2 é a melhor ferramenta para gerenciar o processo do Node, pois ele reinicia o bot em caso de crash e gerencia os logs automaticamente.

### Passos:
1. Instale o PM2 globalmente:
   ```bash
   npm install -g pm2
   ```
2. Inicie o BotBanana com o PM2:
   ```bash
   pm2 start index.js --name "bot-banana"
   ```
3. (Opcional) Configure o PM2 para iniciar junto com o sistema operacional:
   ```bash
   pm2 startup
   pm2 save
   ```
4. Para visualizar os logs em tempo real:
   ```bash
   pm2 logs bot-banana
   ```

---

## Opção 3: GitHub Actions (Deploy Contínuo)

Se você estiver em um fluxo de trabalho ágil, você não quer entrar na VPS para rodar `git pull` e reiniciar o bot manualmente toda vez que mudar uma linha de código.

No repositório, existe o arquivo `.github/workflows/deploy.yml`. 
Ele fará um deploy automático via SSH para a sua VPS sempre que a branch `main` receber um push.

### Configurando o Deploy Automático:
1. Vá até o seu repositório no GitHub.
2. Acesse `Settings` > `Secrets and variables` > `Actions`.
3. Adicione as seguintes variáveis (Repository Secrets):
   - `VPS_HOST`: O endereço IP da sua VPS (ex: `198.51.100.1`).
   - `VPS_USER`: O usuário da VPS (ex: `root` ou `ubuntu`).
   - `VPS_SSH_KEY`: A chave privada SSH (`id_rsa` ou `id_ed25519`) que permite acesso à sua VPS sem senha.

Pronto! Ao fazer um merge na `main`, a aba "Actions" do GitHub executará os testes e enviará o novo código direto para o seu servidor.
