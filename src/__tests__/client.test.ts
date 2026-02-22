import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { KeyEnv, KeyEnvError } from '../index.js';

describe('KeyEnv', () => {
  describe('constructor', () => {
    it('throws if token is not provided', () => {
      expect(() => new KeyEnv({ token: '' })).toThrow('KeyEnv token is required');
    });

    it('creates client with valid token', () => {
      const client = new KeyEnv({ token: 'test-token' });
      expect(client).toBeInstanceOf(KeyEnv);
    });

    it('accepts custom timeout', () => {
      const client = new KeyEnv({ token: 'test-token', timeout: 5000 });
      expect(client).toBeInstanceOf(KeyEnv);
    });
  });

  describe('API calls', () => {
    let client: KeyEnv;
    let fetchMock: Mock;

    beforeEach(() => {
      client = new KeyEnv({ token: 'test-token' });
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('getCurrentUser makes correct request', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockUser }),
      } as Response);

      const user = await client.getCurrentUser();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/users/me',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
      expect(user).toEqual(mockUser);
    });

    it('getCurrentUser returns service token with project_ids', async () => {
      const mockServiceToken = {
        id: 'token-123',
        auth_type: 'service_token',
        team_id: 'team-456',
        project_ids: ['proj-1', 'proj-2'],
        scopes: ['read', 'write'],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockServiceToken }),
      } as Response);

      const user = await client.getCurrentUser();

      expect(user.auth_type).toBe('service_token');
      expect(user.project_ids).toEqual(['proj-1', 'proj-2']);
      expect(user.team_id).toBe('team-456');
    });

    it('listProjects returns projects array', async () => {
      const mockProjects = [
        { id: 'proj-1', team_id: 'team-1', name: 'Project 1', slug: 'project-1' },
        { id: 'proj-2', team_id: 'team-1', name: 'Project 2', slug: 'project-2' },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ projects: mockProjects }),
      } as Response);

      const projects = await client.listProjects();

      expect(projects).toEqual(mockProjects);
    });

    it('exportSecrets returns secrets with values', async () => {
      const mockSecrets = [
        { id: 's1', environment_id: 'env-1', key: 'DATABASE_URL', value: 'postgres://...', type: 'string', version: 1 },
        { id: 's2', environment_id: 'env-1', key: 'API_KEY', value: 'sk_test_...', type: 'string', version: 1 },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ secrets: mockSecrets }),
      } as Response);

      const secrets = await client.exportSecrets('proj-1', 'production');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/secrets/export',
        expect.any(Object)
      );
      expect(secrets).toEqual(mockSecrets);
    });

    it('exportSecretsAsObject returns key-value object', async () => {
      const mockSecrets = [
        { id: 's1', environment_id: 'env-1', key: 'DATABASE_URL', value: 'postgres://localhost', type: 'string', version: 1 },
        { id: 's2', environment_id: 'env-1', key: 'API_KEY', value: 'sk_test_123', type: 'string', version: 1 },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ secrets: mockSecrets }),
      } as Response);

      const env = await client.exportSecretsAsObject('proj-1', 'production');

      expect(env).toEqual({
        DATABASE_URL: 'postgres://localhost',
        API_KEY: 'sk_test_123',
      });
    });

    it('setSecret creates new secret on 404', async () => {
      const mockSecret = { id: 's1', environment_id: 'env-1', key: 'NEW_KEY', type: 'string', version: 1 };

      // First call (update) returns 404
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      } as Response);

      // Second call (create) succeeds
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ secret: mockSecret }),
      } as Response);

      const secret = await client.setSecret('proj-1', 'production', 'NEW_KEY', 'new-value');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(secret).toEqual(mockSecret);
    });

    it('handles 401 unauthorized error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid token' }),
      } as Response);

      const error = await client.getCurrentUser().catch((e) => e);
      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(401);
      expect(error.message).toBe('Invalid token');
    });

    it('handles 403 forbidden error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Access denied' }),
      } as Response);

      await expect(client.listProjects()).rejects.toThrow(KeyEnvError);
    });

    it('handles network errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getCurrentUser()).rejects.toThrow(KeyEnvError);
    });

    it('handles 204 no content response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await expect(client.deleteSecret('proj-1', 'production', 'KEY')).resolves.toBeUndefined();
    });

    it('bulkImport sends correct payload', async () => {
      const mockResult = { created: 2, updated: 0, skipped: 0 };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResult),
      } as Response);

      const result = await client.bulkImport('proj-1', 'development', [
        { key: 'KEY1', value: 'value1' },
        { key: 'KEY2', value: 'value2' },
      ], { overwrite: true });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/development/secrets/bulk',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            secrets: [
              { key: 'KEY1', value: 'value1' },
              { key: 'KEY2', value: 'value2' },
            ],
            overwrite: true,
          }),
        })
      );
      expect(result).toEqual(mockResult);
    });

    it('getProject returns project with environments', async () => {
      const mockProject = {
        id: 'proj-1',
        team_id: 'team-1',
        name: 'My Project',
        slug: 'my-project',
        created_at: '2024-01-01T00:00:00Z',
        environments: [
          { id: 'env-1', project_id: 'proj-1', name: 'development', created_at: '2024-01-01T00:00:00Z' },
          { id: 'env-2', project_id: 'proj-1', name: 'production', created_at: '2024-01-01T00:00:00Z' },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockProject }),
      } as Response);

      const project = await client.getProject('proj-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1',
        expect.objectContaining({ method: 'GET' })
      );
      expect(project).toEqual(mockProject);
      expect(project.environments).toHaveLength(2);
    });

    it('createProject creates new project', async () => {
      const mockProject = {
        id: 'proj-new',
        team_id: 'team-1',
        name: 'New Project',
        slug: 'new-project',
        created_at: '2024-01-01T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ data: mockProject }),
      } as Response);

      const project = await client.createProject('team-1', 'New Project');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ team_id: 'team-1', name: 'New Project' }),
        })
      );
      expect(project).toEqual(mockProject);
    });

    it('deleteProject sends DELETE request', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await client.deleteProject('proj-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('listEnvironments returns environments array', async () => {
      const mockEnvironments = [
        { id: 'env-1', project_id: 'proj-1', name: 'development', created_at: '2024-01-01T00:00:00Z' },
        { id: 'env-2', project_id: 'proj-1', name: 'staging', created_at: '2024-01-01T00:00:00Z' },
        { id: 'env-3', project_id: 'proj-1', name: 'production', created_at: '2024-01-01T00:00:00Z' },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ environments: mockEnvironments }),
      } as Response);

      const environments = await client.listEnvironments('proj-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments',
        expect.objectContaining({ method: 'GET' })
      );
      expect(environments).toEqual(mockEnvironments);
    });

    it('createEnvironment creates new environment', async () => {
      const mockEnvironment = {
        id: 'env-new',
        project_id: 'proj-1',
        name: 'staging',
        inherits_from: 'development',
        created_at: '2024-01-01T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ data: mockEnvironment }),
      } as Response);

      const environment = await client.createEnvironment('proj-1', 'staging', 'development');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'staging', inherits_from: 'development' }),
        })
      );
      expect(environment).toEqual(mockEnvironment);
    });

    it('deleteEnvironment sends DELETE request', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await client.deleteEnvironment('proj-1', 'staging');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/staging',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('listSecrets returns secrets without values', async () => {
      const mockSecrets = [
        { id: 's1', environment_id: 'env-1', key: 'DATABASE_URL', type: 'string', version: 1, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
        { id: 's2', environment_id: 'env-1', key: 'API_KEY', type: 'string', version: 1, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ secrets: mockSecrets }),
      } as Response);

      const secrets = await client.listSecrets('proj-1', 'production');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/secrets',
        expect.objectContaining({ method: 'GET' })
      );
      expect(secrets).toEqual(mockSecrets);
    });

    it('getSecret returns single secret with value', async () => {
      const mockSecret = {
        id: 's1',
        environment_id: 'env-1',
        key: 'DATABASE_URL',
        value: 'postgres://localhost:5432/mydb',
        type: 'string',
        version: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ secret: mockSecret }),
      } as Response);

      const secret = await client.getSecret('proj-1', 'production', 'DATABASE_URL');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/secrets/DATABASE_URL',
        expect.objectContaining({ method: 'GET' })
      );
      expect(secret).toEqual(mockSecret);
    });

    it('createSecret creates new secret', async () => {
      const mockSecret = {
        id: 's-new',
        environment_id: 'env-1',
        key: 'NEW_SECRET',
        type: 'string',
        description: 'A new secret',
        version: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ secret: mockSecret }),
      } as Response);

      const secret = await client.createSecret('proj-1', 'production', 'NEW_SECRET', 'secret-value', 'A new secret');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/secrets',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ key: 'NEW_SECRET', value: 'secret-value', description: 'A new secret' }),
        })
      );
      expect(secret).toEqual(mockSecret);
    });

    it('updateSecret updates existing secret', async () => {
      const mockSecret = {
        id: 's1',
        environment_id: 'env-1',
        key: 'DATABASE_URL',
        type: 'string',
        version: 2,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ secret: mockSecret }),
      } as Response);

      const secret = await client.updateSecret('proj-1', 'production', 'DATABASE_URL', 'postgres://newhost:5432/mydb');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/secrets/DATABASE_URL',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ value: 'postgres://newhost:5432/mydb', description: undefined }),
        })
      );
      expect(secret).toEqual(mockSecret);
    });

    it('getSecretHistory returns version history', async () => {
      const mockHistory = [
        { id: 'h1', secret_id: 's1', value: 'old-value', version: 1, changed_by: 'user-1', changed_at: '2024-01-01T00:00:00Z' },
        { id: 'h2', secret_id: 's1', value: 'new-value', version: 2, changed_by: 'user-1', changed_at: '2024-01-02T00:00:00Z' },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ history: mockHistory }),
      } as Response);

      const history = await client.getSecretHistory('proj-1', 'production', 'DATABASE_URL');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/secrets/DATABASE_URL/history',
        expect.objectContaining({ method: 'GET' })
      );
      expect(history).toEqual(mockHistory);
      expect(history).toHaveLength(2);
    });
  });

  describe('generateEnvFile', () => {
    let client: KeyEnv;
    let fetchMock: Mock;

    beforeEach(() => {
      client = new KeyEnv({ token: 'test-token' });
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('escapes dollar signs in values', async () => {
      const mockSecrets = [
        { id: 's1', environment_id: 'env-1', key: 'DOLLAR_VAR', value: 'price=$100', type: 'string', version: 1 },
        { id: 's2', environment_id: 'env-1', key: 'SIMPLE', value: 'no_special', type: 'string', version: 1 },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ secrets: mockSecrets }),
      } as Response);

      const content = await client.generateEnvFile('proj-1', 'production');

      expect(content).toContain('DOLLAR_VAR="price=\\$100"');
      expect(content).toContain('SIMPLE=no_special');
    });

    it('generates valid .env content', async () => {
      const mockSecrets = [
        { id: 's1', environment_id: 'env-1', key: 'SIMPLE', value: 'value', type: 'string', version: 1 },
        { id: 's2', environment_id: 'env-1', key: 'WITH_SPACES', value: 'hello world', type: 'string', version: 1 },
        { id: 's3', environment_id: 'env-1', key: 'WITH_QUOTES', value: 'say "hello"', type: 'string', version: 1 },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ secrets: mockSecrets }),
      } as Response);

      const content = await client.generateEnvFile('proj-1', 'production');

      expect(content).toContain('# Generated by KeyEnv');
      expect(content).toContain('SIMPLE=value');
      expect(content).toContain('WITH_SPACES="hello world"');
      expect(content).toContain('WITH_QUOTES="say \\"hello\\""');
    });
  });
});

describe('Cache isolation', () => {
  it('different client instances do not share cache', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const mockSecrets1 = [
      { id: 's1', environment_id: 'env-1', key: 'KEY1', value: 'value_from_client1', type: 'string', version: 1 },
    ];
    const mockSecrets2 = [
      { id: 's2', environment_id: 'env-1', key: 'KEY1', value: 'value_from_client2', type: 'string', version: 1 },
    ];

    // Client 1 fetches and caches
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ secrets: mockSecrets1 }),
    } as Response);

    // Client 2 fetches and caches separately
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ secrets: mockSecrets2 }),
    } as Response);

    const client1 = new KeyEnv({ token: 'token-1', cacheTtl: 300 });
    const client2 = new KeyEnv({ token: 'token-2', cacheTtl: 300 });

    const secrets1 = await client1.exportSecrets('proj-1', 'production');
    const secrets2 = await client2.exportSecrets('proj-1', 'production');

    // Each client should have fetched separately
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(secrets1[0].value).toBe('value_from_client1');
    expect(secrets2[0].value).toBe('value_from_client2');

    vi.restoreAllMocks();
  });
});

describe('KeyEnvError', () => {
  it('creates error with all properties', () => {
    const error = new KeyEnvError('Test error', 404, 'not_found', { id: '123' });

    expect(error.message).toBe('Test error');
    expect(error.status).toBe(404);
    expect(error.code).toBe('not_found');
    expect(error.details).toEqual({ id: '123' });
    expect(error.name).toBe('KeyEnvError');
  });
});
