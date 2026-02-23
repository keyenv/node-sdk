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
  EnvironmentRole,
  EnvironmentPermission,
  MyPermissionsResponse,
  ProjectDefault,
} from './types.js';
import { KeyEnvError } from './types.js';

const DEFAULT_BASE_URL = 'https://api.keyenv.dev';
const DEFAULT_TIMEOUT = 30000;

function getCacheKey(projectId: string, environment: string): string {
  return `${projectId}:${environment}`;
}

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
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly cacheTtl: number;
  private readonly secretsCache = new Map<string, { secrets: SecretWithValue[]; expiresAt: number }>();

  constructor(options: KeyEnvOptions) {
    if (!options.token) {
      throw new Error('KeyEnv token is required');
    }
    this.token = options.token;
    // Base URL: constructor option → env var → default
    this.baseUrl = (options.baseUrl ?? process.env.KEYENV_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    // Cache TTL: constructor option → env var → 0 (disabled)
    this.cacheTtl = options.cacheTtl ??
      (process.env.KEYENV_CACHE_TTL ? parseInt(process.env.KEYENV_CACHE_TTL, 10) : 0);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
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
    const response = await this.request<{ data: User }>('GET', '/api/v1/users/me');
    return response.data;
  }

  /** Validate the token and return user info */
  async validateToken(): Promise<User> {
    return this.getCurrentUser();
  }

  /** List all accessible projects */
  async listProjects(): Promise<Project[]> {
    const response = await this.request<{ data: Project[] }>('GET', '/api/v1/projects');
    return response.data;
  }

  /** Get a project by ID */
  async getProject(projectId: string): Promise<ProjectWithEnvironments> {
    const response = await this.request<{ data: ProjectWithEnvironments }>('GET', `/api/v1/projects/${projectId}`);
    return response.data;
  }

  /** Create a new project */
  async createProject(teamId: string, name: string): Promise<Project> {
    const response = await this.request<{ data: Project }>('POST', '/api/v1/projects', { team_id: teamId, name });
    return response.data;
  }

  /** Delete a project */
  async deleteProject(projectId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/projects/${projectId}`);
  }

  /** List environments in a project */
  async listEnvironments(projectId: string): Promise<Environment[]> {
    const response = await this.request<{ data: Environment[] }>(
      'GET', `/api/v1/projects/${projectId}/environments`
    );
    return response.data;
  }

  /** Create a new environment */
  async createEnvironment(projectId: string, name: string, inheritsFrom?: string): Promise<Environment> {
    const response = await this.request<{ data: Environment }>(
      'POST', `/api/v1/projects/${projectId}/environments`,
      { name, inherits_from: inheritsFrom }
    );
    return response.data;
  }

  /** Delete an environment */
  async deleteEnvironment(projectId: string, environment: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/projects/${projectId}/environments/${environment}`);
  }

  /** List secrets in an environment (keys and metadata only) */
  async listSecrets(projectId: string, environment: string): Promise<Secret[]> {
    const response = await this.request<{ data: Secret[] }>(
      'GET', `/api/v1/projects/${projectId}/environments/${environment}/secrets`
    );
    return response.data;
  }

  /**
   * Export all secrets with their decrypted values.
   * Results are cached when cacheTtl > 0.
   * @example
   * ```ts
   * const secrets = await client.exportSecrets('project-id', 'production');
   * for (const secret of secrets) {
   *   process.env[secret.key] = secret.value;
   * }
   * ```
   */
  async exportSecrets(projectId: string, environment: string): Promise<SecretWithValue[]> {
    const cacheKey = getCacheKey(projectId, environment);

    // Check cache if TTL > 0
    if (this.cacheTtl > 0) {
      const cached = this.secretsCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.secrets;
      }
      // Delete expired entry to prevent memory leaks
      if (cached) {
        this.secretsCache.delete(cacheKey);
      }
    }

    const response = await this.request<{ data: SecretWithValue[] }>(
      'GET', `/api/v1/projects/${projectId}/environments/${environment}/secrets/export`
    );

    // Store in cache if TTL > 0
    if (this.cacheTtl > 0) {
      this.secretsCache.set(cacheKey, {
        secrets: response.data,
        expiresAt: Date.now() + (this.cacheTtl * 1000),
      });
    }

    return response.data;
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
    const response = await this.request<{ data: SecretWithValue }>(
      'GET', `/api/v1/projects/${projectId}/environments/${environment}/secrets/${key}`
    );
    return response.data;
  }

  /** Create a new secret */
  async createSecret(
    projectId: string, environment: string, key: string, value: string, description?: string
  ): Promise<Secret> {
    const response = await this.request<{ data: Secret }>(
      'POST', `/api/v1/projects/${projectId}/environments/${environment}/secrets`,
      { key, value, description }
    );
    this.clearCache(projectId, environment);
    return response.data;
  }

  /** Update a secret's value */
  async updateSecret(
    projectId: string, environment: string, key: string, value: string, description?: string
  ): Promise<Secret> {
    const response = await this.request<{ data: Secret }>(
      'PUT', `/api/v1/projects/${projectId}/environments/${environment}/secrets/${key}`,
      { value, description }
    );
    this.clearCache(projectId, environment);
    return response.data;
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
    this.clearCache(projectId, environment);
  }

  /** Get secret version history */
  async getSecretHistory(projectId: string, environment: string, key: string): Promise<SecretHistory[]> {
    const response = await this.request<{ data: SecretHistory[] }>(
      'GET', `/api/v1/projects/${projectId}/environments/${environment}/secrets/${key}/history`
    );
    return response.data;
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
    const response = await this.request<{ data: BulkImportResult }>(
      'POST', `/api/v1/projects/${projectId}/environments/${environment}/secrets/bulk`,
      { secrets, overwrite: options.overwrite ?? false }
    );
    this.clearCache(projectId, environment);
    return response.data;
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
      if (value.includes('\n') || value.includes('"') || value.includes("'") || value.includes(' ') || value.includes('$')) {
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\$/g, '\\$');
        lines.push(`${secret.key}="${escaped}"`);
      } else {
        lines.push(`${secret.key}=${value}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Clear the secrets cache.
   * @param projectId - Clear cache for specific project (optional)
   * @param environment - Clear cache for specific environment (requires projectId)
   */
  clearCache(projectId?: string, environment?: string): void {
    if (projectId && environment) {
      this.secretsCache.delete(getCacheKey(projectId, environment));
    } else if (projectId) {
      // Clear all environments for this project
      for (const key of this.secretsCache.keys()) {
        if (key.startsWith(`${projectId}:`)) {
          this.secretsCache.delete(key);
        }
      }
    } else {
      this.secretsCache.clear();
    }
  }

  // ============================================================================
  // Environment Permission Management
  // ============================================================================

  /**
   * List all permissions for an environment.
   * @param projectId - The project ID
   * @param environment - The environment name
   * @returns Array of environment permissions
   * @example
   * ```ts
   * const permissions = await client.listPermissions('project-id', 'production');
   * for (const perm of permissions) {
   *   console.log(`${perm.user_email}: ${perm.role}`);
   * }
   * ```
   */
  async listPermissions(projectId: string, environment: string): Promise<EnvironmentPermission[]> {
    const response = await this.request<{ data: EnvironmentPermission[] }>(
      'GET', `/api/v1/projects/${projectId}/environments/${environment}/permissions`
    );
    return response.data;
  }

  /**
   * Set a user's permission for an environment.
   * @param projectId - The project ID
   * @param environment - The environment name
   * @param userId - The user ID to set permission for
   * @param role - The permission role ('none', 'read', 'write', or 'admin')
   * @returns The created or updated permission
   * @example
   * ```ts
   * const permission = await client.setPermission('project-id', 'production', 'user-id', 'write');
   * console.log(`Set ${permission.user_email} to ${permission.role}`);
   * ```
   */
  async setPermission(
    projectId: string, environment: string, userId: string, role: EnvironmentRole
  ): Promise<EnvironmentPermission> {
    const response = await this.request<{ data: EnvironmentPermission }>(
      'PUT', `/api/v1/projects/${projectId}/environments/${environment}/permissions/${userId}`,
      { role }
    );
    return response.data;
  }

  /**
   * Delete a user's permission for an environment.
   * @param projectId - The project ID
   * @param environment - The environment name
   * @param userId - The user ID to delete permission for
   * @example
   * ```ts
   * await client.deletePermission('project-id', 'production', 'user-id');
   * ```
   */
  async deletePermission(projectId: string, environment: string, userId: string): Promise<void> {
    await this.request<void>(
      'DELETE', `/api/v1/projects/${projectId}/environments/${environment}/permissions/${userId}`
    );
  }

  /**
   * Bulk set permissions for multiple users in an environment.
   * @param projectId - The project ID
   * @param environment - The environment name
   * @param permissions - Array of user permissions to set
   * @returns Array of created or updated permissions
   * @example
   * ```ts
   * const permissions = await client.bulkSetPermissions('project-id', 'production', [
   *   { userId: 'user-1', role: 'write' },
   *   { userId: 'user-2', role: 'read' },
   * ]);
   * ```
   */
  async bulkSetPermissions(
    projectId: string, environment: string, permissions: Array<{ userId: string; role: EnvironmentRole }>
  ): Promise<EnvironmentPermission[]> {
    const response = await this.request<{ data: EnvironmentPermission[] }>(
      'PUT', `/api/v1/projects/${projectId}/environments/${environment}/permissions`,
      { permissions: permissions.map(p => ({ user_id: p.userId, role: p.role })) }
    );
    return response.data;
  }

  /**
   * Get the current user's permissions for all environments in a project.
   * @param projectId - The project ID
   * @returns The user's permissions and team admin status
   * @example
   * ```ts
   * const { permissions, is_team_admin } = await client.getMyPermissions('project-id');
   * for (const perm of permissions) {
   *   console.log(`${perm.environment_name}: ${perm.role} (can_write: ${perm.can_write})`);
   * }
   * ```
   */
  async getMyPermissions(projectId: string): Promise<MyPermissionsResponse> {
    return this.request<MyPermissionsResponse>('GET', `/api/v1/projects/${projectId}/my-permissions`);
  }

  /**
   * Get default permission settings for a project's environments.
   * @param projectId - The project ID
   * @returns Array of project default permissions
   * @example
   * ```ts
   * const defaults = await client.getProjectDefaults('project-id');
   * for (const def of defaults) {
   *   console.log(`${def.environment_name}: ${def.default_role}`);
   * }
   * ```
   */
  async getProjectDefaults(projectId: string): Promise<ProjectDefault[]> {
    const response = await this.request<{ data: ProjectDefault[] }>(
      'GET', `/api/v1/projects/${projectId}/permissions/defaults`
    );
    return response.data;
  }

  /**
   * Set default permission settings for a project's environments.
   * @param projectId - The project ID
   * @param defaults - Array of default permissions to set
   * @returns Array of updated project default permissions
   * @example
   * ```ts
   * const defaults = await client.setProjectDefaults('project-id', [
   *   { environmentName: 'development', defaultRole: 'write' },
   *   { environmentName: 'production', defaultRole: 'read' },
   * ]);
   * ```
   */
  async setProjectDefaults(
    projectId: string, defaults: Array<{ environmentName: string; defaultRole: EnvironmentRole }>
  ): Promise<ProjectDefault[]> {
    const response = await this.request<{ data: ProjectDefault[] }>(
      'PUT', `/api/v1/projects/${projectId}/permissions/defaults`,
      { defaults: defaults.map(d => ({ environment_name: d.environmentName, default_role: d.defaultRole })) }
    );
    return response.data;
  }
}
