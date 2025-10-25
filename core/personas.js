import fs from 'fs';
import path from 'path';

const PERSONA_DIR = path.join(process.cwd(), 'personas');

export function loadPersona(role) {
  if (!role) {
    throw new Error('Role required for persona lookup');
  }
  const filePath = path.join(PERSONA_DIR, `${role}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing persona set for ${role}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error(`No persona variants defined for ${role}`);
  }
  const pick = parsed[Math.floor(Math.random() * parsed.length)];
  console.log(`[Persona] ${role} variant → ${pick.id || 'unknown'} (${pick.icon || '•'})`);
  return pick;
}
