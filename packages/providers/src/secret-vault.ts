import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Local key vault for per-Agent vendor credentials. The master key is outside SQLite. */
export class SecretVault {
  #key: Buffer | undefined;
  constructor(private readonly keyPath = resolve('workspace/credentials/provider-vault.key')) {}
  private key(): Buffer {
    if (this.#key) return this.#key;
    const keyPath = this.keyPath;
    mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 });
    if (!existsSync(keyPath)) {
      const candidate = randomBytes(32);
      try {
        const fd = openSync(keyPath, 'wx', 0o600);
        try { writeFileSync(fd, candidate); } finally { closeSync(fd); }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    if ((statSync(keyPath).mode & 0o077) !== 0) throw new Error('Provider vault key permissions must be private (chmod 600)');
    this.#key = readFileSync(keyPath);
    if (this.#key.length !== 32) throw new Error('Local provider vault key must be 32 bytes');
    return this.#key;
  }
  encrypt(secret: string): string {
    const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), nonce);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [nonce, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
  }
  decrypt(encrypted: string): string {
    const [nonce, tag, ciphertext, ...extra] = encrypted.split('.');
    if (!nonce || !tag || !ciphertext || extra.length) throw new Error('Invalid encrypted provider credential');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(nonce, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  }
}
