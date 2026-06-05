// Agents zijn per gebruiker (opgeslagen in de `agents`-tabel). De telefoon
// praat met de gedeelde Vercel-route op justmyplan.com die het bericht — met
// de system prompt van die agent — naar Claude stuurt.
export const AGENT_RUN_URL = 'https://justmyplan.com/api/agent-run';

export const MODEL_BADGE_COLOR = { opus: '#7c3aed', sonnet: '#2563EB', haiku: '#059669' };
export const MODEL_OPTIONS = [
  ['opus',   'Opus'],
  ['sonnet', 'Sonnet'],
  ['haiku',  'Haiku'],
];

export const AGENT_EMOJI_CHOICES = ['🤖', '📬', '📈', '💼', '⚖️', '🔭', '📡', '✍️', '🌐', '🎯', '💡', '🎓', '📚', '🔨', '👶', '🧠', '🛠️', '📊'];
