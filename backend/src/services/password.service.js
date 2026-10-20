import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const TIMING_EQUALIZER_HASH = bcrypt.hashSync('timing-equalizer', BCRYPT_ROUNDS);

export function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

export function verifyPassword(plainPassword, storedHash) {
  return bcrypt.compare(plainPassword, storedHash ?? TIMING_EQUALIZER_HASH);
}
