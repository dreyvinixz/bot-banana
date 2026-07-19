const { EmbedBuilder } = require("discord.js");
const config = require("../core/config");
const { weightedChoice } = require("../core/random");
const {
  addWeaponInstance,
  getUserInventory,
  setEquippedWeapon,
  updateWeaponInstance
} = require("./inventory");

const weaponData = config.static.weapons || { weapons: {}, rarities: {}, classes: {} };

function getWeaponDef(weaponId) {
  return weaponData.weapons?.[weaponId] || null;
}

function listWeaponDefs(filter = {}) {
  return Object.entries(weaponData.weapons || {})
    .map(([id, weapon]) => ({ id, ...weapon }))
    .filter((weapon) => filter.rarity ? weapon.rarity === filter.rarity : true)
    .filter((weapon) => filter.class ? weapon.class === filter.class : true)
    .filter((weapon) => filter.shopEnabled === undefined ? true : weapon.shopEnabled === filter.shopEnabled);
}

function createWeaponInstance(weaponId, now = Date.now()) {
  const def = getWeaponDef(weaponId);
  if (!def) return null;
  return {
    instanceId: `wpn_${now}_${Math.floor(Math.random() * 100000)}`,
    weaponId,
    durabilityLeft: def.durability,
    fortifyLevel: 0,
    createdAt: now
  };
}

function grantWeapon(userId, weaponId) {
  const instance = createWeaponInstance(weaponId);
  if (!instance) return null;
  addWeaponInstance(userId, instance);
  return instance;
}

function grantRandomWeapon(userId, filter = {}, rng = Math.random) {
  const candidates = listWeaponDefs(filter).map((weapon) => ({
    ...weapon,
    weight: weapon.lootWeight || 1
  }));
  const selected = weightedChoice(candidates, rng);
  if (!selected) return null;
  return grantWeapon(userId, selected.id);
}

function getWeaponInstance(userId, instanceId) {
  return getUserInventory(userId).weapons.find((weapon) => weapon.instanceId === instanceId) || null;
}

function getEquippedWeapon(userId) {
  const inventory = getUserInventory(userId);
  const instance = inventory.weapons.find((weapon) => weapon.instanceId === inventory.equippedWeaponId && !weapon.lockedUntil);
  if (!instance) return null;
  const def = getWeaponDef(instance.weaponId);
  return def ? { ...instance, def } : null;
}

function equipWeapon(userId, instanceId) {
  return setEquippedWeapon(userId, instanceId);
}

function consumeWeaponDurability(userId, instanceId, amount = 1) {
  const updated = updateWeaponInstance(userId, instanceId, (weapon) => {
    const nextDurability = (weapon.durabilityLeft || 0) - amount;
    if (nextDurability <= 0) return null;
    return { ...weapon, durabilityLeft: nextDurability };
  });
  return updated;
}

function rollLegendaryAbility(weaponInstanceOrDef, context = {}, rng = Math.random) {
  const def = weaponInstanceOrDef.def || weaponInstanceOrDef;
  if (def?.rarity !== "lendario" || !def.ability) return null;
  
  // Reroll chance from instance if it exists, otherwise base from def
  const chance = weaponInstanceOrDef.abilityChance !== undefined 
    ? Number(weaponInstanceOrDef.abilityChance) 
    : (Number(def.ability.chance) || 0);
    
  return rng() < chance ? def.ability : null;
}

function computeBossWeaponDamage(weapon, phase, actionConfig, rng = Math.random) {
  if (!weapon?.def) return { damage: 0, ability: null, durabilityCost: 0 };
  let damage = Number(weapon.def.bossDamage) || 0;
  
  // Apply fortify bonus
  if (weapon.fortifyLevel && weaponData.fortify?.bonusPerLevel?.bossDamage) {
    damage *= (1 + (weapon.fortifyLevel * weaponData.fortify.bonusPerLevel.bossDamage));
  }
  
  damage *= Number(actionConfig.weaponMultiplier) || 1;

  if (phase?.weakness === weapon.def.class) damage *= phase.weaknessMultiplier || 1;
  if (phase?.resistance === weapon.def.class) damage *= phase.resistanceMultiplier || 1;

  const ability = rollLegendaryAbility(weapon, { phase }, rng);
  if (ability?.bossFinalPhaseMultiplier && phase?.id === "final") {
    damage *= ability.bossFinalPhaseMultiplier;
  }

  return {
    damage: Math.floor(damage),
    ability,
    durabilityCost: 1
  };
}

function computeDuelWeaponModifier(weapon, opponentChoice, rng = Math.random) {
  if (!weapon?.def) {
    return { power: 0, piercesDefense: false, piercesParrudo: false, ability: null, durabilityCost: 0 };
  }

  let power = weapon.def.duelPower || 0;
  
  // Apply fortify bonus
  if (weapon.fortifyLevel && weaponData.fortify?.bonusPerLevel?.duelPower) {
    power *= (1 + (weapon.fortifyLevel * weaponData.fortify.bonusPerLevel.duelPower));
  }
  
  power = Math.floor(power);

  const ability = rollLegendaryAbility(weapon, { opponentChoice }, rng);
  const pierceDefenseChance = (weapon.def.pierceDefenseChance || 0) + (ability?.duelPierceBonus || 0);

  return {
    power,
    piercesDefense: opponentChoice === "Defesa" && rng() < pierceDefenseChance,
    piercesParrudo: rng() < (weapon.def.pierceParrudoChance || 0),
    ability,
    durabilityCost: 1
  };
}

function formatWeaponLabel(instanceOrDef) {
  const def = instanceOrDef.def || instanceOrDef;
  const rarity = weaponData.rarities?.[def.rarity]?.label || def.rarity;
  const durability = instanceOrDef.durabilityLeft !== undefined
    ? ` (${instanceOrDef.durabilityLeft}/${def.durability} usos)`
    : "";
  const fortify = instanceOrDef.fortifyLevel ? ` +${instanceOrDef.fortifyLevel}` : "";
  return `${def.name}${fortify} [${rarity}]${durability}`;
}

async function handleEquipWeaponCommand(message, text) {
  const instanceId = (text || "").trim();
  if (!instanceId) {
    return message.reply("Use `!equipar <id_da_arma>`. Veja seus IDs em `!inventario`.");
  }
  if (!equipWeapon(message.author.id, instanceId)) {
    return message.reply("Não encontrei essa arma no seu inventário, ou ela está travada na Bolsa.");
  }
  const weapon = getEquippedWeapon(message.author.id);
  return message.reply(`✅ Arma equipada: **${formatWeaponLabel(weapon)}**.`);
}

async function handleInventoryCommand(message) {
  const viewer = message.author || message.user;
  if (!viewer?.id) {
    return message.reply?.("Não consegui identificar o dono do inventário.");
  }

  const inventory = getUserInventory(viewer.id);
  const BOOST_PRICES = config.static.shop?.boosts || {};

  function getItemDisplay(itemId) {
    const b = BOOST_PRICES[itemId];
    if (b) return `${b.emoji || '📦'} **${b.label || itemId}**`;
    if (itemId === 'bomba_fumaca') return `💨 **Bomba de Fumaça**`;
    if (itemId === 'peCabra') return `🔧 **Pé de Cabra**`;
    if (itemId === 'escudoEspinhos') return `🛡️ **Escudo de Espinhos**`;
    if (itemId === 'acido_corrosivo') return `🧪 **Ácido Corrosivo**`;
    if (itemId === 'pe_de_coelho') return `🐰 **Pé de Coelho**`;
    return `📦 **${itemId}**`;
  }

  const rarityEmojis = { comum: "⚪", raro: "🔵", epico: "🟣", lendario: "🟡" };

  const itemLines = Object.entries(inventory.items)
    .filter(([, amount]) => amount > 0)
    .map(([itemId, amount]) => `> ${getItemDisplay(itemId)} \`x${amount}\``);

  const weaponLines = inventory.weapons.map((instance) => {
    const def = getWeaponDef(instance.weaponId);
    const equipped = inventory.equippedWeaponId === instance.instanceId ? " 🗡️ **[EQUIPADA]**" : "";
    const locked = instance.lockedUntil ? " 🔒 **[BOLSA]**" : "";
    const rEmoji = def ? (rarityEmojis[def.rarity] || "🔹") : "🔹";
    const label = def ? formatWeaponLabel({ ...instance, def }) : instance.weaponId;
    return `> ${rEmoji} \`${instance.instanceId}\` - **${label}**${equipped}${locked}`;
  });

  const unequippedWeapons = inventory.weapons.filter(w => !w.lockedUntil && w.instanceId !== inventory.equippedWeaponId);
  const components = [];

  const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

  const forgeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`open_forge_menu`).setLabel("⚒️ Forja / Reparo").setStyle(ButtonStyle.Primary)
  );
  components.push(forgeRow);

  if (unequippedWeapons.length > 0) {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`inv_equip_${viewer.id}`)
        .setPlaceholder("Escolha uma arma para equipar...")
        .addOptions(unequippedWeapons.slice(0, 25).map((weapon) => {
          const def = getWeaponDef(weapon.weaponId);
          return {
            label: (def ? formatWeaponLabel({ ...weapon, def }) : weapon.weaponId).slice(0, 100),
            value: weapon.instanceId,
            emoji: def ? (rarityEmojis[def.rarity] || "🔹") : "🔹"
          };
        }))
    );
    components.push(row);
  }

  const embed = new EmbedBuilder()
    .setColor("#22C55E")
    .setTitle(`🎒 Inventário de ${viewer.username}`)
    .setDescription("Aqui estão todos os seus pertences! Use o menu abaixo para equipar uma arma ou vá na `!bolsa` para vender.")
    .addFields(
      { name: "🧰 Itens & Consumíveis", value: itemLines.join("\n") || "> *Mochila vazia...*", inline: false },
      { name: "⚔️ Arsenal de Armas", value: weaponLines.slice(0, 15).join("\n") || "> *Você não tem armas.*", inline: false }
    )
    .setFooter({ text: weaponLines.length > 15 ? "Mostrando apenas as 15 primeiras armas..." : "Guarde seus itens com segurança!" });

  const payload = { embeds: [embed], components, content: "" };
  if (message.update) return message.update(payload);
  return message.reply(payload);
}

async function handleInventoryInteraction(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("inv_equip_")) {
    const ownerId = interaction.customId.split("_")[2];
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ content: "❌ Este inventário é de outro jogador. Digite `!inv` para abrir o seu.", flags: require("discord.js").MessageFlags.Ephemeral });
    }
    const instanceId = interaction.values[0];
    if (!equipWeapon(ownerId, instanceId)) {
      return interaction.reply({ content: "Não encontrei essa arma ou ela está travada na Bolsa.", flags: require("discord.js").MessageFlags.Ephemeral });
    }
    const weapon = getEquippedWeapon(ownerId);
    await interaction.reply({ content: `✅ Arma equipada com sucesso: **${formatWeaponLabel(weapon)}**!`, flags: require("discord.js").MessageFlags.Ephemeral });
    // Reload inventory UI
    return handleInventoryCommand({ user: interaction.user, update: (p) => interaction.message.edit(p) });
  }
  return false;
}

module.exports = {
  getWeaponDef,
  listWeaponDefs,
  createWeaponInstance,
  grantWeapon,
  grantRandomWeapon,
  getWeaponInstance,
  getEquippedWeapon,
  equipWeapon,
  consumeWeaponDurability,
  computeBossWeaponDamage,
  computeDuelWeaponModifier,
  formatWeaponLabel,
  handleEquipWeaponCommand,
  handleInventoryCommand,
  handleInventoryInteraction
};
