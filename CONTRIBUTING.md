# 🤝 Guia de Contribuição — BotBanana

Agradecemos o seu interesse em contribuir para o **BotBanana (BotTTs)**! Este documento descreve as diretrizes para enviar melhorias, correções de bugs e novas funcionalidades.

---

## 🛠️ Como Começar

1. **Faça um Fork** do repositório no GitHub.
2. **Clone** a sua cópia para a máquina local:
   ```bash
   git clone https://github.com/SEU_USUARIO/botTTs.git
   cd botTTs
   ```
3. Crie uma **Branch** para a sua funcionalidade ou correção:
   ```bash
   git checkout -b feature/nome-da-feature
   ```
4. Instale as dependências:
   ```bash
   npm install
   ```

---

## 📐 Padrões de Código

- Mantenha os arquivos pequenos e modulares (entre 100 e 300 linhas por arquivo).
- Preserve comentários e docstrings existentes.
- Não altere assinaturas de API públicas existentes sem atualizar seus locais de chamada.
- Adicione testes unitários para qualquer nova funcionalidade.

---

## 🧪 Testes e Validação

Antes de enviar a sua contribuição, garanta que **todos os testes passam**:

```bash
# Verificar sintaxe dos arquivos JavaScript
npm run check

# Executar suíte completa de 94+ testes
npm test
```

---

## 📩 Enviando Pull Requests (PR)

1. Envie suas alterações para a sua branch remota:
   ```bash
   git push origin feature/nome-da-feature
   ```
2. Abra um **Pull Request** direcionado para a branch `main` do repositório principal.
3. Descreva claramente o que a alteração faz e anexe os resultados dos testes.

---

Obrigado por apoiar a comunidade open-source! 🍌
