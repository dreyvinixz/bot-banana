const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder, EmbedBuilder } = require("discord.js");
const config = require("../core/config");
const { useCombatBuff } = require("./activeEffects");
const { getUserInventory, hasItem, removeItem, updateWeaponInstance } = require("./inventory");
const { getWeaponDef } = require("./weapons");
const { recordLedgerEvent } = require("./ledger");

const FALLBACK_MATERIALS = {
  pedra_amolar: { allowedRarities: ["comum", "raro"], repairValue: 5 },
  fragmento_mana: { allowedRarities: ["raro", "epico"], repairValue: 7 },
  essencia_rara: { allowedRarities: ["epico", "lendario"], repairValue: 10 },
  nucleo_lendario: { allowedRarities: ["lendario"], repairValue: 15 }
};

function getRepairMaterials() {
  const boosts = config.static.shop?.boosts || {};
  const materials = {};
  for (const [id, item] of Object.entries(boosts)) {
    if (item.type !== "material") continue;
    materials[id] = {
      allowedRarities: Array.isArray(item.allowedRarities) ? item.allowedRarities : FALLBACK_MATERIALS[id]?.allowedRarities || [],
      repairValue: Number.isFinite(item.repairValue) ? item.repairValue : FALLBACK_MATERIALS[id]?.repairValue || 0
    };
  }
  return Object.keys(materials).length > 0 ? materials : FALLBACK_MATERIALS;
}

function repairWeapon(userId, instanceId, materialId, amount = 1) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, reason: "Quantidade inválida para reparo." };
  }

  const materialDef = getRepairMaterials()[materialId];
  if (!materialDef) return { ok: false, reason: "Material inválido para reparo." };

  if (!hasItem(userId, materialId, amount)) {
    return { ok: false, reason: "Você não tem a quantidade necessária desse material." };
  }

  const inventory = getUserInventory(userId);
  const weapon = inventory.weapons.find((w) => w.instanceId === instanceId);
  if (!weapon) return { ok: false, reason: "Arma não encontrada no seu inventário." };
  if (weapon.lockedUntil) return { ok: false, reason: "Esta arma está travada na Bolsa de Valores." };

  const weaponDef = getWeaponDef(weapon.weaponId);
  if (!weaponDef) return { ok: false, reason: "Definição da arma não encontrada." };

  if (!materialDef.allowedRarities.includes(weaponDef.rarity)) {
    return { ok: false, reason: `Este material não pode reparar uma arma de raridade **${weaponDef.rarity}**.` };
  }

  const currentDurability = Number.isInteger(weapon.durabilityLeft) ? weapon.durabilityLeft : 0;

  if (currentDurability >= weaponDef.durability) {
    return { ok: false, reason: "Esta arma já está com durabilidade máxima." };
  }

  const repairAmount = materialDef.repairValue * amount;
  let newDurability = currentDurability + repairAmount;
  if (newDurability > weaponDef.durability) newDurability = weaponDef.durability;

  // Consume material
  if (!removeItem(userId, materialId, amount)) {
    return { ok: false, reason: "Erro ao consumir o material." };
  }

  updateWeaponInstance(userId, instanceId, (w) => {
    w.durabilityLeft = newDurability;
    return w;
  });

  recordLedgerEvent("repair_weapon", {
    userId,
    weaponId: weapon.weaponId,
    instanceId,
    materialId,
    amount: amount,
    oldDurability: currentDurability,
    newDurability
  });

  return { ok: true, weaponName: weaponDef.name, newDurability, maxDurability: weaponDef.durability };
}

function fortifyWeapon(userId, instanceId, rng = Math.random) {
  const inventory = getUserInventory(userId);
  const weapon = inventory.weapons.find((w) => w.instanceId === instanceId);
  if (!weapon) return { ok: false, reason: "Arma não encontrada no seu inventário." };
  if (weapon.lockedUntil) return { ok: false, reason: "Esta arma está travada na Bolsa de Valores." };

  const weaponDef = getWeaponDef(weapon.weaponId);
  if (!weaponDef) return { ok: false, reason: "Definição da arma não encontrada." };

  const fortifyConfig = config.static.weapons?.fortify;
  if (!fortifyConfig) return { ok: false, reason: "Fortificação não configurada." };

  const currentLevel = weapon.fortifyLevel || 0;
  if (currentLevel >= fortifyConfig.maxLevel) {
    return { ok: false, reason: `Arma já está no nível máximo (+${fortifyConfig.maxLevel}).` };
  }

  const costConfig = fortifyConfig.materialCost[weaponDef.rarity];
  if (!costConfig) return { ok: false, reason: "Material de fortificação não definido para esta raridade." };

  const { materialId, amount } = costConfig;
  if (!hasItem(userId, materialId, amount)) {
    return { ok: false, reason: `Você precisa de **${amount}x ${materialId}** para fortificar esta arma.` };
  }

  // Consume material ALWAYS
  if (!removeItem(userId, materialId, amount)) {
    return { ok: false, reason: "Erro ao consumir material." };
  }

  const successChance = fortifyConfig.successChance[currentLevel] || 0;
  const isSuccess = rng() < successChance;

  if (isSuccess) {
    updateWeaponInstance(userId, instanceId, (w) => {
      w.fortifyLevel = currentLevel + 1;
      return w;
    });
    
    recordLedgerEvent("fortify_weapon", {
      userId,
      weaponId: weapon.weaponId,
      instanceId,
      materialId,
      amount,
      oldLevel: currentLevel,
      newLevel: currentLevel + 1,
      success: true
    });

    return { ok: true, success: true, weaponName: weaponDef.name, newLevel: currentLevel + 1 };
  } else {
    recordLedgerEvent("fortify_weapon", {
      userId,
      weaponId: weapon.weaponId,
      instanceId,
      materialId,
      amount,
      oldLevel: currentLevel,
      newLevel: currentLevel,
      success: false
    });

    return { ok: true, success: false, weaponName: weaponDef.name, newLevel: currentLevel };
  }
}

function craftWeapon(userId, targetWeaponId) {
  const craftingConfig = config.static.weapons?.crafting?.[targetWeaponId];
  if (!craftingConfig) return { ok: false, reason: "Receita de craft não encontrada para esta arma." };

  const weaponDef = getWeaponDef(targetWeaponId);
  if (!weaponDef) return { ok: false, reason: "Definição da arma não encontrada." };
  if (weaponDef.craftEnabled === false) {
    return { ok: false, reason: "Esta arma não pode ser craftada." };
  }
  if (weaponDef.rarity === "lendario" && craftingConfig.allowLegendary !== true) {
    return { ok: false, reason: "Crafting de armas lendárias ainda está bloqueado." };
  }

  const { getCoins, removeCoins } = require("./economy");
  if (getCoins(userId) < craftingConfig.cost) {
    return { ok: false, reason: `Você precisa de **${craftingConfig.cost} Nanacoins** para craftar esta arma.` };
  }

  for (const mat of craftingConfig.materials) {
    if (!hasItem(userId, mat.materialId, mat.amount)) {
      return { ok: false, reason: `Você não tem os materiais necessários. Faltam **${mat.materialId}** (precisa de ${mat.amount}).` };
    }
  }

  // Remove moedas e materiais
  removeCoins(userId, craftingConfig.cost);
  for (const mat of craftingConfig.materials) {
    removeItem(userId, mat.materialId, mat.amount);
  }

  // Cria a arma
  const { grantWeapon } = require("./weapons");
  const instance = grantWeapon(userId, targetWeaponId);
  if (!instance) {
    return { ok: false, reason: "Erro ao adicionar a arma ao inventário." };
  }

  recordLedgerEvent("craft_weapon", {
    userId,
    weaponId: targetWeaponId,
    cost: craftingConfig.cost,
    materials: craftingConfig.materials
  });

  return { ok: true, weaponName: weaponDef.name, instanceId: instance.instanceId };
}

function getCraftStatus(userId, weaponId) {
  const recipe = config.static.weapons?.crafting?.[weaponId];
  const weaponDef = getWeaponDef(weaponId);
  if (!recipe || !weaponDef) return null;

  const inventory = getUserInventory(userId);
  const { getCoins } = require("./economy");
  const coins = getCoins(userId);
  const materials = recipe.materials.map((mat) => {
    const owned = inventory.items[mat.materialId] || 0;
    return {
      ...mat,
      owned,
      enough: owned >= mat.amount
    };
  });
  const hasCoins = coins >= recipe.cost;
  const hasMaterials = materials.every((mat) => mat.enough);

  return {
    recipe,
    weaponDef,
    coins,
    materials,
    canCraft: hasCoins && hasMaterials
  };
}

function formatCraftMaterials(materials) {
  return materials
    .map((mat) => `${mat.enough ? "✅" : "❌"} ${mat.amount}x ${mat.materialId} (Tem: ${mat.owned})`)
    .join("\n");
}

function buildCraftDescription(userId, craftingRecipes) {
  return Object.entries(craftingRecipes).map(([weaponId]) => {
    const status = getCraftStatus(userId, weaponId);
    if (!status) return "";
    const { recipe, weaponDef, materials, canCraft } = status;
    const materialText = materials
      .map((mat) => `${mat.amount}x ${mat.materialId} (Tem: ${mat.owned})`)
      .join(", ");
    return `${canCraft ? "✅" : "❌"} **${weaponDef.name}** [${weaponDef.rarity}]\nCusto: 🪙 ${recipe.cost} | Materiais: ${materialText}`;
  }).filter(Boolean).join("\n\n");
}

function buildCraftWeaponsPayload(userId) {
  const craftingRecipes = config.static.weapons?.crafting || {};
  const craftableEntries = Object.entries(craftingRecipes)
    .filter(([weaponId]) => {
      const weaponDef = getWeaponDef(weaponId);
      return weaponDef && weaponDef.craftEnabled !== false;
    });

  if (craftableEntries.length === 0) {
    return { content: "Nenhuma receita de craft disponível no momento.", embeds: [], components: [] };
  }

  const embed = new EmbedBuilder()
    .setColor("#9B59B6")
    .setTitle("⚙️ Craftar Arma")
    .setDescription("Escolha uma arma para forjar do zero.\n\n" + buildCraftDescription(userId, Object.fromEntries(craftableEntries)));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("forge_select_craft")
      .setPlaceholder("Escolha uma arma para craftar...")
      .addOptions(craftableEntries.slice(0, 25).map(([wId]) => {
        const status = getCraftStatus(userId, wId);
        const wDef = getWeaponDef(wId);
        return {
          label: `${status.canCraft ? "✅" : "❌"} ${wDef.name} (${wDef.rarity})`.slice(0, 100),
          description: `Custo: ${status.recipe.cost} NC | ${status.canCraft ? "Pronto para craftar" : "Faltam recursos"}`.slice(0, 100),
          value: wId
        };
      }))
  );

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("forge_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
  );

  return { content: null, embeds: [embed], components: [row, backRow] };
}

async function handleCraftWeaponsCommand(message) {
  const viewer = message.author || message.user;
  if (!viewer?.id) {
    return message.reply?.("Não consegui identificar o jogador.");
  }

  return message.reply(buildCraftWeaponsPayload(viewer.id));
}

function rerollLegendaryAbility(userId, instanceId, rng = Math.random) {
  const inventory = getUserInventory(userId);
  const weapon = inventory.weapons.find((w) => w.instanceId === instanceId);
  if (!weapon) return { ok: false, reason: "Arma não encontrada no seu inventário." };
  if (weapon.lockedUntil) return { ok: false, reason: "Esta arma está travada na Bolsa de Valores." };

  const weaponDef = getWeaponDef(weapon.weaponId);
  if (weaponDef?.rarity !== "lendario" || !weaponDef.ability) {
    return { ok: false, reason: "Esta arma não possui uma habilidade lendária para rerrolar." };
  }

  const rerollConfig = config.static.weapons?.legendaryReroll;
  if (!rerollConfig) return { ok: false, reason: "Sistema de reroll não configurado." };

  if (!hasItem(userId, rerollConfig.materialId, rerollConfig.amountPerReroll)) {
    return { ok: false, reason: `Você precisa de **${rerollConfig.amountPerReroll}x ${rerollConfig.materialId}** para rerrolar a chance.` };
  }

  // Consume materials
  if (!removeItem(userId, rerollConfig.materialId, rerollConfig.amountPerReroll)) {
    return { ok: false, reason: "Erro ao consumir material." };
  }

  // Calculate new chance
  const range = rerollConfig.chanceRange;
  const newChance = range.min + rng() * (range.max - range.min);
  const formattedChance = Math.floor(newChance * 100) / 100; // 2 decimal places

  updateWeaponInstance(userId, instanceId, (w) => {
    w.abilityChance = formattedChance;
    return w;
  });

  recordLedgerEvent("reroll_legendary", {
    userId,
    weaponId: weapon.weaponId,
    instanceId,
    oldChance: weapon.abilityChance || weaponDef.ability.chance,
    newChance: formattedChance,
    materialUsed: rerollConfig.materialId,
    amountUsed: rerollConfig.amountPerReroll
  });

  return { ok: true, weaponName: weaponDef.name, newChance: formattedChance };
}



// Handler da interface de Forja/Reparo
async function handleForgeInteraction(interaction) {
  const userId = interaction.user.id;
  const customId = interaction.customId;

  if (customId === "open_forge_menu" || customId === "forge_home") {
    const embed = new EmbedBuilder()
      .setColor("#E67E22")
      .setTitle("⚒️ Forja Principal")
      .setDescription("Bem-vindo à forja! O que você deseja fazer?");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("forge_menu_repair").setLabel("Reparar Arma").setStyle(ButtonStyle.Primary).setEmoji("⚒️"),
      new ButtonBuilder().setCustomId("forge_menu_fortify").setLabel("Fortificar Arma").setStyle(ButtonStyle.Success).setEmoji("🔼")
    );
    
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("forge_menu_craft").setLabel("Craftar Arma").setStyle(ButtonStyle.Secondary).setEmoji("⚙️"),
      new ButtonBuilder().setCustomId("forge_menu_buff").setLabel("Buff de Combate").setStyle(ButtonStyle.Danger).setEmoji("🔥"),
      new ButtonBuilder().setCustomId("forge_menu_reroll").setLabel("Reroll Lendário").setStyle(ButtonStyle.Secondary).setEmoji("🌀")
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("forge_menu_back").setLabel("Voltar ao Inventário").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
    );

    if (interaction.isButton()) {
      return interaction.update({ embeds: [embed], components: [row, row2, row3] });
    }
    return interaction.reply({ embeds: [embed], components: [row, row2, row3], flags: MessageFlags.Ephemeral });
  }

  if (customId === "forge_menu_back") {
    const { handleInventoryCommand } = require("./weapons");
    return handleInventoryCommand({ user: interaction.user, update: (p) => interaction.update(p) });
  }

  // --- REPAIR MENU ---
  if (customId === "forge_menu_repair") {
    const inventory = getUserInventory(userId);
    const brokenWeapons = inventory.weapons.filter(w => !w.lockedUntil);

    if (brokenWeapons.length === 0) {
      return interaction.reply({ content: "Você não tem armas disponíveis para reparo.", flags: MessageFlags.Ephemeral });
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("forge_select_repair")
        .setPlaceholder("Escolha uma arma para reparar...")
        .addOptions(brokenWeapons.slice(0, 25).map(w => {
          const def = getWeaponDef(w.weaponId);
          return {
            label: `${def.name}`.slice(0, 100),
            description: `Durabilidade: ${w.durabilityLeft}/${def.durability}`.slice(0, 100),
            value: w.instanceId
          };
        }))
    );
    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("forge_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ content: "Selecione a arma que deseja reparar:", embeds: [], components: [row, backRow] });
  }

  if (interaction.isStringSelectMenu() && customId === "forge_select_repair") {
    const instanceId = interaction.values[0];
    const inventory = getUserInventory(userId);
    const weapon = inventory.weapons.find((w) => w.instanceId === instanceId);
    if (!weapon) return interaction.reply({ content: "Arma não encontrada.", flags: MessageFlags.Ephemeral });

    const def = getWeaponDef(weapon.weaponId);

    const embed = new EmbedBuilder()
      .setColor("#E67E22")
      .setTitle(`⚒️ Reparar: ${def.name}`)
      .setDescription(`Durabilidade Atual: **${weapon.durabilityLeft}/${def.durability}**\n\nEscolha qual material deseja usar para o reparo. Você usará **1 unidade** por vez.`);

    const rows = [];
    const buttons = [];
    const BOOST_PRICES = config.static.shop?.boosts || {};

    for (const [matId, matDef] of Object.entries(getRepairMaterials())) {
      if (matDef.allowedRarities.includes(def.rarity)) {
        const itemInfo = BOOST_PRICES[matId] || {};
        const count = inventory.items[matId] || 0;
        
        const btn = new ButtonBuilder()
          .setCustomId(`forge_repair:${instanceId}:${matId}`)
          .setLabel(`Usar ${itemInfo.label || matId} (+${matDef.repairValue}) [Você tem: ${count}]`)
          .setStyle(count > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(count <= 0 || weapon.durabilityLeft >= def.durability);

        if (itemInfo.emoji) btn.setEmoji(itemInfo.emoji);
        buttons.push(btn);
      }
    }

    if (buttons.length > 0) {
      let currentRow = new ActionRowBuilder();
      buttons.forEach(btn => {
        if (currentRow.components.length === 5) {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(btn);
      });
      if (currentRow.components.length > 0) rows.push(currentRow);
    }
    
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("forge_menu_repair").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
    ));

    return interaction.update({ content: null, embeds: [embed], components: rows });
  }

  if (interaction.isButton() && customId.startsWith("forge_repair:")) {
    const [, instanceId, materialId] = customId.split(":");
    const result = repairWeapon(userId, instanceId, materialId, 1);
    if (!result.ok) {
      return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ 
      content: `✅ Você reparou sua **${result.weaponName}**! Durabilidade agora é **${result.newDurability}/${result.maxDurability}**.`, 
      flags: MessageFlags.Ephemeral 
    });
  }

  // --- FORTIFY MENU ---
  if (customId === "forge_menu_fortify") {
    const inventory = getUserInventory(userId);
    const weapons = inventory.weapons.filter(w => !w.lockedUntil);
    if (weapons.length === 0) {
      return interaction.reply({ content: "Você não tem armas disponíveis para fortificar.", flags: MessageFlags.Ephemeral });
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("forge_select_fortify")
        .setPlaceholder("Escolha uma arma para fortificar...")
        .addOptions(weapons.slice(0, 25).map(w => {
          const def = getWeaponDef(w.weaponId);
          const lvl = w.fortifyLevel || 0;
          return {
            label: `${def.name} +${lvl}`.slice(0, 100),
            description: `Raridade: ${def.rarity}`.slice(0, 100),
            value: w.instanceId
          };
        }))
    );
    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("forge_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ content: "Selecione a arma que deseja fortificar:", embeds: [], components: [row, backRow] });
  }

  if (interaction.isStringSelectMenu() && customId === "forge_select_fortify") {
    const instanceId = interaction.values[0];
    const inventory = getUserInventory(userId);
    const weapon = inventory.weapons.find((w) => w.instanceId === instanceId);
    if (!weapon) return interaction.reply({ content: "Arma não encontrada.", flags: MessageFlags.Ephemeral });

    const def = getWeaponDef(weapon.weaponId);
    const lvl = weapon.fortifyLevel || 0;
    const fortifyConfig = config.static.weapons?.fortify;
    
    if (lvl >= (fortifyConfig?.maxLevel || 5)) {
      return interaction.reply({ content: "❌ Esta arma já está no nível máximo.", flags: MessageFlags.Ephemeral });
    }

    const cost = fortifyConfig.materialCost[def.rarity];
    const userAmount = inventory.items[cost.materialId] || 0;
    const chance = (fortifyConfig.successChance[lvl] || 0) * 100;

    const embed = new EmbedBuilder()
      .setColor("#2ECC71")
      .setTitle(`🔼 Fortificar: ${def.name} +${lvl} -> +${lvl + 1}`)
      .setDescription(`Chance de sucesso: **${chance}%**\nCusto: **${cost.amount}x ${cost.materialId}**\nVocê possui: **${userAmount}x**\n\n*Atenção: Em caso de falha, os materiais são consumidos, mas a arma não perde nível.*`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`forge_fortify_confirm:${instanceId}`).setLabel("Confirmar Fortificação").setStyle(ButtonStyle.Success).setDisabled(userAmount < cost.amount),
      new ButtonBuilder().setCustomId("forge_menu_fortify").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({ content: null, embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && customId.startsWith("forge_fortify_confirm:")) {
    const instanceId = customId.split(":")[1];
    const result = fortifyWeapon(userId, instanceId);
    if (!result.ok) {
      return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    }
      if (result.success) {
      return interaction.reply({ content: `🎉 **SUCESSO!** Sua arma agora é **${result.weaponName} +${result.newLevel}**!`, flags: MessageFlags.Ephemeral });
    } else {
      return interaction.reply({ content: `💥 **FALHOU!** Sua arma continua +${result.newLevel}. O material foi consumido.`, flags: MessageFlags.Ephemeral });
    }
  }

  // --- CRAFT MENU ---
  if (customId === "forge_menu_craft") {
    const payload = buildCraftWeaponsPayload(userId);
    if (!payload.embeds?.length) {
      return interaction.reply({ content: "Nenhuma receita de craft disponível no momento.", flags: MessageFlags.Ephemeral });
    }
    return interaction.update(payload);
  }

  if (interaction.isStringSelectMenu() && customId === "forge_select_craft") {
    const wId = interaction.values[0];
    const craftingConfig = config.static.weapons?.crafting?.[wId];
    if (!craftingConfig) return interaction.reply({ content: "Receita não encontrada.", flags: MessageFlags.Ephemeral });

    const wDef = getWeaponDef(wId);
    const status = getCraftStatus(userId, wId);
    if (!status) return interaction.reply({ content: "Receita não encontrada.", flags: MessageFlags.Ephemeral });
    
    const embed = new EmbedBuilder()
      .setColor("#9B59B6")
      .setTitle(`⚙️ Confirmar Craft: ${wDef.name}`)
      .setDescription(
        `Deseja forjar esta arma?\n\n` +
        `Custo em moedas: **${craftingConfig.cost} NC** (Você tem: **${status.coins} NC**)\n` +
        `Materiais:\n${formatCraftMaterials(status.materials)}`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`forge_craft_confirm:${wId}`).setLabel("Confirmar Craft").setStyle(ButtonStyle.Success).setDisabled(!status.canCraft),
      new ButtonBuilder().setCustomId("forge_menu_craft").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({ content: null, embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && customId.startsWith("forge_craft_confirm:")) {
    const wId = customId.split(":")[1];
    const result = craftWeapon(userId, wId);
    if (!result.ok) {
      return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: `🎉 **SUCESSO!** Você forjou uma incrível **${result.weaponName}**!`, flags: MessageFlags.Ephemeral });
  }

  // --- BUFF MENU ---
  if (customId === "forge_menu_buff") {
    const inventory = getUserInventory(userId);
    const buffs = config.static.shop?.combatBuff || {};
    const BOOST_PRICES = config.static.shop?.boosts || {};

    const embed = new EmbedBuilder()
      .setColor("#E74C3C")
      .setTitle("🔥 Buff de Combate")
      .setDescription("Selecione um material mágico para consumir e ganhar bônus temporário no seu próximo ataque em Duelos ou Boss.");

    const rows = [];
    const buttons = [];

    for (const [matId, buffDef] of Object.entries(buffs)) {
      const count = inventory.items[matId] || 0;
      const itemInfo = BOOST_PRICES[matId] || {};
      
      const btn = new ButtonBuilder()
        .setCustomId(`forge_buff_confirm:${matId}`)
        .setLabel(`Usar ${itemInfo.label || matId} [Você tem: ${count}]`)
        .setStyle(count > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setDisabled(count <= 0);

      if (itemInfo.emoji) btn.setEmoji(itemInfo.emoji);
      buttons.push(btn);
    }

    if (buttons.length > 0) {
      let currentRow = new ActionRowBuilder();
      buttons.forEach(btn => {
        if (currentRow.components.length === 5) {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(btn);
      });
      if (currentRow.components.length > 0) rows.push(currentRow);
    }
    
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("forge_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
    ));

    return interaction.update({ content: null, embeds: [embed], components: rows });
  }

  if (interaction.isButton() && customId.startsWith("forge_buff_confirm:")) {
    const matId = customId.split(":")[1];
    const result = useCombatBuff(userId, matId);
    if (!result.ok) {
      return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    }
    
    const buff = result.buff;
    let desc = "";
    if (buff.duelPowerBonus) desc += `\n⚔️ Poder de Duelo: +${buff.duelPowerBonus}`;
    if (buff.bossDamageBonus) desc += `\n👹 Dano em Boss: +${Math.floor(buff.bossDamageBonus * 100)}%`;
    
    return interaction.reply({ 
      content: `🔥 **BUFF ATIVADO!** Você consumiu 1x ${matId} e ganhou:${desc}\n\nDuração: **${buff.durationFights} luta(s)**.`, 
      flags: MessageFlags.Ephemeral 
    });
  }

  // --- REROLL MENU ---
  if (customId === "forge_menu_reroll") {
    const inventory = getUserInventory(userId);
    const legendaries = inventory.weapons.filter(w => {
      if (w.lockedUntil) return false;
      const def = getWeaponDef(w.weaponId);
      return def?.rarity === "lendario" && def?.ability;
    });

    if (legendaries.length === 0) {
      return interaction.reply({ content: "Você não tem armas Lendárias disponíveis para reroll.", flags: MessageFlags.Ephemeral });
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("forge_select_reroll")
        .setPlaceholder("Escolha uma arma para rerrolar chance...")
        .addOptions(legendaries.slice(0, 25).map(w => {
          const def = getWeaponDef(w.weaponId);
          const currentChance = w.abilityChance !== undefined ? w.abilityChance : (def.ability.chance || 0);
          return {
            label: `${def.name}`.slice(0, 100),
            description: `Chance atual: ${Math.floor(currentChance * 100)}%`.slice(0, 100),
            value: w.instanceId
          };
        }))
    );
    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("forge_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ content: "Selecione a arma Lendária para fazer reroll da chance de ativação da habilidade:", embeds: [], components: [row, backRow] });
  }

  if (interaction.isStringSelectMenu() && customId === "forge_select_reroll") {
    const instanceId = interaction.values[0];
    const inventory = getUserInventory(userId);
    const weapon = inventory.weapons.find((w) => w.instanceId === instanceId);
    if (!weapon) return interaction.reply({ content: "Arma não encontrada.", flags: MessageFlags.Ephemeral });

    const def = getWeaponDef(weapon.weaponId);
    const currentChance = weapon.abilityChance !== undefined ? weapon.abilityChance : (def.ability?.chance || 0);
    const rerollConfig = config.static.weapons?.legendaryReroll;
    if (!rerollConfig) return interaction.reply({ content: "Sistema não configurado.", flags: MessageFlags.Ephemeral });

    const userAmount = inventory.items[rerollConfig.materialId] || 0;
    const minP = Math.floor(rerollConfig.chanceRange.min * 100);
    const maxP = Math.floor(rerollConfig.chanceRange.max * 100);

    const embed = new EmbedBuilder()
      .setColor("#FACC15")
      .setTitle(`🌀 Reroll Lendário: ${def.name}`)
      .setDescription(`A chance de ativação atual da habilidade **${def.ability.label}** é de **${Math.floor(currentChance * 100)}%**.\n\nCusto: **${rerollConfig.amountPerReroll}x ${rerollConfig.materialId}**\nSua chance vai variar entre **${minP}% e ${maxP}%**.\nVocê possui: **${userAmount}x**`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`forge_reroll_confirm:${instanceId}`).setLabel("Confirmar Reroll").setStyle(ButtonStyle.Success).setDisabled(userAmount < rerollConfig.amountPerReroll),
      new ButtonBuilder().setCustomId("forge_menu_reroll").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({ content: null, embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && customId.startsWith("forge_reroll_confirm:")) {
    const instanceId = customId.split(":")[1];
    const result = rerollLegendaryAbility(userId, instanceId);
    if (!result.ok) {
      return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: `🎉 **REROLL REALIZADO!** A nova chance de habilidade da sua **${result.weaponName}** agora é **${Math.floor(result.newChance * 100)}%**!`, flags: MessageFlags.Ephemeral });
  }

  return false;
}

module.exports = {
  repairWeapon,
  fortifyWeapon,
  craftWeapon,
  rerollLegendaryAbility,
  buildCraftWeaponsPayload,
  handleCraftWeaponsCommand,
  handleForgeInteraction
};
