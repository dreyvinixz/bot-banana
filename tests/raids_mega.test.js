const test = require("node:test");
const assert = require("node:assert/strict");

const economy = require("../scripts/economy/economy");
const inventory = require("../scripts/economy/inventory");
const ledger = require("../scripts/economy/ledger");
const raids = require("../scripts/economy/raids");

// Mocks the basic setups
inventory.__disableSavingForTests(true);
ledger.__disableSavingForTests(true);
raids.__disableSavingForTests(true);
economy.__disableSavingForTests(true);

function seedServers() {
  raids.__setDbForTests(
    { raids: {}, userCooldowns: {} },
    {
      servers: {
        guild_a: {
          guildId: "guild_a",
          name: "Guild Alpha",
          eventChannelId: "chan_a",
          enabled: true,
          canAttack: true,
          canBeRaided: true,
          lastAttackAt: 0,
          lastRaidedAt: 0,
          shieldUntil: 0
        },
        guild_b: {
          guildId: "guild_b",
          name: "Guild Beta",
          eventChannelId: "chan_b",
          enabled: true,
          canAttack: true,
          canBeRaided: true,
          lastAttackAt: 0,
          lastRaidedAt: 0,
          shieldUntil: 0
        }
      }
    }
  );
}

test("MEGA TEST: 10 Atacantes vs 10 Defensores com Itens e Taxas de Guerra", async () => {
  seedServers();
  ledger.__setLedgerForTests([]);
  inventory.__setDbForTests({});

  // 10 Attackers in Guild A, 10 Defenders in Guild B
  const balances = {};
  const attackers = [];
  const defenders = [];

  for (let i = 1; i <= 10; i++) {
    const atkId = `atk_${i}`;
    const defId = `def_${i}`;
    balances[atkId] = 10000;
    balances[defId] = 10000;
    attackers.push(atkId);
    defenders.push(defId);
  }
  
  economy.__setDbForTests(balances);

  // 1. Criador cria a Raid
  const creator = attackers[0];
  const stake = 2000; // Valor minimo 2000 NC
  const created = raids.createRaid({
    attackerGuildId: "guild_a",
    attackerChannelId: "chan_a",
    createdBy: creator,
    targetInternalId: "1", // guild_b
    stake: stake
  });

  assert.equal(created.ok, true, "Raid deve ser criada com sucesso.");
  assert.equal(economy.getCoins(creator), 8000, "Stake do criador deve ser cobrado.");
  const raidId = created.raid.id;

  // 2. Os outros 9 atacantes entram na Raid
  for (let i = 1; i < attackers.length; i++) {
    const joined = raids.joinRaid(attackers[i], raidId);
    assert.equal(joined.ok, true, `Atacante ${attackers[i]} falhou em entrar.`);
  }

  // 3. Iniciar Raid
  const started = await raids.startRaid(creator, raidId, null);
  assert.equal(started.ok, true, "A raid deveria ter iniciado com sucesso.");
  assert.equal(started.raid.status, "active", "O status da Raid deve ser 'active'.");

  // 4. Defesa e uso de Itens
  // 5 atacantes vão comprar e usar 'estandarte_guerra'
  for (let i = 0; i < 5; i++) {
    const atk = attackers[i];
    economy.addCoins(atk, 5000); // Dar extra pro item
    raids.buyRaidItem(atk, "estandarte_guerra");
    const used = raids.useRaidItem(atk, "guild_a", "estandarte_guerra");
    assert.equal(used.ok, true, `Falha ao usar estandarte para ${atk}`);
  }

  // Todos os 10 defensores entram na defesa e 5 deles compram escudo
  for (let i = 0; i < defenders.length; i++) {
    const def = defenders[i];
    const defended = raids.defendRaid(def, "guild_b");
    assert.equal(defended.ok, true, `Falha ao defender para ${def}`);

    if (i < 5) {
      economy.addCoins(def, 5000); // Dar extra pro item
      raids.buyRaidItem(def, "escudo_servidor");
      const usedDef = raids.useRaidItem(def, "guild_b", "escudo_servidor");
      assert.equal(usedDef.ok, true, `Falha ao usar escudo para ${def}`);
    }
  }

  // Verifica que tentativas duplicadas de defesa não duplicam o usuário na raid
  raids.defendRaid(defenders[0], "guild_b");
  const raidObj = raids.__getDbForTests().raids.raids[raidId];
  const defCount = raidObj.defenders.filter(id => id === defenders[0]).length;
  assert.equal(defCount, 1, "Não deve permitir defender 2 vezes (duplicando a contagem).");
  
  assert.equal(raids.useRaidItem(defenders[0], "guild_b", "escudo_servidor").ok, false, "Não deve permitir usar 2 itens defensivos.");

  // 5. Resolver a Raid
  // Monta alvos elegíveis para o bot
  const eligibleTargets = defenders.map(id => ({ userId: id, balance: economy.getCoins(id) }));
  
  const resolved = await raids.resolveRaid(raidId, {
    // Um mock rng para garantir que os alvos pares são roubados (5 roubos de sucesso)
    rng: () => 0.0, // Retornando 0 para 'rolldice' garante chance de roubo (pois minChance é 5% e 0 < chance)
    eligibleTargets: eligibleTargets
  });

  assert.equal(resolved.ok, true, "Raid não conseguiu ser resolvida.");
  assert.equal(resolved.raid.status, "completed", "Raid status não é completed após resolver.");
  
  const res = resolved.result;
  assert.ok(res.totalStolen > 0, "Deveria ter roubado algo.");
  
  // Ninguém pode ter menos de "saldo protegido" e saldos originais eram 10.000 ou 15.000
  for (const def of defenders) {
    const bal = economy.getCoins(def);
    assert.ok(bal > 0, `Saldo do defensor ${def} zerou ilegalmente!`);
  }

  // Testar cálculo de perdas via ledger - nenhum roubo deve ser abusivo
  const raidLedgers = ledger.__getLedgerForTests().filter(e => e.raidId === raidId);
  const stolenEvents = raidLedgers.filter(e => e.type === "raid_steal_success");
  for (const log of stolenEvents) {
    assert.ok(log.amount <= 1000, `Roubo excessivo detectado (${log.amount} NC) - extrapolou o limite da raid!`);
  }

  // Testar taxas e distribuição - a matematica da taxa
  const calcTax = Math.floor(res.totalStolen * 0.10);
  assert.equal(res.taxAmount || res.tax, calcTax, "Taxa de guerra calculada errada.");
  
  // Distribuição deve ocorrer para todos os 10 atacantes
  const distr = res.totalStolen - calcTax;
  assert.equal(res.distributedTotal || res.distributed, distr, "Distribuido Total não bate com a subtração da taxa.");
  
  const paidEvents = raidLedgers.filter(e => e.type === "raid_reward_paid");
  const sumDistributed = paidEvents.reduce((acc, evt) => acc + evt.amount, 0);
  // Pode haver pequena diferença por arredondamento, então comparamos proximidade
  assert.ok(Math.abs(sumDistributed - distr) <= 10, "Distribuição foi falha (erro de arredondamento excessivo)");

  // Checar ledger para confirmar a vida da Raid
  const allLedgers = ledger.__getLedgerForTests();
  const types = new Set(allLedgers.map(e => e.type));
  const expectedEvents = [
    "raid_created", "raid_joined", "raid_started", "raid_item_bought",
    "raid_item_used", "raid_defended", "raid_steal_success", "raid_tax",
    "raid_reward_paid", "raid_resolved"
  ];
  
  for (const evt of expectedEvents) {
    assert.ok(types.has(evt), `Faltou o evento no ledger: ${evt}`);
  }

  // Verifica reembolso de pote
  assert.ok(economy.getCoins(creator) > 8000, "O criador deveria ter recebido o stake de volta e partes do roubo.");

  // Verifica proteção da Guild B e cooldown da Guild A
  const db = raids.__getDbForTests();
  assert.ok(db.servers.servers.guild_a.lastAttackAt > 0, "Guild A não teve o tempo de ataque atualizado.");
  assert.ok(db.servers.servers.guild_b.shieldUntil > Date.now(), "Guild B não recebeu o escudo de proteção após Raid.");

  console.log("🔥 MEGA TESTE COMPLETADO COM SUCESSO! 🔥");
  console.log("------------------------------------------");
  console.log(`Participantes: 10 Atacantes vs 10 Defensores`);
  console.log(`Itens usados: 5 Ofensivos, 5 Defensivos`);
  console.log(`Total Roubado: ${res.totalStolen} NC`);
  console.log(`Taxa do Servidor (10%): ${res.taxAmount || res.tax} NC`);
  console.log(`Total Distribuído: ${res.distributedTotal || res.distributed} NC`);
});
