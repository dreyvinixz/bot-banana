function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isCommand(message, commands) {
  const content = message.content.trim().toLowerCase();
  return commands.some((cmd) => content === cmd || content.startsWith(`${cmd} `));
}

function getCommandText(message, commands) {
  const raw = message.content.trim();
  const lower = raw.toLowerCase();
  const cmd = commands.find((candidate) => lower === candidate || lower.startsWith(`${candidate} `));
  return cmd ? raw.slice(cmd.length).trim() : "";
}

async function traduzirParaIngles(texto) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(texto)}`;
    const res = await fetch(url);
    const data = await res.json();
    return data[0].map(item => item[0]).join('');
  } catch (err) {
    console.error("Erro na tradução literal do Google:", err);
    return texto;
  }
}

module.exports = {
  escapeXml,
  isCommand,
  getCommandText,
  traduzirParaIngles
};
