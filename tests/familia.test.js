const test = require("node:test");
const assert = require("node:assert/strict");
const { checkMemberStatusHasInvite, buildFamiliaEmbed } = require("../scripts/features/familia");
const { ActivityType } = require("discord.js");

test("checkMemberStatusHasInvite detecta links de convite no Status Personalizado", async () => {
  const memberWithInvite = {
    presence: {
      activities: [
        { type: ActivityType.Custom, name: "Custom Status", state: "Entrem no meu server discord.gg/cabere !" }
      ]
    }
  };

  assert.equal(await checkMemberStatusHasInvite(memberWithInvite), true);

  const memberWithoutInvite = {
    presence: {
      activities: [
        { type: ActivityType.Custom, name: "Custom Status", state: "Jogando Valorant" }
      ]
    }
  };

  assert.equal(await checkMemberStatusHasInvite(memberWithoutInvite), false);
});

test("buildFamiliaEmbed constrói embed com benefícios e título corretos", () => {
  const mockGuild = { iconURL: () => "https://example.com/icon.png" };
  const embed = buildFamiliaEmbed(mockGuild);

  assert.equal(embed.data.title.includes("Família Caberé"), true);
  assert.equal(embed.data.fields.length >= 3, true);
});
