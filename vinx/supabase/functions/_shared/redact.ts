// A conservative filter for things nobody wants stored in a "second brain": passwords, one-time codes,
// card numbers, API secrets, private keys and national-ID style numbers. It errs on the side of leaving
// text alone (a friend's account number should stay recallable), and it cannot see inside images.

export interface Screened {
  text: string;
  /** the whole message was a one-time code / private key: do not save anything */
  skip: boolean;
  /** what was removed, for telling the person ("a card number") */
  removed: string[];
}

function luhn(digits: string): boolean {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

const OTP_WORDS = /\b(otp|one[- ]?time|verification|security|login|log-in|sign[- ]?in|confirmation|auth(?:entication)?|2fa|passcode)\b/i;
const OTP_CODE = /\b\d{4,8}\b|\b\d{3}[- ]\d{3}\b/;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

export function screenText(input: string): Screened {
  const removed: string[] = [];
  let text = input ?? "";

  if (PRIVATE_KEY.test(text)) return { text: "", skip: true, removed: ["a private key"] };

  // a short message that is basically "your code is 123456"
  if (text.length < 220 && OTP_WORDS.test(text) && /\bcode\b|\botp\b|\bpin\b|\bpasscode\b/i.test(text) && OTP_CODE.test(text)) {
    return { text: "", skip: true, removed: ["a one-time code"] };
  }

  // card numbers: 13-19 digits (spaces/dashes allowed) that pass the Luhn check
  text = text.replace(/(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g, (m) => {
    const digits = m.replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) { removed.push("a card number"); return "[card number removed]"; }
    return m;
  });

  // seed / recovery phrases: 12-24 plain words after the label
  text = text.replace(/\b(seed|recovery)\s+phrase\b(\s*(?:is|=|:)\s*)((?:[a-z]{3,8}\s+){11,23}[a-z]{3,8})\b/gi, (_m, w: string, sep: string) => {
    removed.push("a recovery phrase");
    return `${w} phrase${sep}[removed]`;
  });

  // "password: xyz", "my pin is 4821", "cvv 123", "api key = ..."
  text = text.replace(
    /\b(password|passwd|passphrase|pwd|pin|cvv|cvc|secret(?:\s+key)?|api[\s_-]?key|access[\s_-]?token|auth[\s_-]?token|private[\s_-]?key)\b(\s*(?:is|are|was|=|:)\s*|\s+)([^\s,;]{3,})/gi,
    (m, label: string, sep: string, value: string) => {
      // only mask values that look like secrets, so "password manager" or "pin the post" stay untouched
      const looksSecret = /[\d@#$%^&*_!+=-]/.test(value) || value.length >= 12;
      if (!looksSecret) return m;
      removed.push("a password or secret");
      return `${label}${sep}[removed]`;
    },
  );

  // well-known token shapes
  const tokenShapes: [RegExp, string][] = [
    [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, "an API key"],
    [/\bAKIA[0-9A-Z]{16}\b/g, "an API key"],
    [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, "an API key"],
    [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "an API key"],
    [/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}\b/g, "an access token"],
  ];
  for (const [re, label] of tokenShapes) {
    text = text.replace(re, () => { removed.push(label); return "[removed]"; });
  }

  // national ID style numbers when they are explicitly labelled (BVN/NIN in Nigeria, SSN in the US)
  text = text.replace(/\b(bvn|nin|ssn|social security(?: number)?)\b(\s*(?:is|=|:|number|no\.?)?\s*)(\d[\d -]{7,14}\d)\b/gi, (_m, label: string, sep: string) => {
    removed.push("an ID number");
    return `${label}${sep}[removed]`;
  });

  return { text, skip: false, removed: [...new Set(removed)] };
}

/** "a card number and a password or secret" */
export function describeRemoved(removed: string[]): string {
  if (removed.length <= 1) return removed[0] ?? "";
  return removed.slice(0, -1).join(", ") + " and " + removed[removed.length - 1];
}
