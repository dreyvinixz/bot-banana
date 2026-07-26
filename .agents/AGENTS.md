# Regras do Projeto BotBanana

1. **Stack Tecnológica:** Este é um bot para Discord utilizando **Node.js (v18+)** e **Discord.js (v14)**.
2. **Arquitetura Modular:** O projeto é estritamente modular. Nenhuma lógica pesada deve ficar no `index.js`. Todo código deve ser colocado nos subdiretórios de `scripts/` correspondentes (`economy/`, `games/`, `features/`, etc.).
3. **Persistência de Dados:** O bot utiliza um banco de dados local baseado em JSON (armazenado na pasta `data/`). Se for necessário interagir com dados persistentes, siga os padrões existentes no sistema em `scripts/core/`.
4. **Variáveis de Ambiente:** Nunca altere ou hardcode variáveis secretas (tokens, chaves da OpenAI, etc.). Use sempre `process.env` e o arquivo `.env`.
5. **Testes:** Ao criar novas funcionalidades, certifique-se de que os testes locais (via `npm test` e módulo nativo `node:test`) continuam passando.
6. **Grafia do Servidor:** O nome do servidor é sempre escrito com **K**: **Kabaré** / **Kabare** (nunca com "C").
7. **Menção @everyone:** Sempre que mencionar @everyone em mensagens ou anúncios, a tag deve ser marcada obrigatoriamente como spoiler: `||@everyone||`.

