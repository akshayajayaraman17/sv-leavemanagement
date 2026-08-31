// Excludes visually ambiguous characters (0/O, 1/l/I) since these
// temporary passwords are often read aloud or typed from a printout.
const CHARSETS = {
  upper:  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower:  'abcdefghjkmnpqrstuvwxyz',
  digit:  '23456789',
  symbol: '!@#$%&*',
}

function randomChar(set) {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return set[bytes[0] % set.length]
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    const j = bytes[0] % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Guarantees at least one char from each set, 12 characters total.
export function generateTempPassword() {
  const required = [
    randomChar(CHARSETS.upper),
    randomChar(CHARSETS.lower),
    randomChar(CHARSETS.digit),
    randomChar(CHARSETS.symbol),
  ]
  const all = CHARSETS.upper + CHARSETS.lower + CHARSETS.digit + CHARSETS.symbol
  const rest = Array.from({ length: 8 }, () => randomChar(all))
  return shuffle([...required, ...rest]).join('')
}

export const PASSWORD_HINT = '8+ characters, with an uppercase letter, a lowercase letter, a number, and a symbol (!@#$%&*)'

// Same complexity bar as generateTempPassword's own charsets — applied
// wherever a human picks their own password (forced first-login change,
// Forgot Password reset, Profile's self-service change), so a
// user-chosen password can't be weaker than the auto-generated one.
export function passwordError(pw) {
  if (!pw || pw.length < 8)      return 'Min 8 characters'
  if (!/[A-Z]/.test(pw))         return 'Must include an uppercase letter'
  if (!/[a-z]/.test(pw))         return 'Must include a lowercase letter'
  if (!/[0-9]/.test(pw))         return 'Must include a number'
  if (!/[!@#$%&*]/.test(pw))     return 'Must include a symbol (!@#$%&*)'
  return null
}
