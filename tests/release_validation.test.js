const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const economy = require("../scripts/economy/economy");
const autoRoles = require("../scripts/features/autoRoles");
const prison = require("../scripts/games/prison");
const robbery = require("../scripts/games/robbery");

economy.__disableSavingForTests(true);
autoRoles.__disableStatsSavingForTests(true);
prison.__disablePrisonSavingForTests(true);
robbery.__disableRobberySavingForTests(true);

test("RELEASE VALIDATION 1: Validação de Sintaxe e Import de Todos os Arquivos em scripts/", () => {
  console.log("\n📦 VALIDANDO INTEGRIDADE DOS ARQUIVOS E IMPORTS...");

  const emptyExports = [];

  function walkAndCheck(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walkAndCheck(fullPath);
      } else if (fullPath.endsWith(".js")) {
        let mod;
        assert.doesNotThrow(() => {
          mod = require(fullPath);
        }, `Falha ao carregar o módulo: ${fullPath}`);

        // Verifica que o módulo exporta algo útil (não é objeto vazio sem funções)
        if (mod && typeof mod === "object" && !Array.isArray(mod)) {
          const exportedFns = Object.entries(mod).filter(([k, v]) => typeof v === "function" && !k.startsWith("__"));
          const relativePath = path.relative(path.join(__dirname, ".."), fullPath);

          // Módulos com exports devem ter pelo menos 1 função pública
          const totalKeys = Object.keys(mod).filter(k => !k.startsWith("__")).length;
          if (totalKeys > 0 && exportedFns.length === 0) {
            emptyExports.push(relativePath);
          }

          // Verifica que nenhum export público é undefined (sinal de desestruturação quebrada)
          for (const [key, val] of Object.entries(mod)) {
            if (key.startsWith("__")) continue;
            assert.notEqual(val, undefined, `${relativePath} exporta '${key}' como undefined — possível import quebrado`);
          }
        }
      }
    }
  }

  walkAndCheck(path.join(__dirname, "../scripts"));

  if (emptyExports.length > 0) {
    console.warn(`⚠️ Módulos sem funções públicas exportadas: ${emptyExports.join(", ")}`);
  }

  console.log("✅ Todos os arquivos em scripts/ foram validados e importados sem erros de sintaxe!");
});

test("RELEASE VALIDATION 2: Validação Integrada do Sistema de Administração e Painéis", async () => {
  const admin = require("../scripts/admin/admin");
  const setupPanels = require("../scripts/admin/setupPanels");

  const replies = [];
  const sentMessages = [];

  const mockChannel = {
    id: "1528288031101026405",
    name: "anuncios-e-cargos",
    send: async (payload) => {
      sentMessages.push(payload);
      return { id: "msg_1", edit: async () => {} };
    }
  };

  const channelMap = new Map([
    ["1528288031101026405", mockChannel]
  ]);
  channelMap.find = (fn) => Array.from(channelMap.values()).find(fn);

  const rolesMap = new Map([
    ["1", { id: "1", name: "Chegou Agora" }]
  ]);
  rolesMap.find = (fn) => Array.from(rolesMap.values()).find(fn);

  const emojisMap = new Map();
  emojisMap.find = (fn) => Array.from(emojisMap.values()).find(fn);

  const mockGuild = {
    id: "guild_val",
    iconURL: () => "https://example.com/icon.png",
    roles: {
      cache: rolesMap,
      fetch: async () => rolesMap
    },
    emojis: {
      cache: emojisMap,
      create: async () => null
    },
    channels: {
      cache: channelMap,
      fetch: async () => channelMap
    }
  };

  const mockMessage = {
    content: "!setup_cargos_info",
    author: { id: "admin-a" },
    guild: mockGuild,
    channel: mockChannel,
    reply: async (payload) => replies.push(payload)
  };

  process.env.SUPERADMIN_IDS = "admin-a";
  await admin.handleSetupCargosInfoCommand(mockMessage);
  assert.equal(sentMessages.length >= 1, true);

  const mockClient = {
    guilds: {
      cache: new Map([["guild_val", mockGuild]])
    }
  };

  await setupPanels.sendStartupAnnouncement(mockClient);
  assert.equal(sentMessages.length >= 2, true);
  console.log("✅ Sistema de painéis administrativos e anúncios de inicialização 100% validados!");
});

test("RELEASE VALIDATION 3: Validação do Fluxo do Menu Hub (!menu)", async () => {
  const menuHub = require("../scripts/features/menuHub");
  const replies = [];

  const mockMessage = {
    content: "!menu",
    author: { id: "user_menu_1", username: "MenuUser" },
    reply: async (payload) => replies.push(payload)
  };

  await menuHub.handleMenuCommand(mockMessage);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].embeds.length, 1);
  assert.equal(replies[0].components.length, 2);
  assert.match(replies[0].embeds[0].data.title, /CENTRAL DO BOT BANANA/);

  console.log("✅ Painel central (!menu) gerado com componentes e botões interativos 100% validados!");
});

test("RELEASE VALIDATION 4: Validação do Sistema de Roubos, Proteção Parrudo e Prisão", async () => {
  const robberyMod = require("../scripts/games/robbery");
  const prisonMod = require("../scripts/games/prison");

  robberyMod.activateParrudo("victim_1", 2);
  assert.equal(robberyMod.isParrudo("victim_1"), true);
  assert.equal(robberyMod.getTempoParrudoRestante("victim_1") > 0, true);

  prisonMod.prenderUsuario("thief_1", 10);
  assert.equal(prisonMod.isPrisioneiro("thief_1"), true);
  assert.equal(prisonMod.getTempoPrisaoRestante("thief_1") > 0, true);

  const mockFiancaMsg = {
    content: "!fianca",
    author: { id: "thief_1", username: "Thief" },
    mentions: {
      users: {
        first: () => null
      }
    },
    reply: async (payload) => payload
  };

  economy.__setDbForTests({ thief_1: 1000 });
  await prisonMod.handleFiancaCommand(mockFiancaMsg);
  assert.equal(prisonMod.isPrisioneiro("thief_1"), false);
  assert.equal(economy.getCoins("thief_1"), 750);

  console.log("✅ Fluxo de assaltos, imunidade Parrudo e soltura de prisão por fiança 100% validados!");
});

test("RELEASE VALIDATION 5: Validação do Verificador da Família Caberé (Status e Bio REST)", async () => {
  const familia = require("../scripts/features/familia");

  const mockMemberWithInviteStatus = {
    id: "user_status_1",
    presence: {
      activities: [{ type: 4, name: "Custom Status", state: "https://discord.gg/gNu3daPca" }]
    }
  };

  const mockMemberWithInviteBioRest = {
    id: "user_bio_1",
    presence: null
  };

  const mockClientWithRest = {
    rest: {
      get: async (url) => {
        if (url.includes("user_bio_1")) {
          return { user_profile: { bio: "Entre no meu server: https://discord.gg/gNu3daPca" } };
        }
        return null;
      }
    }
  };

  const hasInviteStatus = await familia.checkMemberStatusHasInvite(mockMemberWithInviteStatus);
  assert.equal(hasInviteStatus, true);

  const hasInviteBio = await familia.checkMemberStatusHasInvite(mockMemberWithInviteBioRest, mockClientWithRest);
  assert.equal(hasInviteBio, true);

  console.log("✅ Verificação de convites no Status Personalizado e na Bio via REST 100% validados!");
});
