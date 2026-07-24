const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../scripts/core/config");
const {
  buildWelcomePrincipalMessage,
  buildWelcomeGuiaMessage,
  handleMemberJoin,
  handleWelcomeTestCommand
} = require("../scripts/features/welcome");

test("buildWelcomePrincipalMessage includes user mention and guide channel", () => {
  const msg = buildWelcomePrincipalMessage("123456");
  assert.ok(msg.includes("<@123456>"));
  assert.ok(msg.includes(`<#${config.WELCOME_GUIA_CHANNEL_ID}>`));
  assert.ok(msg.toLowerCase().includes("boas-vindas"));
});

test("buildWelcomeGuiaMessage includes all required features, commands, and channel mentions", () => {
  const msg = buildWelcomeGuiaMessage("789012");
  assert.ok(msg.includes("<@789012>"));
  assert.ok(msg.includes("!xp"));
  assert.ok(msg.includes("!daily"));
  assert.ok(msg.includes("/bump"));
  assert.ok(msg.includes(`<#${config.IDEIAS_CHANNEL_ID}>`));
  assert.ok(msg.includes(`<#${config.FOTOS_CHANNEL_ID}>`));
  assert.ok(msg.includes(`<#${config.MEMES_CHANNEL_ID}>`));
  assert.ok(msg.includes(`<#${config.COMANDOS_CHANNEL_ID}>`));
});

test("handleMemberJoin sends messages to both principal and guia channels", async () => {
  const sentMessages = [];
  const fakeChannels = new Map([
    ["1528288031101026405", { id: "1528288031101026405", send: async (content) => sentMessages.push({ channelId: "1528288031101026405", content }) }],
    ["1530089852106834091", { id: "1530089852106834091", send: async (content) => sentMessages.push({ channelId: "1530089852106834091", content }) }]
  ]);

  const fakeMember = {
    id: "user999",
    client: {
      channels: {
        cache: fakeChannels
      }
    }
  };

  await handleMemberJoin(fakeMember);

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].channelId, "1528288031101026405");
  assert.ok(sentMessages[0].content.includes("<@user999>"));
  assert.equal(sentMessages[1].channelId, "1530089852106834091");
  assert.ok(sentMessages[1].content.includes("<@user999>"));
});

test("handleWelcomeTestCommand handles preview fallback when channels aren't available", async () => {
  let replyPayload = null;
  const fakeMessage = {
    author: { id: "admin1" },
    mentions: { users: { first: () => ({ id: "targetUser" }) } },
    client: { channels: { cache: new Map() } },
    reply: async (payload) => { replyPayload = payload; }
  };

  const handled = await handleWelcomeTestCommand(fakeMessage);
  assert.equal(handled, true);
  assert.ok(replyPayload);
  assert.ok(typeof replyPayload.content === "string");
  assert.ok(replyPayload.content.includes("Preview das Mensagens de Boas-Vindas"));
  assert.ok(replyPayload.content.includes("<@targetUser>"));
});
