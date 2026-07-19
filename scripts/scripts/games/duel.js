const fs = require("fs");
const config = require("../core/config");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder } = require("discord.js");
const { getCoins, addCoins, removeCoins, formatCoins } = require("../economy/economy");
const { getStealChanceExtra } = require("../economy/boosts");
const { perguntarIaPrompt } = require("../ai/question");
const { createDebouncedJsonWriter } = require("../core/storage");
const { resolveUserFromMessage, resolveUserFromInteraction } = require("../core/userResolver");
const { isSuperAdmin } = require("../admin/admin");
const { resolveDuel, parsePositiveAmount, computeStealChance, rollStealPercent, selectParrudoOption } = require("./duelRules");
const { choice } = require("../core/random");
const { computeThornPenalty, resolveParrudoStealGate } = require("./stealRules");
const {
  getEquippedWeapon,
  consumeWeaponDurability,
  computeDuelWeaponModifier,
  formatWeaponLabel
} = require("../economy/weapons");

const prisonMap = new Map();
const parrudoMap = new Map();
const beijoCooldowns = new Map();
const robFailures = new Map();
const rouboCooldowns = new Map();

function carregarTimers() {
  try {
    if (fs.existsSync(config.TIMERS_PATH)) {
      const data = fs.readFileSync(config.TIMERS_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed.prison) parsed.prison.forEach(([k, v]) => prisonMap.set(k, v));
      if (parsed.parrudo) parsed.parrudo.forEach(([k, v]) => parrudoMap.set(k, v));
      if (parsed.beijo) parsed.beijo.forEach(([k, v]) => beijoCooldowns.set(k, v));
      if (parsed.robFailures) parsed.robFailures.forEach(([k, v]) => robFailures.set(k, v));
      if (parsed.rouboCooldowns) parsed.rouboCooldowns.forEach(([k, v]) => rouboCooldowns.set(k, v));
    }
  } catch (err) {
    console.error("Erro ao carregar timers:", err);
  }
}

carregarTimers();

const salvarTimers = createDebouncedJsonWriter(config.TIMERS_PATH, () => ({
  prison: Array.from(prisonMap.entries()),
  parrudo: Array.from(parrudoMap.entries()),
  beijo: Array.from(beijoCooldowns.entries()),
  robFailures: Array.from(robFailures.entries()),
  rouboCooldowns: Array.from(rouboCooldowns.entries())
}), config.static.app.timers.saveDebounceMs);

function isParrudo(userId) {
  if (!parrudoMap.has(userId)) return false;
  const expire = parrudoMap.get(userId);
  if (Date.now() > expire) {
    parrudoMap.delete(userId);
    salvarTimers();
    return false;
  }
  return true;
}

function getTempoParrudoRestante(userId) {
  if (!parrudoMap.has(userId)) return 0;
  const rest = parrudoMap.get(userId) - Date.now();
  return Math.ceil(rest / 60_000);
}

function isPrisioneiro(userId) {
  if (!prisonMap.has(userId)) return false;
  const expire = prisonMap.get(userId);
  if (Date.now() > expire) {
    prisonMap.delete(userId);
    salvarTimers();
    return false;
  }
  return true;
}

function prenderUsuario(userId, minutes) {
  prisonMap.set(userId, Date.now() + minutes * 60_000);
  salvarTimers();
}

function getTempoPrisaoRestante(userId) {
  if (!prisonMap.has(userId)) return 0;
  const rest = prisonMap.get(userId) - Date.now();
  return Math.ceil(rest / 60_000);
}

// Limpeza de Memória Periódica (a cada 1 hora)
const timerCleanupInterval = setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [userId, expire] of prisonMap.entries()) {
    if (now > expire) { prisonMap.delete(userId); changed = true; }
  }
  for (const [userId, expire] of parrudoMap.entries()) {
    if (now > expire) { parrudoMap.delete(userId); changed = true; }
  }
  for (const [userId, expire] of beijoCooldowns.entries()) {
    if (now > expire) { beijoCooldowns.delete(userId); changed = true; }
  }
  robFailures.clear(); // Limpa as falhas a cada 1 hora para evitar acúmulo eterno
  if (changed) salvarTimers();
}, config.static.app.timers.cleanupIntervalMs);
timerCleanupInterval.unref?.();

// Map of active duels: duelId -> { p1: { id, name, choice }, p2: { id, name, choice }, amount, channelId, messageId, timerId }
const activeDuels = new Map();

function seedTestWalletIfNeeded(user) {
  const test = config.static.app.test;
  if (user?.id === test.user.id && getCoins(test.user.id) < test.seedCoins) {
    addCoins(test.user.id, test.seedCoins);
  }
}

async function handleRoubarCommand(message, text) {
  const userId = message.author.id;

  if (isPrisioneiro(userId)) {
    return message.reply(`🚓 Você está na prisão! Faltam **${getTempoPrisaoRestante(userId)} minutos** para você ser solto.`);
  }

  const targetUser = await resolveUserFromMessage(message, text);
  seedTestWalletIfNeeded(targetUser);

  if (!targetUser) {
    return message.reply("Você precisa marcar alguém ou digitar o nome/ID exato para roubar! Ex: `!roubar @Pessoa` ou `!roubar nome.usuario`");
  }

  if (targetUser.id === userId) {
    return message.reply("Você não pode roubar de você mesmo!");
  }

  if (targetUser.bot) {
    return message.reply("Você não pode roubar bots. Nós somos programados para chamar a polícia cibernética.");
  }

  if (!isSuperAdmin(userId)) {
    const now = Date.now();
    let data = rouboCooldowns.get(userId) || { count: 0, resetAt: now, blockedUntil: 0 };

    if (now < data.blockedUntil) {
      const remaining = data.blockedUntil - now;
      return message.reply(`⏳ Calma aí! Você excedeu o limite de tentativas de roubo. Espere mais **${Math.ceil(remaining / 1000)} segundos**.`);
    }

    if (now > data.resetAt) {
      data.count = 0;
    }

    data.count++;
    data.resetAt = now + 60000; // janela de 1 minuto para resetar o combo

    if (data.count >= 5) {
      data.blockedUntil = now + 60000; // 1 minuto de timeout após 5 roubos
      data.count = 0;
    }

    rouboCooldowns.set(userId, data);
    salvarTimers();
  }

  if (isParrudo(targetUser.id)) {
    const { hasItem, removeItem } = require("../economy/inventory");
    const { hasEscudoEspinhos } = require("../economy/boosts");
    const weapon = getEquippedWeapon(userId);
    const weaponModifier = computeDuelWeaponModifier(weapon);
    const acidBreaks = isSuperAdmin(userId) || (Math.random() < config.static.app.duel.acidBreakChance);
    const gate = resolveParrudoStealGate({
      targetIsParrudo: true,
      targetHasThorns: hasEscudoEspinhos(targetUser.id),
      thiefHasAcid: hasItem(userId, 'acido_corrosivo'),
      acidBreaks,
      weaponPiercesParrudo: weaponModifier.piercesParrudo
    });

    if (gate.thornTriggered) {
      const multa = computeThornPenalty(getCoins(userId));
      if (multa > 0) {
        removeCoins(userId, multa);
        addCoins(targetUser.id, multa);
      }
      const thornEmbed = new EmbedBuilder()
        .setColor('#8B008B')
        .setTitle('🛡️ ESCUDO DE ESPINHOS!')
        .setDescription(`**${message.author.username}** tentou roubar **${targetUser.username}** enquanto ele estava PARRUDO e tomou a punição na hora.`)
        .addFields({ name: '🩸 Multa Paga', value: `\`- ${formatCoins(multa)} Nanacoins\`` });
      return message.reply({ embeds: [thornEmbed] });
    }

    if (gate.piercedByWeapon) {
      if (weaponModifier.durabilityCost) consumeWeaponDurability(userId, weapon.instanceId, weaponModifier.durabilityCost);
      const weaponEmbed = new EmbedBuilder()
        .setColor('#FACC15')
        .setTitle('⚔️ DEFESA PERFURADA!')
        .setDescription(`A arma **${formatWeaponLabel(weapon)}** furou o Parrudo de **${targetUser.username}** e o roubo vai acontecer!`);
      await message.channel.send({ embeds: [weaponEmbed] });
    } else if (gate.acidConsumed) {
      removeItem(userId, 'acido_corrosivo', 1); // Consome o item sempre

      if (gate.allowed) {
        // Ácido funcionou! O roubo prossegue normalmente (não retorna aqui)
        const acidEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('🧪 ÁCIDO CORROSIVO ATIVADO!')
          .setDescription(`O ácido derreteu o escudo de **${targetUser.username}**! O Parrudo foi neutralizado e o roubo vai acontecer!`)
          .setFooter({ text: 'O item foi consumido.' });
        await message.channel.send({ embeds: [acidEmbed] });
      } else {
        // Ácido falhou
        const failEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('🧪💨 ÁCIDO EVAPOROU!')
          .setDescription(`Você jogou o ácido em **${targetUser.username}**, mas o escudo Parrudo era forte demais! O ácido evaporou sem efeito.`)
          .setFooter({ text: 'O item foi consumido mesmo assim.' });
        return message.reply({ embeds: [failEmbed] });
      }
    } else if (!gate.allowed) {
      return message.reply(`🛡️ O usuário ${targetUser.username} tomou o suco e está **PARRUDO**! Ele está imune a roubos no momento.\n💡 *Dica: Compre um **Ácido Corrosivo 🧪** na \`!loja\` para ter 45% de chance de furar o escudo!*`);
    }
  }

  const myCoins = getCoins(userId);
  const targetCoins = getCoins(targetUser.id);

  if (targetCoins < config.static.app.duel.minTargetCoinsToSteal) {
    return message.reply(`O usuário ${targetUser.username} está muito pobre para ser roubado (menos de ${config.static.app.duel.minTargetCoinsToSteal} Nanacoins). Tenha piedade!`);
  }

  // Verificar se possui Boost de Roubo ativo
  const boostChance = getStealChanceExtra(userId);

  // Base 50% + boost (+10% extra se for superadmin)
  const successChance = computeStealChance({ boostChance, isSuperAdmin: isSuperAdmin(userId) });
  const success = Math.random() < successChance;

  const { hasPeCabra, hasEscudoEspinhos } = require("../economy/boosts");
  const { hasItem, removeItem } = require("../economy/inventory");

  if (success) {
    // Rouba entre 10% e 50% do dinheiro do alvo (ou 40-80% com pé de cabra)
    const percent = rollStealPercent(hasPeCabra(userId));
    const stolen = Math.floor(targetCoins * percent);

    removeCoins(targetUser.id, stolen);
    addCoins(userId, stolen);

    robFailures.delete(userId);
    salvarTimers();

    const embed = new EmbedBuilder()
      .setColor('#00AA00') // Verde escuro
      .setTitle('🥷 ASSALTO BEM-SUCEDIDO!')
      .setDescription(`Você agiu pelas sombras e furtou a carteira de **${targetUser.username}**.`)
      .addFields({ name: '💰 Valor Roubado', value: `\`+ ${formatCoins(stolen)} Nanacoins\`` })
      .setFooter({ text: 'O crime compensou desta vez.' });

    return message.reply({ embeds: [embed] });
  } else {
    // Falha e incrementa tentativas
    const embeds = [];

    if (hasEscudoEspinhos(targetUser.id)) {
      const multa = computeThornPenalty(myCoins);
      removeCoins(userId, multa);
      addCoins(targetUser.id, multa);
      
      const escudoEmbed = new EmbedBuilder()
        .setColor('#8B008B') // Roxo escuro
        .setTitle('🛡️ ESCUDO DE ESPINHOS!')
        .setDescription(`**${message.author.username}** tentou roubar, mas se espetou feio no escudo de **${targetUser.username}**!`)
        .addFields({ name: '🩸 Multa Paga', value: `\`- ${formatCoins(multa)} Nanacoins\`` });
      embeds.push(escudoEmbed);
    }

    let fails = (robFailures.get(userId) || 0) + 1;
    
    if (fails >= config.static.app.duel.jailAfterFailures) {
      robFailures.delete(userId);
      
      if (hasItem(userId, 'bomba_fumaca')) {
        removeItem(userId, 'bomba_fumaca', 1);
        const smokeEmbed = new EmbedBuilder()
          .setColor('#808080') // Cinza
          .setTitle('💨 ESCAPE NINJA')
          .setDescription('A polícia tentou te prender pela 2ª falha...\nMas você jogou uma **Bomba de Fumaça** no chão e desapareceu no ar!')
          .setFooter({ text: 'Suas falhas de roubo foram zeradas.' });
        embeds.push(smokeEmbed);
        salvarTimers();
        return message.reply({ embeds });
      }

      if (!isSuperAdmin(userId)) {
        prenderUsuario(userId, config.static.app.duel.jailMinutesOnStealFailure);
      }
      
      const jailEmbed = new EmbedBuilder()
        .setColor('#FF0000') // Vermelho
        .setTitle('🚓 BUSTED! VOCÊ FOI PRESO!')
        .setDescription(`A polícia te pegou tentando roubar **${targetUser.username}** pela 2ª vez consecutiva. Você está algemado.`)
        .addFields({ name: '⚖️ Sentença', value: `${config.static.app.duel.jailMinutesOnStealFailure} minutos sem jogar Forca, Aventura ou Roubar.` })
        .setFooter({ text: 'Dica: Alguém pode te tirar daí mais rápido pagando a !fianca' });
      embeds.push(jailEmbed);
      
      return message.reply({ embeds });
    } else {
      robFailures.set(userId, fails);
      const failEmbed = new EmbedBuilder()
        .setColor('#FFA500') // Laranja
        .setTitle('🚨 ALARME DISPARADO')
        .setDescription(`Você falhou ao tentar roubar **${targetUser.username}**. Você fugiu antes da polícia chegar, mas eles estão na sua cola.`)
        .addFields({ name: '⚠️ Nível de Procurado', value: `\`[ ${fails} / 2 ]\`` })
        .setFooter({ text: 'Na 2ª falha consecutiva você vai pra cadeia!' });
      embeds.push(failEmbed);
      
      return message.reply({ embeds });
    }
  }
}

async function handleTimeoutCommand(message) {
  const userId = message.author.id;
  if (!isPrisioneiro(userId)) {
    return message.reply("Você não está banido/na prisão no momento!");
  }
  const tempo = getTempoPrisaoRestante(userId);
  return message.reply(`🚓 Você ainda está banido por tentar roubar! Faltam **${tempo} minutos** para ser solto.\n💡 *Dica: Você pode usar \`!fianca\` para sair agora por 250 Nanacoins.*`);
}

async function handleFiancaCommand(message) {
  const userId = message.author.id;
  
  const args = message.content.split(/\s+/).slice(1);
  let targetUser = message.mentions.users.first();
  let prisioneiroId = targetUser ? targetUser.id : userId;

  if (!targetUser && args.length > 0) {
    targetUser = await resolveUserFromMessage(message, args[0]);
    if (targetUser) prisioneiroId = targetUser.id;
  }

  if (!isPrisioneiro(prisioneiroId)) {
    if (prisioneiroId === userId) {
      return message.reply("Você não está na prisão no momento!");
    } else {
      return message.reply(`O usuário ${targetUser.username} não está na prisão no momento!`);
    }
  }

  const myCoins = getCoins(userId);
  const bailCost = config.static.app.duel.bailCost;
  if (myCoins < bailCost) {
    return message.reply(`Você precisa de **${bailCost} Nanacoins 🪙** para pagar a fiança e tirar ${prisioneiroId === userId ? "você" : targetUser.username} da cadeia! (Seu saldo: ${myCoins})`);
  }

  removeCoins(userId, bailCost);
  prisonMap.delete(prisioneiroId);
  salvarTimers();
  
  if (prisioneiroId === userId) {
    return message.reply(`💸 **FIANÇA PAGA!** Você subornou o delegado com **${bailCost} Nanacoins 🪙** e está livre para voltar às ruas!`);
  } else {
    return message.reply(`💸 **FIANÇA PAGA!** ${message.author.username} subornou o delegado com **${bailCost} Nanacoins 🪙** e tirou ${targetUser.username} da cadeia!`);
  }
}

async function handleParrudoCommand(message, text) {
  const userId = message.author.id;

  if (isParrudo(userId)) {
    const tempo = getTempoParrudoRestante(userId);
    const horas = Math.floor(tempo / 60);
    const mins = tempo % 60;
    return message.reply(`💪 Você já está **PARRUDO**! Faltam **${horas}h e ${mins}m** para o efeito acabar.`);
  }

  // Parse hours from text
  const match = text ? text.match(/^(\d+)/) : null;
  if (!match) {
    return message.reply("🛡️ **Você precisa informar quantas horas quer comprar!**\nOpções disponíveis:\n👉 `!parrudo 1h` — Custa 250 Nanacoins\n👉 `!parrudo 2h` — Custa 500 Nanacoins\n👉 `!parrudo 5h` — Custa 1000 Nanacoins\n👉 `!parrudo 10h` — Custa 5000 Nanacoins");
  }
  const requestedHours = parseInt(match[1], 10);

  const option = selectParrudoOption(requestedHours);
  const cost = option.cost;
  const durationHours = option.hours;

  const myCoins = getCoins(userId);
  if (myCoins < cost) {
    return message.reply(`Você precisa de **${formatCoins(cost)} Nanacoins 🪙** para comprar a proteção Parruda de ${durationHours}h! (Seu saldo: ${formatCoins(myCoins)})`);
  }

  removeCoins(userId, cost);
  parrudoMap.set(userId, Date.now() + durationHours * 60 * 60 * 1000);
  salvarTimers();
  return message.reply(`🛡️ **MODO PARRUDO ATIVADO!** Você bebeu o suco, pagou ${formatCoins(cost)} Nanacoins 🪙 e ficará **irroubável por ${durationHours} horas**! Ninguém pode encostar no seu dinheiro.`);
}

async function narrarResolucaoIa(p1Name, p1Choice, p2Name, p2Choice, winnerName, winReason) {
  const prompt = `Escreva uma cena de combate muito épica e cômica (no máximo 3 parágrafos curtos) no estilo anime. 
Lutadores: ${p1Name} e ${p2Name}.
${p1Name} usou a técnica: ${p1Choice}.
${p2Name} usou a técnica: ${p2Choice}.
O resultado foi: ${winnerName === 'Empate' ? 'A batalha terminou em um empate constrangedor.' : `${winnerName} venceu porque ${winReason}.`}
Faça o texto parecer empolgante, seja criativo com os golpes, mas não diga "Aqui está o texto" ou saia do personagem. Apenas narre.`;

  try {
    const response = await perguntarIaPrompt(prompt, { logLabel: "Duelo/IA" });
    return response.trim();
  } catch (err) {
    console.error("Erro na narração do duelo:", err);
    return `*A IA narradora quebrou a televisão e fugiu. Mas saibam que a luta foi muito feia, cheia de poeira e gritaria.*`;
  }
}

async function handleButtonInteraction(interaction) {
  if (!interaction.isButton()) return;
  const parts = interaction.customId.split('_');
  if (parts[0] !== 'duel') return;

  const duelId = `${parts[0]}_${parts[1]}_${parts[2]}`;
  const action = parts[3];

  const duel = activeDuels.get(duelId);
  if (!duel) {
    return interaction.reply({ content: "Este duelo já expirou ou foi concluído.", flags: MessageFlags.Ephemeral });
  }

  const userId = interaction.user.id;

  if (duel.p1.id !== userId && duel.p2.id !== userId) {
    return interaction.reply({ content: "Você não faz parte deste duelo. Sai pra lá metido!", flags: MessageFlags.Ephemeral });
  }

  const playerObj = duel.p1.id === userId ? duel.p1 : duel.p2;

  if (playerObj.choice) {
    return interaction.reply({ content: `Você já escolheu **${playerObj.choice}**! Aguarde o oponente.`, flags: MessageFlags.Ephemeral });
  }

  playerObj.choice = action;
  await interaction.reply({ content: `Você escolheu secretamente **${action}**! 🤫`, flags: MessageFlags.Ephemeral });

  // Checar se ambos escolheram
  if (duel.p1.choice && duel.p2.choice) {
    if (duel.timerId) clearTimeout(duel.timerId);
    activeDuels.delete(duelId);

    // Desabilitar botões na mensagem original
    const channel = interaction.client.channels.cache.get(duel.channelId);
    if (channel) {
      const msg = await channel.messages.fetch(duel.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ components: [] }).catch(() => null);
      }
    }

    const { getActiveBuff, decrementBuff } = require("../economy/activeEffects");

    const p1Weapon = getEquippedWeapon(duel.p1.id);
    const p2Weapon = getEquippedWeapon(duel.p2.id);
    const p1WeaponMod = computeDuelWeaponModifier(p1Weapon, duel.p2.choice);
    const p2WeaponMod = computeDuelWeaponModifier(p2Weapon, duel.p1.choice);

    const p1Buff = getActiveBuff(duel.p1.id, "duel");
    const p2Buff = getActiveBuff(duel.p2.id, "duel");

    if (p1Buff?.duelPowerBonus) p1WeaponMod.power += p1Buff.duelPowerBonus;
    if (p2Buff?.duelPowerBonus) p2WeaponMod.power += p2Buff.duelPowerBonus;

    let duelResult;
    if (p1WeaponMod.piercesDefense && duel.p2.choice === "Defesa") {
      duelResult = { winner: duel.p1, loser: duel.p2, reason: `${p1Weapon.def.name} furou a Defesa do oponente` };
    } else if (p2WeaponMod.piercesDefense && duel.p1.choice === "Defesa") {
      duelResult = { winner: duel.p2, loser: duel.p1, reason: `${p2Weapon.def.name} furou a Defesa do oponente` };
    } else {
      duelResult = resolveDuel(duel.p1, duel.p2);
      if (!duelResult.winner && p1WeaponMod.power !== p2WeaponMod.power) {
        duelResult = p1WeaponMod.power > p2WeaponMod.power
          ? { winner: duel.p1, loser: duel.p2, reason: `${p1Weapon.def.name} decidiu o empate pela força da arma` }
          : { winner: duel.p2, loser: duel.p1, reason: `${p2Weapon.def.name} decidiu o empate pela força da arma` };
      }
    }

    if (p1Weapon && p1WeaponMod.durabilityCost) consumeWeaponDurability(duel.p1.id, p1Weapon.instanceId, p1WeaponMod.durabilityCost);
    if (p2Weapon && p2WeaponMod.durabilityCost) consumeWeaponDurability(duel.p2.id, p2Weapon.instanceId, p2WeaponMod.durabilityCost);
    
    if (p1Buff) decrementBuff(duel.p1.id, "duel");
    if (p2Buff) decrementBuff(duel.p2.id, "duel");

    const winner = duelResult.winner || "Empate";
    const reason = duelResult.reason;

    let resultadoFinal = "";
    if (winner === "Empate") {
      addCoins(duel.p1.id, duel.amount);
      addCoins(duel.p2.id, duel.amount);
      resultadoFinal = `**EMPATE!** Ninguém ganha nada e os ${duel.amount} Nanacoins 🪙 foram devolvidos.`;
    } else {
      // Vencedor leva tudo (seu próprio pote de volta + a aposta do outro)
      addCoins(winner.id, duel.amount * 2);
      const perdedor = winner.id === duel.p1.id ? duel.p2 : duel.p1;
      resultadoFinal = `🏆 **VITÓRIA!** O grande vencedor foi **${winner.name}**, que levou o pote de **${duel.amount * 2} Nanacoins 🪙** para casa, deixando ${perdedor.name} quebrado!`;
    }

    const m = await channel.send(`⏳ **OS LUTADORES FIZERAM SUAS ESCOLHAS!**\nA IA está escrevendo a narração épica da treta...`);
    
    const narracao = await narrarResolucaoIa(
      duel.p1.name, duel.p1.choice,
      duel.p2.name, duel.p2.choice,
      winner === "Empate" ? "Empate" : winner.name,
      reason
    );

    const resultEmbed = new EmbedBuilder()
      .setColor(winner === "Empate" ? '#FFA500' : '#00FF00')
      .setTitle('🔥 A RESOLUÇÃO DO DUELO 🔥')
      .setDescription(narracao)
      .addFields({ name: '🏆 Resultado Final', value: resultadoFinal });

    await m.edit({ content: null, embeds: [resultEmbed] });
  }
}

async function handleBeijarMuroCommand(message) {
  const userId = message.author.id;
  if (isPrisioneiro(userId)) {
    return message.reply(`🚓 Você está na prisão e a parede da cela é fria demais para beijar.`);
  }

  if (beijoCooldowns.has(userId)) {
    const expire = beijoCooldowns.get(userId);
    if (Date.now() < expire) {
      const mins = Math.ceil((expire - Date.now()) / 60000);
      return message.reply(`👄 Seus lábios estão doendo! Espere **${mins} minutos** para usar o comando de novo.`);
    }
  }

  beijoCooldowns.set(userId, Date.now() + config.static.app.duel.kissCooldownMs);
  salvarTimers();

  const { hasItem, removeItem } = require("../economy/inventory");
  const hasCoelho = hasItem(userId, 'pe_coelho');
  const embeds = [];

  if (hasCoelho) {
    removeItem(userId, 'pe_coelho', 1);
    const coelhoEmbed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('🐰 PÉ DE COELHO!')
      .setDescription(`A sorte está ao lado de **${message.author.username}** neste beijo! (Imune a cadeia/azar)`);
    embeds.push(coelhoEmbed);
  }

  const rng = hasCoelho ? Math.random() * 0.49 : Math.random();
  const gifBom = "https://media.giphy.com/media/Pk3ljzIDb4R0j3zpMU/giphy.gif";
  const gifRuim = "https://media.giphy.com/media/RbAJaIKpGMQLlciHnn/giphy.gif";

  const resultEmbed = new EmbedBuilder();

  if (rng < 0.25) {
    const { getGameMultiplier } = require("../economy/boosts");
    const premio = config.static.app.duel.kissRewards.big * getGameMultiplier(userId);
    addCoins(userId, premio);
    resultEmbed.setColor('#FFD700') // Dourado
      .setTitle('💋 BEIJO DA SORTE GRANDE!')
      .setDescription('Você beijou o muro com paixão e encontrou um tesouro escondido!')
      .addFields({ name: '💰 Prêmio', value: `\`+ ${premio} Nanacoins\`` })
      .setImage(gifBom);
  } else if (rng < 0.50) {
    const { getGameMultiplier } = require("../economy/boosts");
    const premio = config.static.app.duel.kissRewards.small * getGameMultiplier(userId);
    addCoins(userId, premio);
    resultEmbed.setColor('#FFFF00') // Amarelo
      .setTitle('💋 BEIJO DA SORTE!')
      .setDescription('Você deu um beijinho no muro e achou uma carteira caída no chão!')
      .addFields({ name: '💰 Prêmio', value: `\`+ ${premio} Nanacoins\`` })
      .setImage(gifBom);
  } else if (rng < 0.75) {
    const penalty = Math.min(getCoins(userId), config.static.app.duel.kissRewards.smallPenalty);
    if (penalty > 0) removeCoins(userId, penalty);
    resultEmbed.setColor('#FFA500') // Laranja
      .setTitle('🧱💥 BATEU A CARA!')
      .setDescription('O muro revidou! Você quebrou um dente e deixou cair moedas do bolso.')
      .addFields({ name: '🩸 Perda', value: `\`- ${penalty} Nanacoins\`` })
      .setImage(gifRuim);
  } else if (rng < 0.90) {
    const penalty = Math.min(getCoins(userId), config.static.app.duel.kissRewards.bigPenalty);
    if (penalty > 0) removeCoins(userId, penalty);
    resultEmbed.setColor('#8B0000') // Vermelho Escuro
      .setTitle('🤢 QUE NOJO!')
      .setDescription('Você beijou a boca de uma barata que estava no muro. A consulta no posto custou caro!')
      .addFields({ name: '💸 Despesas Médicas', value: `\`- ${penalty} Nanacoins\`` })
      .setImage(gifRuim);
  } else {
    prenderUsuario(userId, config.static.app.duel.kissJailMinutes);
    resultEmbed.setColor('#FF0000') // Vermelho
      .setTitle('🚓🚨 PEGO NO ATO!')
      .setDescription('A polícia passou na hora, achou que você estava vandalizando o muro e te levou preso!')
      .addFields({ name: '⚖️ Sentença', value: `${config.static.app.duel.kissJailMinutes} minutos de cadeia.` })
      .setImage(gifRuim);
  }

  embeds.push(resultEmbed);
  return message.reply({ embeds });
}

async function handleDueloModalSubmit(interaction) {
  const targetQueryRaw = interaction.fields.getTextInputValue('duelo_target').trim();
  const targetQuery = targetQueryRaw.toLowerCase();
  const amountText = interaction.fields.getTextInputValue('duelo_amount').trim();
  const userId = interaction.user.id;

  if (isPrisioneiro(userId)) {
    return interaction.reply({ content: `🚓 Você não pode duelar de dentro da prisão! Faltam **${getTempoPrisaoRestante(userId)} minutos**.`, flags: MessageFlags.Ephemeral });
  }

  const targetUser = await resolveUserFromInteraction(interaction, targetQueryRaw);
  seedTestWalletIfNeeded(targetUser);

  if (!targetUser) {
    return interaction.reply({ content: "❌ Não consegui encontrar o adversário! Tente usar o ID ou o nome exato.", flags: MessageFlags.Ephemeral });
  }

  const amount = parsePositiveAmount(amountText);
  if (!amount) {
    return interaction.reply({ content: "Você deve apostar um valor válido maior que 0.", flags: MessageFlags.Ephemeral });
  }

  if (targetUser.id === userId) {
    return interaction.reply({ content: "Você não pode duelar com você mesmo.", flags: MessageFlags.Ephemeral });
  }

  if (targetUser.bot) {
    return interaction.reply({ content: "Bots não participam de duelos clandestinos.", flags: MessageFlags.Ephemeral });
  }

  if (isPrisioneiro(targetUser.id)) {
    return interaction.reply({ content: `O usuário ${targetUser.username} está na cadeia. Presidiários não duelam.`, flags: MessageFlags.Ephemeral });
  }

  const myCoins = getCoins(userId);
  if (myCoins < amount) {
    return interaction.reply({ content: `Você não tem ${amount} Nanacoins 🪙 para apostar! (Seu saldo: ${myCoins})`, flags: MessageFlags.Ephemeral });
  }

  const targetCoins = getCoins(targetUser.id);
  if (targetCoins < amount) {
    return interaction.reply({ content: `${targetUser.username} não tem ${amount} Nanacoins 🪙 para bancar essa aposta. Que vergonha!`, flags: MessageFlags.Ephemeral });
  }

  // Desconta logo de ambos para travar no pote
  removeCoins(userId, amount);
  removeCoins(targetUser.id, amount);

  const duelId = `duel_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const actionEntries = Object.entries(config.static.app.duel.actions);
  const actionKeys = actionEntries.map(([action]) => action);
  const isMock = targetUser.id === config.static.app.test.user.id;
  const mockChoice = isMock ? choice(actionKeys) : null;

  activeDuels.set(duelId, {
    p1: { id: userId, name: interaction.user.username, choice: null },
    p2: { id: targetUser.id, name: targetUser.username, choice: mockChoice },
    amount: amount,
    channelId: interaction.channel.id,
    messageId: null,
    timerId: null
  });

  const row = new ActionRowBuilder()
    .addComponents(
      ...actionEntries.map(([action, actionConfig]) => new ButtonBuilder()
        .setCustomId(`${duelId}_${action}`)
        .setLabel(actionConfig.label)
        .setStyle(ButtonStyle[actionConfig.style] || ButtonStyle.Primary))
    );

  const duelEmbed = new EmbedBuilder()
    .setColor('#000000') // Preto para cartaz de luta
    .setTitle('🥊 CARTAZ DE LUTA CLANDESTINA')
    .setDescription(`Um duelo épico está prestes a começar! As moedas já foram travadas no pote central.\nEscolham suas táticas secretamente nos botões abaixo.`)
    .addFields(
      { name: '🔴 Desafiante', value: `**${interaction.user.username}**`, inline: true },
      { name: '🔵 Desafiado', value: `**${targetUser.username}**`, inline: true },
      { name: '💰 Pote Total (Prêmio)', value: `\`${formatCoins(amount * 2)} Nanacoins\``, inline: false },
      { name: '⏳ Tempo Restante', value: `${Math.round(config.static.app.duel.timeoutMs / 60000)} minutos para escolherem suas ações!`, inline: false }
    )
    .setImage('https://media.giphy.com/media/QSwBid1bso4h5ePFnN/giphy.gif');

  await interaction.reply({
    content: `<@${targetUser.id}> Você foi desafiado por <@${userId}>!`,
    embeds: [duelEmbed],
    components: [row]
  });

  const sentMessage = await interaction.fetchReply();

  const duelRef = activeDuels.get(duelId);
  duelRef.messageId = sentMessage.id;

  // Timeout de 2 minutos
  duelRef.timerId = setTimeout(async () => {
    if (activeDuels.has(duelId)) {
      const duel = activeDuels.get(duelId);
      activeDuels.delete(duelId);

      // Devolve o dinheiro
      addCoins(duel.p1.id, duel.amount);
      addCoins(duel.p2.id, duel.amount);

      await sentMessage.edit({ components: [] }).catch(() => null);
      const woEmbed = new EmbedBuilder()
        .setColor('#808080')
        .setTitle('⏰ DUELO CANCELADO POR W.O!')
        .setDescription(`O duelo entre **${interaction.user.username}** e **${targetUser.username}** expirou porque alguém amarelou.\nAs apostas (\`${formatCoins(duel.amount)} Nanacoins\`) foram devolvidas para as carteiras.`);
      interaction.channel.send({ embeds: [woEmbed] });
    }
  }, config.static.app.duel.timeoutMs);
}

module.exports = {
  isPrisioneiro,
  isParrudo,
  prenderUsuario,
  handleRoubarCommand,
  handleTimeoutCommand,
  handleFiancaCommand,
  handleParrudoCommand,
  handleButtonInteraction,
  handleBeijarMuroCommand,
  handleDueloModalSubmit
};
