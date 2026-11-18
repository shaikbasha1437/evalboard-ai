// Return 0..1, true/false, or { score, pass, reason }.
// helpers.normalize(text) and helpers.words(text) are available.
function score({ input, expected, output, context, tags }) {
  const want = helpers.normalize(expected);
  const got = helpers.normalize(output);
  if (!got) return { score: 0, pass: false, reason: "Empty output." };
  const words = helpers.words(output).length;
  const ok = got.includes(want) && words <= 40;
  return { score: ok ? 1 : 0, pass: ok, reason: ok ? "Contains the answer in 40 words or fewer." : "Missing the answer or too long (" + words + " words)." };
}
