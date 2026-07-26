const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getLevelFromTotalXp,
  getTotalXpForLevel,
  createProgressBar,
  getEligibleRoleForLevel,
  getUserXpStats,
  grantXpToUser,
  __setXpDbForTests,
  __disableXpSavingForTests
} = require("../scripts/features/xp");

__disableXpSavingForTests(true);

test("getLevelFromTotalXp e getTotalXpForLevel calculam níveis corretamente", () => {
  assert.equal(getLevelFromTotalXp(0), 1);
  assert.equal(getLevelFromTotalXp(50), 1);
  assert.equal(getLevelFromTotalXp(100), 2);
  assert.equal(getLevelFromTotalXp(300), 3);
  assert.equal(getLevelFromTotalXp(4500), 10);

  assert.equal(getTotalXpForLevel(1), 0);
  assert.equal(getTotalXpForLevel(2), 100);
  assert.equal(getTotalXpForLevel(3), 300);
  assert.equal(getTotalXpForLevel(10), 4500);
});

test("createProgressBar formata barras visuais corretamente", () => {
  const bar0 = createProgressBar(0, 100, 10);
  assert.equal(bar0, "[░░░░░░░░░░] 0%");

  const bar50 = createProgressBar(50, 100, 10);
  assert.equal(bar50, "[█████░░░░░] 50%");

  const bar100 = createProgressBar(100, 100, 10);
  assert.equal(bar100, "[██████████] 100%");
});

test("getEligibleRoleForLevel seleciona o cargo correto de acordo com a hierarquia", () => {
  assert.equal(getEligibleRoleForLevel(1).name, "🥚 Chegou Agora");
  assert.equal(getEligibleRoleForLevel(5).name, "🥚 Chegou Agora");
  assert.equal(getEligibleRoleForLevel(10).name, "🪑 Sentou na Resenha");
  assert.equal(getEligibleRoleForLevel(24).name, "🪑 Sentou na Resenha");
  assert.equal(getEligibleRoleForLevel(25).name, "💬 Já É de Casa");
  assert.equal(getEligibleRoleForLevel(50).name, "🤡 Agente do Caos");
  assert.equal(getEligibleRoleForLevel(100).name, "👑 Lenda da Resenha");
});

test("getUserXpStats fornece informações de nivel, progresso e ranking", () => {
  __setXpDbForTests({
    "user1": { xp: 500, level: 3, messagesCount: 20 },
    "user2": { xp: 1200, level: 4, messagesCount: 50 }
  });

  const stats1 = getUserXpStats("user1");
  assert.equal(stats1.xp, 500);
  assert.equal(stats1.level, 3);
  assert.equal(stats1.rank, 2);

  const stats2 = getUserXpStats("user2");
  assert.equal(stats2.xp, 1200);
  assert.equal(stats2.rank, 1);
});

test("grantXpToUser envia menção em content ao subir de nível para notificar o usuário", async () => {
  __setXpDbForTests({
    "user_levelup": { xp: 95, level: 1, lastXpTimestamp: 0, messagesCount: 5 }
  });

  let sentPayload = null;
  const mockChannel = {
    send: async (payload) => {
      sentPayload = payload;
    }
  };

  const mockGuild = {
    channels: {
      cache: {
        get: (id) => (id === "1529586599099371550" ? mockChannel : null),
        find: () => null
      }
    }
  };

  await grantXpToUser("user_levelup", null, mockGuild);

  assert.ok(sentPayload, "Mensagem de level up deveria ter sido enviada");
  assert.equal(sentPayload.content, "<@user_levelup>");
  assert.ok(sentPayload.embeds && sentPayload.embeds.length > 0);
});

test("syncUserRoles atribui cargo correto por ID e por Nome fallback (ex: Nível 10 - Sentou na Resenha)", async () => {
  const { syncUserRoles } = require("../scripts/features/xp");

  const addedRoleIds = [];
  const removedRoleIds = [];

  const userRolesCache = new Set(["1528295137493516389"]); // possui o cargo de nível 1

  const mockMember = {
    id: "user_test_roles",
    roles: {
      cache: {
        has: (id) => userRolesCache.has(id),
        add: async (id) => { userRolesCache.add(id); }
      },
      add: async (id) => {
        addedRoleIds.push(id);
        userRolesCache.add(id);
      },
      remove: async (id) => {
        removedRoleIds.push(id);
        userRolesCache.delete(id);
      }
    }
  };

  const mockGuild = {
    roles: {
      cache: {
        has: (id) => id === "1528295135572656234" || id === "1528295137493516389",
        get: (id) => {
          if (id === "1528295135572656234") return { id: "1528295135572656234", name: "🪑 Sentou na Resenha" };
          if (id === "1528295137493516389") return { id: "1528295137493516389", name: "🥚 Chegou Agora" };
          return null;
        },
        find: (fn) => [
          { id: "1528295135572656234", name: "🪑 Sentou na Resenha" },
          { id: "1528295137493516389", name: "🥚 Chegou Agora" }
        ].find(fn)
      }
    }
  };

  // Executar sincronização para Nível 10
  await syncUserRoles(mockMember, 10, mockGuild);

  assert.ok(addedRoleIds.includes("1528295135572656234"), "Deveria ter adicionado o cargo Sentou na Resenha");
  assert.ok(removedRoleIds.includes("1528295137493516389"), "Deveria ter removido o cargo antigo Chegou Agora");
});

test("syncUserRoles realiza fallback por nome caso o ID do cargo no Discord tenha mudado", async () => {
  const { syncUserRoles } = require("../scripts/features/xp");

  const addedRoleIds = [];

  const mockMember = {
    id: "user_name_fallback",
    roles: {
      cache: {
        has: () => false
      },
      add: async (id) => {
        addedRoleIds.push(id);
      },
      remove: async () => {}
    }
  };

  // Servidor onde o ID mudou para "new_role_id_999", mas o nome é "Sentou na Resenha"
  const mockGuild = {
    roles: {
      cache: {
        has: () => false,
        get: () => null,
        find: (fn) => {
          const sampleRoles = [
            { id: "new_role_id_999", name: "Sentou na Resenha" }
          ];
          return sampleRoles.find(fn);
        }
      },
      fetch: async () => ({
        has: () => false,
        get: () => null,
        find: (fn) => {
          const sampleRoles = [
            { id: "new_role_id_999", name: "Sentou na Resenha" }
          ];
          return sampleRoles.find(fn);
        }
      })
    }
  };

  await syncUserRoles(mockMember, 10, mockGuild);

  assert.ok(addedRoleIds.includes("new_role_id_999"), "Deveria ter encontrado e adicionado o cargo pelo nome fallback");
});

