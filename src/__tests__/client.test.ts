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
        json: () => Promise.resolve(mockUser),
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
