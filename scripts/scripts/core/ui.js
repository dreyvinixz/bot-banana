const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

function styleFromName(name, fallback = ButtonStyle.Primary) {
  return ButtonStyle[name] || fallback;
}

function buttonRows(items, perRow = 5) {
  const rows = [];
  for (let i = 0; i < items.length; i += perRow) {
    const row = new ActionRowBuilder();
    for (const item of items.slice(i, i + perRow)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(item.customId)
          .setLabel(item.label)
          .setStyle(styleFromName(item.style, item.fallbackStyle))
      );
    }
    rows.push(row);
  }
  return rows;
}

module.exports = {
  styleFromName,
  buttonRows
};
