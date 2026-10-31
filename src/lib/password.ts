export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'letter', label: 'A letter', test: (p: string) => /[A-Za-z]/.test(p) },
  { id: 'number', label: 'A number', test: (p: string) => /\d/.test(p) },
  { id: 'special', label: 'A special character', test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
] as const;

export function passwordProblem(p: string): string | null {
  const miss = PASSWORD_RULES.find(r => !r.test(p));
  return miss ? `Password needs: ${miss.label.toLowerCase()}` : null;
}
