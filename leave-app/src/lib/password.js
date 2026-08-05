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
