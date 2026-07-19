function choice(items, rng = Math.random) {
  if (!items || items.length === 0) return null;
  return items[Math.floor(rng() * items.length)];
}

function integerBetween(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function weightedChoice(items, rng = Math.random) {
  if (!items || items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
  if (total <= 0) return items[0];

  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, Number(item.weight) || 0);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

function percentBetween(range, rng = Math.random) {
  return range.min + rng() * (range.max - range.min);
}

module.exports = {
  choice,
  integerBetween,
  shuffle,
  weightedChoice,
  percentBetween
};
