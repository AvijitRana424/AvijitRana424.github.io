// Small monogram "chips" for technologies (no brand logos).
// Hand-picked abbreviations read better than naive initials.
const ABBR: Record<string, string> = {
  java: 'Jv',
  'spring boot': 'SB',
  mysql: 'My',
  jwt: 'JWT',
  kafka: 'Kf',
  oauth2: 'OA',
  microservices: 'µS',
  react: 'Re',
  'node.js': 'No',
  express: 'Ex',
  mongodb: 'Mg',
  redis: 'Rd',
  aws: 'AWS',
  flutter: 'Fl',
  dart: 'Dt',
  hive: 'Hv',
  firebase: 'Fb',
  codemagic: 'CM',
  python: 'Py',
  supabase: 'Su',
  'github actions': 'GA',
  playwright: 'Pw',
};

// Soft pastel fills that sit well on cream paper (ink text on top).
const FILLS = ['#f3d2c1', '#cfe6d8', '#d9d4f6', '#f7e8a4', '#cde3f1', '#f6c9c4', '#e4dccb'];

export function techMonogram(name: string): string {
  const key = name.trim().toLowerCase();
  if (ABBR[key]) return ABBR[key];
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? name;
  return w.slice(0, 1).toUpperCase() + w.slice(1, 2).toLowerCase();
}

export function techFill(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FILLS[h % FILLS.length];
}
