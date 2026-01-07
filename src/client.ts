import type {
  KeyEnvOptions,
  User,
  Project,
  ProjectWithEnvironments,
  Environment,
  Secret,
  SecretWithValue,
  SecretHistory,
  BulkSecretItem,
  BulkImportResult,
  ApiError,
} from './types.js';
import { KeyEnvError } from './types.js';

const BASE_URL = 'https://api.keyenv.dev';
const DEFAULT_TIMEOUT = 30000;

/**
 * KeyEnv API client for managing secrets
 *
 * @example
 * ```ts
 * import { KeyEnv } from 'keyenv';
 *
 * const client = new KeyEnv({ token: process.env.KEYENV_TOKEN });
 *
 * // Export all secrets for an environment
 * const secrets = await client.exportSecrets('project-id', 'production');
 * ```
 */
export class KeyEnv {
  private readonly token: string;
  private readonly timeout: number;

  constructor(options: KeyEnvOptions) {
    if (!options.token) {
      throw new Error('KeyEnv token is required');
    }
    this.token = options.token;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'keyenv-node/1.0.0',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: ApiError = { error: 'Unknown error' };
        try {
          errorData = await response.json() as ApiError;
        } catch {
          errorData = { error: response.statusText };
        }
        throw new KeyEnvError(errorData.error, response.status, errorData.code, errorData.details);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof KeyEnvError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new KeyEnvError('Request timeout', 408);
      }
      throw new KeyEnvError(error instanceof Error ? error.message : 'Network error', 0);
    }
  }

  /** Get the current user or service token info */
  async getCurrentUser(): Promise<User> {
    return this.request<User>('GET', '/api/v1/users/me');
  }

  /** Validate the token and return user info */
  async validateToken(): Promise<User> {
    return this.getCurrentUser();
  }

  /** List all accessible projects */
  async listProjects(): Promise<Project[]> {
    const response = await this.request<{ projects: Project[] }>('GET', '/api/v1/projects');
    return response.projects;
  }

  /** Get a project by ID */
  async getProject(projectId: string): Promise<ProjectWithEnvironments> {
    return this.request<ProjectWithEnvironments>('GET', `/api/v1/projects/${projectId}`);
  }

  /** Create a new project */
  async createProject(teamId: string, name: string): Promise<Project> {
    return this.request<Project>('POST', '/api/v1/projects', { team_id: teamId, name });
  }

  /** Delete a project */
  async deleteProject(projectId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/projects/${projectId}`);
  }

  /** List environments in a project */
  async listEnvironments(projectId: string): Promise<Environment[]> {
    const response = await this.request<{ environments: Environment[] }>(
      'GET', `/api/v1/projects/${projectId}/environments`
    );
    return response.environments;
  }

  /** Create a new environment */
  async createEnvironment(projectId: string, name: string, inheritsFrom?: string): Promise<Environment> {
    return this.request<Environment>(
      'POST', `/api/v1/projects/${projectId}/environments`,
      { name, inherits_from: inheritsFrom }
    );
  }

  /** Delete an environment */
  async deleteEnvironment(projectId: string, environment: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/projects/${projectId}/environments/${environment}`);
  }

  /** List secrets in an environment (keys and metadata only) */
  async listSecrets(projectId: string, environment: string): Promise<Secret[]> {
    const response = await this.request<{ secrets: Secret[] }>(
      'GET', `/api/v1/projects/${projectId}/environments/${environment}/secrets`
    );
    return response.secrets;
  }

  /**
   * Export all secrets with their decrypted values
   * @example
   * ```ts
   * const secrets = await client.exportSecrets('project-id', 'production');
   * for (const secret of secrets) {
   *   process.env[secret.key] = secret.value;
   * }
   * ```
   */
  async exportSecrets(projectId: string, environment: string): Promise<SecretWithValue[]> {
    const response = await this.request<{ secrets: SecretWithValue[] }>(
      'GET', `/api/v1/projects/${projectId}/environments/${environment}/secrets/export`
    );
    return response.secrets;
  }

  /**
   * Export secrets as a key-value object
   * @example
   * ```ts
   * const env = await client.exportSecretsAsObject('project-id', 'production');
   * // { DATABASE_URL: '...', API_KEY: '...' }
   * ```
   */
  async exportSecretsAsObject(projectId: string, environment: string): Promise<Record<string, string>> {
    const secrets = await this.exportSecrets(projectId, environment);
    return Object.fromEntries(secrets.map((s) => [s.key, s.value]));
  }

  /** Get a single secret with its value */
  async getSecret(projectId: string, environment: string, key: string): Promise<SecretWithValue> {
    const response = await this.request<{ secret: SecretWithValue }>(
      'GET', `/api/v1/projects/${projectId}/environments/${environment}/secrets/${key}`
    );
    return response.secret;
  }

  /** Create a new secret */
  async createSecret(
    projectId: string, environment: string, key: string, value: string, description?: string
  ): Promise<Secret> {
    const response = await this.request<{ secret: Secret }>(
      'POST', `/api/v1/projects/${projectId}/environments/${environment}/secrets`,
      { key, value, description }
    );
    return response.secret;
  }

  /** Update a secret's value */
  async updateSecret(
    projectId: string, environment: string, key: string, value: string, description?: string
  ): Promise<Secret> {
    const response = await this.request<{ secret: Secret }>(
      'PUT', `/api/v1/projects/${projectId}/environments/${environment}/secrets/${key}`,
      { value, description }
    );
    return response.secret;
  }

  /** Set a secret (create or update) */
  async setSecret(
    projectId: string, environment: string, key: string, value: string, description?: string
  ): Promise<Secret> {
    try {
      return await this.updateSecret(projectId, environment, key, value, description);
    } catch (error) {
      if (error instanceof KeyEnvError && error.status === 404) {
        return this.createSecret(projectId, environment, key, value, description);
      }
      throw error;
    }
  }

  /** Delete a secret */
  async deleteSecret(projectId: string, environment: string, key: string): Promise<void> {
    await this.request<void>(
      'DELETE', `/api/v1/projects/${projectId}/environments/${environment}/secrets/${key}`
    );
  }

  /** Get secret version history */
  async getSecretHistory(projectId: string, environment: string, key: string): Promise<SecretHistory[]> {
    const response = await this.request<{ history: SecretHistory[] }>(
      'GET', `/api/v1/projects/${projectId}/environments/${environment}/secrets/${key}/history`
    );
    return response.history;
  }

  /**
   * Bulk import secrets
   * @example
   * ```ts
   * await client.bulkImport('project-id', 'development', [
   *   { key: 'DATABASE_URL', value: 'postgres://...' },
   *   { key: 'API_KEY', value: 'sk_...' },
   * ], { overwrite: true });
   * ```
   */
  async bulkImport(
    projectId: string, environment: string, secrets: BulkSecretItem[], options: { overwrite?: boolean } = {}
  ): Promise<BulkImportResult> {
    return this.request<BulkImportResult>(
      'POST', `/api/v1/projects/${projectId}/environments/${environment}/secrets/bulk`,
      { secrets, overwrite: options.overwrite ?? false }
    );
  }

  /**
   * Load secrets into process.env
   * @example
   * ```ts
   * await client.loadEnv('project-id', 'production');
   * console.log(process.env.DATABASE_URL);
   * ```
   */
  async loadEnv(projectId: string, environment: string): Promise<number> {
    const secrets = await this.exportSecrets(projectId, environment);
    for (const secret of secrets) {
      process.env[secret.key] = secret.value;
    }
    return secrets.length;
  }

  /** Generate .env file content from secrets */
  async generateEnvFile(projectId: string, environment: string): Promise<string> {
    const secrets = await this.exportSecrets(projectId, environment);
    const lines = [
      '# Generated by KeyEnv',
      `# Environment: ${environment}`,
      `# Generated at: ${new Date().toISOString()}`,
      '',
    ];

    for (const secret of secrets) {
      const value = secret.value;
      if (value.includes('\n') || value.includes('"') || value.includes("'") || value.includes(' ')) {
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        lines.push(`${secret.key}="${escaped}"`);
      } else {
        lines.push(`${secret.key}=${value}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}
