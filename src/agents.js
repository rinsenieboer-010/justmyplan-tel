// Agents (zelfde set als de web-app). De telefoon praat met de gedeelde
// Vercel-route op justmyplan.com die het bericht naar Claude stuurt.
export const AGENT_RUN_URL = 'https://justmyplan.com/api/agent-run';

export const HARDCODED_AGENTS = [
  { id: 'bart',        name: 'Bart',        role: 'Centrale dispatcher',     model: 'sonnet', emoji: '📬' },
  { id: 'teacher',     name: 'Teacher',     role: 'Verbetert alle agents',   model: 'opus',   emoji: '📚' },
  { id: 'agent-maker', name: 'Agent Maker', role: 'Bouwt nieuwe agents',     model: 'opus',   emoji: '🔨' },
  { id: 'piet',        name: 'Piet',        role: 'Portfolio manager',       model: 'opus',   emoji: '📈' },
  { id: 'alex',        name: 'Alex',        role: 'Accountant & adviseur',   model: 'sonnet', emoji: '💼' },
  { id: 'dick',        name: 'Dick',        role: 'Advocaat',                model: 'opus',   emoji: '⚖️' },
  { id: 'scott',       name: 'Scott',       role: 'Verkenner & onderzoeker', model: 'sonnet', emoji: '🔭' },
  { id: 'ivo',         name: 'Ivo',         role: 'Tech & AI monitor',       model: 'sonnet', emoji: '📡' },
  { id: 'bram',        name: 'Bram',        role: 'Brand manager',           model: 'sonnet', emoji: '✍️' },
  { id: 'wes',         name: 'Wes',         role: 'Website manager',         model: 'sonnet', emoji: '🌐' },
  { id: 'baby',        name: 'Baby',        role: 'Ontwikkelingsagent',      model: 'haiku',  emoji: '👶' },
  { id: 'chris',       name: 'Chris',       role: 'Kritisch adviseur',       model: 'opus',   emoji: '🎯' },
  { id: 'handy',       name: 'Handy',       role: 'Tips & werkwijzen',       model: 'haiku',  emoji: '💡' },
  { id: 'stage',       name: 'Stage',       role: 'Stageplek zoeker',        model: 'opus',   emoji: '🎓' },
];

export const MODEL_BADGE_COLOR = { opus: '#7c3aed', sonnet: '#2563EB', haiku: '#059669' };
