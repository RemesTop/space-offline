const banned = ["fuck", "shit", "bitch", "cunt", "nigg", "fag", "retard"];

export const filterName = (name: string) => {
  let cleaned = name.trim();
  for (const b of banned) {
    const re = new RegExp(b, "ig");
    cleaned = cleaned.replace(re, "****");
  }
  if (!cleaned) cleaned = "Anon";
  return cleaned.slice(0, 24);
};
