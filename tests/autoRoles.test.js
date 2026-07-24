const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getUserStats,
  checkMilionarioRole,
  recordSuccessfulSteal,
  recordGameWin,
  recordPrisonServed,
  recordDonationSent,
  recordShopPurchase,
  checkMaoDeVacaRole,
  addVoiceTime,
  recordActivityMessage,
  __setStatsDbForTests,
  __disableStatsSavingForTests
} = require("../scripts/features/autoRoles");

__disableStatsSavingForTests(true);

function createMockMember(id = "user1") {
  const grantedRoles = new Set();
  const mockRolesCache = {
    has: (roleId) => grantedRoles.has(roleId),
    add: async (roleId) => { grantedRoles.add(roleId); },
    find: (predicate) => {
      const allRoles = [
        { id: "r_milionario", name: "Milionário de Taubaté" },
        { id: "r_ladrao", name: "Ladrão" },
        { id: "r_campeao", name: "Campeão da Bagaça" },
        { id: "r_maodevaca", name: "Mão de Vaca" },
        { id: "r_voz1", name: "Voz Promissora" },
        { id: "r_ativo1", name: "Ativo" }
      ];
      return allRoles.find(predicate);
    }
  };

  const sentMessages = [];

  const mockGuild = {
    id: "guild1",
    roles: {
      cache: mockRolesCache,
      fetch: async () => mockRolesCache
    },
    channels: {
      cache: new Map([
        ["1528288031101026405", { send: async (payload) => sentMessages.push(payload) }]
      ])
    }
  };

  return {
    id,
    guild: mockGuild,
    roles: {
      cache: grantedRoles,
      add: async (roleId) => grantedRoles.add(roleId)
    },
    grantedRoles,
    sentMessages
  };
}

test("checkMilionarioRole grants role when coins >= 10000", async () => {
  __setStatsDbForTests({});
  const member = createMockMember("rich_user");

  await checkMilionarioRole(member, 5000);
  assert.equal(member.grantedRoles.has("r_milionario"), false);

  await checkMilionarioRole(member, 10000);
  assert.equal(member.grantedRoles.has("r_milionario"), true);
  assert.equal(member.sentMessages.length, 1);
});

test("recordSuccessfulSteal grants Ladrão role at 20 steals", async () => {
  __setStatsDbForTests({});
  const member = createMockMember("thief_user");

  for (let i = 0; i < 19; i++) {
    await recordSuccessfulSteal("thief_user", member);
  }
  assert.equal(member.grantedRoles.has("r_ladrao"), false);

  await recordSuccessfulSteal("thief_user", member);
  assert.equal(member.grantedRoles.has("r_ladrao"), true);
});

test("recordGameWin grants Campeão da Bagaça role at 30 wins", async () => {
  __setStatsDbForTests({});
  const member = createMockMember("gamer_user");

  for (let i = 0; i < 29; i++) {
    await recordGameWin("gamer_user", member);
  }
  assert.equal(member.grantedRoles.has("r_campeao"), false);

  await recordGameWin("gamer_user", member);
  assert.equal(member.grantedRoles.has("r_campeao"), true);
});

test("checkMaoDeVacaRole grants role when conditions are met", async () => {
  __setStatsDbForTests({});
  const member = createMockMember("stingy_user");

  await checkMaoDeVacaRole(member, 4000);
  assert.equal(member.grantedRoles.has("r_maodevaca"), false);

  // 5k+ NC com 0 doacoes
  await checkMaoDeVacaRole(member, 5000);
  assert.equal(member.grantedRoles.has("r_maodevaca"), true);
});

test("addVoiceTime grants voice role when hours threshold reached", async () => {
  __setStatsDbForTests({});
  const member = createMockMember("voice_user");

  // 6 horas (ainda nao atinge 7h)
  await addVoiceTime("voice_user", member, 6 * 3600 * 1000);
  assert.equal(member.grantedRoles.has("r_voz1"), false);

  // Mais 1 hora = 7h
  await addVoiceTime("voice_user", member, 1 * 3600 * 1000);
  assert.equal(member.grantedRoles.has("r_voz1"), true);
});

test("recordActivityMessage tracks 7-day window activity", async () => {
  __setStatsDbForTests({});
  const member = createMockMember("active_user");

  for (let i = 0; i < 499; i++) {
    await recordActivityMessage("active_user", member);
  }
  assert.equal(member.grantedRoles.has("r_ativo1"), false);

  await recordActivityMessage("active_user", member);
  assert.equal(member.grantedRoles.has("r_ativo1"), true);
});
