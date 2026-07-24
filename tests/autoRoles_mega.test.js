const test = require("node:test");
const assert = require("node:assert/strict");
const economy = require("../scripts/economy/economy");
const duel = require("../scripts/games/duel");
const {
  getUserStats,
  recordSuccessfulSteal,
  recordGameWin,
  recordPrisonServed,
  recordDonationSent,
  recordShopPurchase,
  checkMilionarioRole,
  checkMaoDeVacaRole,
  addVoiceTime,
  recordActivityMessage,
  __setStatsDbForTests,
  __disableStatsSavingForTests
} = require("../scripts/features/autoRoles");

economy.__disableSavingForTests(true);
__disableStatsSavingForTests(true);

function createTestGuildMember(userId, username = "Player") {
  const grantedRoles = new Map();
  const mockRolesCache = {
    has: (roleId) => grantedRoles.has(roleId),
    add: async (roleId) => { grantedRoles.set(roleId, true); },
    find: (predicate) => {
      const serverRoles = [
        { id: "role_milionario", name: "Milionário de Taubaté" },
        { id: "role_ladrao", name: "Ladrão" },
        { id: "role_campeao", name: "Campeão da Bagaça" },
        { id: "role_maodevaca", name: "Mão de Vaca" },
        { id: "role_voz_promissora", name: "Voz Promissora" },
        { id: "role_amante_conversas", name: "Amante das Conversas" },
        { id: "role_mestre_calls", name: "Mestre das Calls" },
        { id: "role_dono_podcast", name: "Dono de Podcast" },
        { id: "role_voz_suprema", name: "Voz Suprema" },
        { id: "role_ativo", name: "Ativo" },
        { id: "role_super_ativo", name: "Super Ativo" },
        { id: "role_extremamente_ativo", name: "Extremamente Ativo" }
      ];
      return serverRoles.find(predicate);
    }
  };

  const channelAnnouncements = [];

  const mockGuild = {
    id: "guild_mega",
    roles: {
      cache: mockRolesCache,
      fetch: async () => mockRolesCache
    },
    channels: {
      cache: new Map([
        ["1528288031101026405", {
          id: "1528288031101026405",
          send: async (payload) => { channelAnnouncements.push(payload); }
        }]
      ])
    }
  };

  return {
    id: userId,
    user: { id: userId, username },
    guild: mockGuild,
    roles: {
      cache: grantedRoles,
      add: async (roleId) => { grantedRoles.set(roleId, true); }
    },
    grantedRoles,
    channelAnnouncements
  };
}

test("MEGA SIMULAÇÃO: Ciclo de Conquistas de Cargos por Roubo, Economia e Games", async () => {
  __setStatsDbForTests({});
  const member = createTestGuildMember("player_mega_1", "MegaPlayer1");

  console.log("\n🔥 INICIANDO MEGA TESTE DE CARGOS E ANÚNCIOS...");

  // 1. Simular 20 Roubos Bem-sucedidos
  console.log("➡️ Simulando 20 roubos bem-sucedidos...");
  for (let i = 1; i <= 20; i++) {
    await recordSuccessfulSteal("player_mega_1", member);
  }
  assert.equal(member.grantedRoles.has("role_ladrao"), true);
  assert.equal(getUserStats("player_mega_1").stealsCount, 20);

  // 2. Simular 30 Vitórias em Games
  console.log("➡️ Simulando 30 vitórias em mini-games...");
  for (let i = 1; i <= 30; i++) {
    await recordGameWin("player_mega_1", member);
  }
  assert.equal(member.grantedRoles.has("role_campeao"), true);
  assert.equal(getUserStats("player_mega_1").gameWins, 30);

  // 3. Simular Acúmulo de Fortuna de 10.000 NC (Milionário de Taubaté)
  console.log("➡️ Simulando acúmulo de saldo bancário (10k+ NC)...");
  economy.__setDbForTests({ player_mega_1: 10500 });
  await checkMilionarioRole(member, 10500);
  assert.equal(member.grantedRoles.has("role_milionario"), true);

  // 4. Simular Validação do Mão de Vaca (10k+ saldo sem doações e sem compras)
  console.log("➡️ Simulando condição Mão de Vaca (5k+ saldo sem gastar)...");
  await checkMaoDeVacaRole(member, 10500);
  assert.equal(member.grantedRoles.has("role_maodevaca"), true);

  // Verificar total de anúncios enviados no chat principal
  assert.equal(member.channelAnnouncements.length, 4);
  console.log(`✅ Total de Anúncios Enviados no Chat Principal: ${member.channelAnnouncements.length}`);
});

test("MEGA SIMULAÇÃO: Progressão de Cargos de Voz (7h a 336h em Call)", async () => {
  __setStatsDbForTests({});
  const member = createTestGuildMember("voice_hero", "VoiceHero");

  console.log("\n🎙️ INICIANDO MEGA TESTE DE PROGRESSÃO DE VOZ...");

  // 7 Horas -> Voz Promissora
  await addVoiceTime("voice_hero", member, 7 * 3600 * 1000);
  assert.equal(member.grantedRoles.has("role_voz_promissora"), true);

  // 24 Horas -> Amante das Conversas
  await addVoiceTime("voice_hero", member, 17 * 3600 * 1000);
  assert.equal(member.grantedRoles.has("role_amante_conversas"), true);

  // 72 Horas -> Mestre das Calls
  await addVoiceTime("voice_hero", member, 48 * 3600 * 1000);
  assert.equal(member.grantedRoles.has("role_mestre_calls"), true);

  // 168 Horas -> Dono de Podcast
  await addVoiceTime("voice_hero", member, 96 * 3600 * 1000);
  assert.equal(member.grantedRoles.has("role_dono_podcast"), true);

  // 336 Horas -> Voz Suprema
  await addVoiceTime("voice_hero", member, 168 * 3600 * 1000);
  assert.equal(member.grantedRoles.has("role_voz_suprema"), true);

  console.log("✅ Todos os 5 cargos de voz foram conquistados progressivamente!");
});

test("MEGA SIMULAÇÃO: Progressão de Atividade Semanal (500 a 3000 msgs em 7 dias)", async () => {
  __setStatsDbForTests({});
  const member = createTestGuildMember("active_hero", "ActiveHero");

  console.log("\n⚡ INICIANDO MEGA TESTE DE ATIVIDADE SEMANAL...");

  // Send 500 msgs -> Ativo
  for (let i = 0; i < 500; i++) {
    await recordActivityMessage("active_hero", member);
  }
  assert.equal(member.grantedRoles.has("role_ativo"), true);

  // Send 1000 mais (total 1500) -> Super Ativo
  for (let i = 0; i < 1000; i++) {
    await recordActivityMessage("active_hero", member);
  }
  assert.equal(member.grantedRoles.has("role_super_ativo"), true);

  // Send 1500 mais (total 3000) -> Extremamente Ativo
  for (let i = 0; i < 1500; i++) {
    await recordActivityMessage("active_hero", member);
  }
  assert.equal(member.grantedRoles.has("role_extremamente_ativo"), true);

  console.log("✅ Todos os 3 cargos de atividade semanal foram desbloqueados!");
});
