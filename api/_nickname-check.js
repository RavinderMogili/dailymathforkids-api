/**
 * Nickname moderation — validates nicknames for public display.
 * Used at registration and when opting into the public leaderboard.
 */

// Common profanity and inappropriate words (lowercase)
const BLOCKED_WORDS = [
  'fuck', 'shit', 'ass', 'damn', 'hell', 'bitch', 'bastard', 'dick', 'penis',
  'vagina', 'sex', 'porn', 'nude', 'naked', 'kill', 'murder', 'rape', 'nazi',
  'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'cunt', 'cock',
  'boob', 'tits', 'anus', 'butthole', 'dildo', 'erect', 'orgasm', 'molest',
  'pedo', 'suicide', 'heroin', 'cocaine', 'meth',
];

// Reserved/impersonation names (lowercase)
const RESERVED_NAMES = [
  'admin', 'administrator', 'teacher', 'support', 'official', 'moderator',
  'mod', 'staff', 'system', 'dailymathforkids', 'mathforkids', 'helpdesk',
  'principal', 'superuser', 'root', 'operator',
];

/**
 * Validate a nickname for safety and appropriateness.
 * Returns { valid: true } or { valid: false, reason: string }
 */
export function validateNickname(nickname) {
  if (typeof nickname !== 'string') {
    return { valid: false, reason: 'Nickname must be text.' };
  }

  const trimmed = nickname.trim();

  // Length check
  if (trimmed.length < 3) {
    return { valid: false, reason: 'Nickname must be at least 3 characters.' };
  }
  if (trimmed.length > 20) {
    return { valid: false, reason: 'Nickname must be 20 characters or less.' };
  }

  // HTML/script injection
  if (/<|>|&lt;|&gt;|javascript:|on\w+\s*=/i.test(trimmed)) {
    return { valid: false, reason: 'Nickname contains invalid characters.' };
  }

  const lower = trimmed.toLowerCase();

  // Email address pattern
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) {
    return { valid: false, reason: 'Nickname cannot be an email address. Choose a fun nickname instead!' };
  }

  // Phone number pattern (7+ consecutive digits, with optional separators)
  if (/(\d[\d\s\-().]{5,}\d)/.test(trimmed)) {
    return { valid: false, reason: 'Nickname cannot contain a phone number. Choose a fun nickname instead!' };
  }

  // URL pattern
  if (/https?:\/\/|www\.|\.com|\.net|\.org|\.io/i.test(trimmed)) {
    return { valid: false, reason: 'Nickname cannot be a URL. Choose a fun nickname instead!' };
  }

  // Social media handle patterns (@username, common platform prefixes)
  if (/^@/.test(trimmed) || /^(ig|tiktok|snap|insta|fb|twitter|twitch)[\s_.:]/i.test(trimmed)) {
    return { valid: false, reason: 'Nickname cannot be a social media username. Choose a fun nickname instead!' };
  }

  // Reserved/impersonation names
  const lowerNoSpaces = lower.replace(/[\s_\-\.0-9]/g, '');
  for (const reserved of RESERVED_NAMES) {
    if (lowerNoSpaces === reserved || lowerNoSpaces.includes(reserved)) {
      return { valid: false, reason: `"${trimmed}" looks like a reserved name. Please choose a different nickname.` };
    }
  }

  // Profanity check — check if any blocked word appears as a substring
  for (const word of BLOCKED_WORDS) {
    if (lower.includes(word)) {
      return { valid: false, reason: 'This nickname contains inappropriate language. Please choose a different one.' };
    }
  }

  // Warn about potential real names (two capitalized words like "John Smith")
  // This is a soft warning, not a hard block
  const realNamePattern = /^[A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15}$/;
  if (realNamePattern.test(trimmed)) {
    return {
      valid: false,
      reason: 'This looks like a real name. For your safety, please choose a more playful nickname that does not include your real name.',
      isNameWarning: true,
    };
  }

  return { valid: true };
}
