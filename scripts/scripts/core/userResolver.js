const config = require("./config");

function normalizeQuery(text) {
  return (text || "").trim().toLowerCase();
}

function getMentionId(text) {
  const match = (text || "").trim().match(/^<@!?(\d+)>$/);
  return match ? match[1] : null;
}

function maybeSeedTestUser(channelId, query) {
  const test = config.static.app.test;
  if (!test || channelId !== test.channelId || normalizeQuery(query) !== "teste") return null;
  return { ...test.user };
}

async function resolveUserFromMessage(message, query) {
  const mentioned = message.mentions?.users?.first?.();
  if (mentioned) return mentioned;

  const testUser = maybeSeedTestUser(message.channel.id, query);
  if (testUser) return testUser;

  const targetQuery = normalizeQuery(query);
  if (!targetQuery) return null;

  const mentionId = getMentionId(query);
  if (mentionId) {
    return message.client.users.fetch(mentionId).catch(() => null);
  }

  let user = message.client.users.cache.find((u) =>
    u.id === targetQuery ||
    u.username.toLowerCase() === targetQuery ||
    (u.globalName && u.globalName.toLowerCase() === targetQuery)
  );
  if (user) return user;

  for (const guild of message.client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch({ query: targetQuery, limit: 1 });
      if (members.size > 0) return members.first().user;
    } catch (err) {
      // Ignore guild lookup errors and keep searching.
    }
  }
  return null;
}

async function resolveUserFromInteraction(interaction, query) {
  const testUser = maybeSeedTestUser(interaction.channel.id, query);
  if (testUser) return testUser;

  const targetQuery = normalizeQuery(query);
  if (!targetQuery) return null;

  const mentionId = getMentionId(query);
  if (mentionId) {
    const member = await interaction.guild?.members.fetch(mentionId).catch(() => null);
    return member ? member.user : interaction.client.users.fetch(mentionId).catch(() => null);
  }

  const guild = interaction.guild;
  if (guild) {
    const members = await guild.members.fetch({ query: targetQuery, limit: 1 }).catch(() => null);
    if (members && members.size > 0) return members.first().user;
  }

  return interaction.client.users.cache.find((u) =>
    u.id === targetQuery ||
    u.username.toLowerCase() === targetQuery ||
    (u.globalName && u.globalName.toLowerCase() === targetQuery)
  ) || null;
}

module.exports = {
  normalizeQuery,
  getMentionId,
  resolveUserFromMessage,
  resolveUserFromInteraction
};
