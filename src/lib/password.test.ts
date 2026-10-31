import { describe, expect, it } from 'vitest';
import { passwordProblem } from './password';

describe('new password rule', () => {
  it('accepts letters + numbers + special, 8+', () => expect(passwordProblem('vinx2026!')).toBeNull());
  it('rejects missing special character', () => expect(passwordProblem('vinx2026a')).not.toBeNull());
  it('rejects missing number', () => expect(passwordProblem('vinxvinx!')).not.toBeNull());
  it('rejects missing letter', () => expect(passwordProblem('12345678!')).not.toBeNull());
  it('rejects under 8 characters', () => expect(passwordProblem('vx2!')).not.toBeNull());
});
