import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

function cacheName(owner, repo) {
  const key = JSON.stringify([String(owner).toLowerCase(), String(repo).toLowerCase()]);
  return `${createHash('sha256').update(key).digest('hex')}.json`;
}

export class FileCache {
  constructor(directory, ttlMs) {
    this.directory = path.resolve(directory);
    this.ttlMs = ttlMs;
  }

  async init() {
    await fs.mkdir(this.directory, { recursive: true });
  }

  file(owner, repo) {
    const fileName = path.basename(cacheName(owner, repo));
    const target = path.resolve(this.directory, fileName);
    if (path.dirname(target) !== this.directory) throw new Error('Invalid cache file path.');
    return target;
  }

  repositoriesFile() {
    return path.join(this.directory, 'repositories.json');
  }

  async get(owner, repo, { allowStale = false } = {}) {
    try {
      const value = JSON.parse(await fs.readFile(this.file(owner, repo), 'utf8'));
      const age = Date.now() - new Date(value.fetchedAt).getTime();
      return { ...value, stale: age > this.ttlMs, usable: allowStale || age <= this.ttlMs };
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async set(owner, repo, value) {
    const target = this.file(owner, repo);
    await this.writeJson(target, value);
    return value;
  }

  async getRepositories() {
    try {
      return JSON.parse(await fs.readFile(this.repositoriesFile(), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async setRepositories(repositories, profile = null, profileStats = null) {
    const value = { fetchedAt: new Date().toISOString(), profile, profileStats, repositories };
    await this.writeJson(this.repositoriesFile(), value);
    return value;
  }

  async writeJson(target, value) {
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(value), 'utf8');
    await fs.rename(temporary, target);
  }

  async entries() {
    const files = await fs.readdir(this.directory).catch(() => []);
    const values = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
      try {
        return JSON.parse(await fs.readFile(path.join(this.directory, file), 'utf8'));
      } catch {
        return null;
      }
    }));
    return values.filter((value) => value?.owner && value?.repo && Array.isArray(value.points));
  }
}
