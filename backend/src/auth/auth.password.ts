import bcrypt from "bcrypt";
import { randomInt } from "node:crypto";

const SALT_ROUNDS = 10;

export function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * Alphabet without the characters that get confused when a password is read out
 * loud or copied by hand: 0/O, 1/l/I, 5/S, 8/B. The admin dictates this to the
 * employee over a call, so ambiguity costs a second attempt.
 */
const UNAMBIGUOUS = "ACDEFGHJKMNPQRTUVWXYZ234679acdefghjkmnpqrtuvwxyz";
const TEMPORARY_PASSWORD_LENGTH = 14;

/**
 * Temporary password handed to an employee after an admin approves a reset.
 *
 * Uses `randomInt`, which draws from the CSPRNG and rejects modulo bias, rather
 * than `Math.random()`. The caller must hash this before storing it and must
 * never persist the cleartext: it is returned to the admin exactly once, in the
 * approve response, and then forgotten.
 */
export function generateTemporaryPassword() {
  let out = "";
  for (let i = 0; i < TEMPORARY_PASSWORD_LENGTH; i += 1) {
    out += UNAMBIGUOUS[randomInt(UNAMBIGUOUS.length)];
  }
  return out;
}
