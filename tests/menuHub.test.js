const test = require("node:test");
const assert = require("node:assert/strict");
const economy = require("../scripts/economy/economy");
const duel = require("../scripts/games/duel");
const { handleBoostInteraction } = require("../scripts/economy/boosts");
const { handleMenuCommand, handleMenuInteraction } = require("../scripts/features/menuHub");

economy.__disableSavingForTests(true);

test("parrudo can be purchased directly from the shop", async () => {
  economy.__setDbForTests({ player1: 1000 });

  let replyPayload = null;
  await handleBoostInteraction({
    isButton: () => false,
    isStringSelectMenu: () => true,
    customId: "boost_select_player1",
    user: { id: "player1" },
    values: ["parrudo_1h"],
    reply: async (payload) => { replyPayload = payload; }
  });

  assert.equal(economy.getCoins("player1"), 750); // 1000 - 250
  assert.equal(duel.isParrudo("player1"), true);
  assert.ok(replyPayload);
});

test("handleMenuCommand creates embed and button components", async () => {
  let replyPayload = null;
  await handleMenuCommand({
    author: { id: "player1", username: "Tester" },
    reply: async (payload) => { replyPayload = payload; }
  });

  assert.ok(replyPayload);
  assert.equal(replyPayload.embeds.length, 1);
  assert.match(replyPayload.embeds[0].data.title, /CENTRAL DO BOT BANANA/);
  assert.equal(replyPayload.components.length, 2);
});

test("handleMenuInteraction processes button click for current user", async () => {
  economy.__setDbForTests({ player1: 500 });
  let replyPayload = null;

  const handled = await handleMenuInteraction({
    isButton: () => true,
    isStringSelectMenu: () => false,
    customId: "menu_btn_saldo_player1",
    user: { id: "player1", username: "Tester" },
    reply: async (payload) => { replyPayload = payload; }
  });

  assert.equal(handled, true);
  assert.ok(replyPayload);
  assert.match(replyPayload.embeds[0].data.title, /BANCO NANACOIN/);
});

test("handleMenuInteraction blocks other users from clicking another player's menu", async () => {
  let replyPayload = null;

  const handled = await handleMenuInteraction({
    isButton: () => true,
    isStringSelectMenu: () => false,
    customId: "menu_btn_saldo_player1",
    user: { id: "otherPlayer", username: "Intruder" },
    reply: async (payload) => { replyPayload = payload; }
  });

  assert.equal(handled, true);
  assert.ok(replyPayload);
  assert.match(replyPayload.content, /este menu foi aberto por outro jogador/i);
});
