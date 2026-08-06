import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Shared bcrypt wrapper for every credential in the app — staff PINs and wholesaler
 *  passwords alike are just strings hashed the same way. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
