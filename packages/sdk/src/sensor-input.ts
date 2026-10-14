import { now, type Fact } from '../../core/src/domain.js';

/** External input framing only: relevance and interpretation belong to cognition. */
export function sensorFacts(text: string, speaker = 'user'): Fact[] {
  const timestamp = now();
  const fact = (channel: string, value: string): Fact => ({ source: `Sensor ${channel}`, kind: 'observes',
    text: value, timestamp, referenceId: null });
  if (!/^\s*\/sensor(?:\s|$)/i.test(text)) {
    return [fact('audio', `${speaker === 'user' ? 'Someone' : speaker} says: ${text}`)];
  }
  const facts: Fact[] = [];
  let rest = text.trim();
  const invalid = () => new Error('Use /sensor audio "James says: Hello" "Bird chirps" /sensor visual "A desk". Each channel needs data; close all double quotes.');
  while (rest) {
    const header = /^\/sensor\s+([\w-]+)\s+/i.exec(rest);
    if (!header) throw invalid();
    const channel = header[1]!.toLowerCase();
    rest = rest.slice(header[0].length).trimStart();
    let count = 0;
    while (rest && !/^\/sensor(?:\s|$)/i.test(rest)) {
      let value = '';
      if (rest.startsWith('"')) {
        let end = 1;
        for (; end < rest.length; end++) {
          const char = rest[end]!;
          if (char === '"') break;
          if (char === '\\' && (rest[end + 1] === '"' || rest[end + 1] === '\\')) value += rest[++end];
          else value += char;
        }
        if (end === rest.length || (rest[end + 1] && !/\s/.test(rest[end + 1]!))) throw invalid();
        rest = rest.slice(end + 1).trimStart();
      } else {
        const next = rest.search(/\s+\/sensor(?:\s|$)/i);
        value = next < 0 ? rest : rest.slice(0, next);
        rest = next < 0 ? '' : rest.slice(next).trimStart();
      }
      if (!value.trim()) throw invalid();
      facts.push(fact(channel, value));
      count++;
    }
    if (!count) throw invalid();
  }
  return facts;
}
