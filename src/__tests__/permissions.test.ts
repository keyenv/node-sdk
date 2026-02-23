import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { KeyEnv, KeyEnvError } from '../index.js';

describe('Permission Methods', () => {
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

  // ============================================================================
  // listPermissions
  // ============================================================================
  describe('listPermissions', () => {
    it('successfully lists permissions', async () => {
      const mockPermissions = [
        {
          id: 'perm-1',
          environment_id: 'env-1',
          user_id: 'user-1',
          role: 'write',
          user_email: 'alice@example.com',
          user_name: 'Alice',
          granted_by: 'user-admin',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'perm-2',
          environment_id: 'env-1',
          user_id: 'user-2',
          role: 'read',
          user_email: 'bob@example.com',
          user_name: 'Bob',
          granted_by: 'user-admin',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockPermissions }),
      } as Response);

      const permissions = await client.listPermissions('proj-1', 'production');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/permissions',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
      expect(permissions).toHaveLength(2);
      expect(permissions[0].role).toBe('write');
      expect(permissions[0].user_email).toBe('alice@example.com');
      expect(permissions[1].role).toBe('read');
    });

    it('returns empty array when no permissions exist', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as Response);

      const permissions = await client.listPermissions('proj-1', 'development');

      expect(permissions).toEqual([]);
      expect(permissions).toHaveLength(0);
    });

    it('throws KeyEnvError on 401 unauthorized', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid token' }),
      } as Response);

      const error = await client.listPermissions('proj-1', 'production').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(401);
      expect(error.message).toBe('Invalid token');
    });

    it('throws KeyEnvError on 403 forbidden', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'You do not have permission to view permissions for this environment' }),
      } as Response);

      const error = await client.listPermissions('proj-1', 'production').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(403);
      expect(error.message).toBe('You do not have permission to view permissions for this environment');
    });

    it('throws KeyEnvError on 404 not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Environment not found' }),
      } as Response);

      const error = await client.listPermissions('proj-1', 'nonexistent').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(404);
      expect(error.message).toBe('Environment not found');
    });
  });

  // ============================================================================
  // setPermission
  // ============================================================================
  describe('setPermission', () => {
    it('successfully sets permission with role "none"', async () => {
      const mockPermission = {
        id: 'perm-1',
        environment_id: 'env-1',
        user_id: 'user-1',
        role: 'none',
        user_email: 'alice@example.com',
        user_name: 'Alice',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockPermission }),
      } as Response);

      const permission = await client.setPermission('proj-1', 'production', 'user-1', 'none');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/permissions/user-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ role: 'none' }),
        })
      );
      expect(permission.role).toBe('none');
    });

    it('successfully sets permission with role "read"', async () => {
      const mockPermission = {
        id: 'perm-1',
        environment_id: 'env-1',
        user_id: 'user-1',
        role: 'read',
        user_email: 'alice@example.com',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockPermission }),
      } as Response);

      const permission = await client.setPermission('proj-1', 'production', 'user-1', 'read');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/permissions/user-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ role: 'read' }),
        })
      );
      expect(permission.role).toBe('read');
    });

    it('successfully sets permission with role "write"', async () => {
      const mockPermission = {
        id: 'perm-1',
        environment_id: 'env-1',
        user_id: 'user-1',
        role: 'write',
        user_email: 'alice@example.com',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockPermission }),
      } as Response);

      const permission = await client.setPermission('proj-1', 'staging', 'user-1', 'write');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/staging/permissions/user-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ role: 'write' }),
        })
      );
      expect(permission.role).toBe('write');
    });

    it('successfully sets permission with role "admin"', async () => {
      const mockPermission = {
        id: 'perm-1',
        environment_id: 'env-1',
        user_id: 'user-1',
        role: 'admin',
        user_email: 'alice@example.com',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockPermission }),
      } as Response);

      const permission = await client.setPermission('proj-1', 'production', 'user-1', 'admin');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/permissions/user-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ role: 'admin' }),
        })
      );
      expect(permission.role).toBe('admin');
    });

    it('throws KeyEnvError on 403 forbidden', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Only admins can set permissions' }),
      } as Response);

      const error = await client.setPermission('proj-1', 'production', 'user-1', 'write').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(403);
    });

    it('throws KeyEnvError on 404 when user not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'User not found' }),
      } as Response);

      const error = await client.setPermission('proj-1', 'production', 'nonexistent-user', 'read').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(404);
      expect(error.message).toBe('User not found');
    });

    it('throws KeyEnvError on 400 bad request for invalid role', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid role' }),
      } as Response);

      // Force a call with invalid role to test error handling
      const error = await client.setPermission('proj-1', 'production', 'user-1', 'invalid' as any).catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(400);
    });
  });

  // ============================================================================
  // deletePermission
  // ============================================================================
  describe('deletePermission', () => {
    it('successfully deletes permission', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await client.deletePermission('proj-1', 'production', 'user-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/permissions/user-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('throws KeyEnvError on 404 not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Permission not found' }),
      } as Response);

      const error = await client.deletePermission('proj-1', 'production', 'nonexistent-user').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(404);
      expect(error.message).toBe('Permission not found');
    });

    it('throws KeyEnvError on 403 forbidden', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'You cannot delete your own permission' }),
      } as Response);

      const error = await client.deletePermission('proj-1', 'production', 'current-user').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(403);
    });

    it('handles network errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.deletePermission('proj-1', 'production', 'user-1')).rejects.toThrow(KeyEnvError);
    });
  });

  // ============================================================================
  // bulkSetPermissions
  // ============================================================================
  describe('bulkSetPermissions', () => {
    it('successfully bulk sets permissions', async () => {
      const mockPermissions = [
        {
          id: 'perm-1',
          environment_id: 'env-1',
          user_id: 'user-1',
          role: 'write',
          user_email: 'alice@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'perm-2',
          environment_id: 'env-1',
          user_id: 'user-2',
          role: 'read',
          user_email: 'bob@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'perm-3',
          environment_id: 'env-1',
          user_id: 'user-3',
          role: 'admin',
          user_email: 'charlie@example.com',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockPermissions }),
      } as Response);

      const permissions = await client.bulkSetPermissions('proj-1', 'production', [
        { userId: 'user-1', role: 'write' },
        { userId: 'user-2', role: 'read' },
        { userId: 'user-3', role: 'admin' },
      ]);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/environments/production/permissions',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            permissions: [
              { user_id: 'user-1', role: 'write' },
              { user_id: 'user-2', role: 'read' },
              { user_id: 'user-3', role: 'admin' },
            ],
          }),
        })
      );
      expect(permissions).toHaveLength(3);
      expect(permissions[0].role).toBe('write');
      expect(permissions[1].role).toBe('read');
      expect(permissions[2].role).toBe('admin');
    });

    it('sends correctly formatted request body with snake_case', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as Response);

      await client.bulkSetPermissions('proj-1', 'staging', [
        { userId: 'user-abc-123', role: 'none' },
      ]);

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body).toEqual({
        permissions: [
          { user_id: 'user-abc-123', role: 'none' },
        ],
      });
      // Verify snake_case is used, not camelCase
      expect(body.permissions[0]).toHaveProperty('user_id');
      expect(body.permissions[0]).not.toHaveProperty('userId');
    });

    it('returns array of permissions', async () => {
      const mockPermissions = [
        {
          id: 'perm-1',
          environment_id: 'env-1',
          user_id: 'user-1',
          role: 'read',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockPermissions }),
      } as Response);

      const result = await client.bulkSetPermissions('proj-1', 'production', [
        { userId: 'user-1', role: 'read' },
      ]);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(mockPermissions);
    });

    it('handles empty permissions array', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as Response);

      const permissions = await client.bulkSetPermissions('proj-1', 'production', []);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ permissions: [] }),
        })
      );
      expect(permissions).toEqual([]);
    });

    it('throws KeyEnvError on 403 forbidden', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Admin access required' }),
      } as Response);

      const error = await client.bulkSetPermissions('proj-1', 'production', [
        { userId: 'user-1', role: 'write' },
      ]).catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(403);
    });
  });

  // ============================================================================
  // getMyPermissions
  // ============================================================================
  describe('getMyPermissions', () => {
    it('returns permissions array with is_team_admin flag', async () => {
      const mockResponse = {
        permissions: [
          {
            environment_id: 'env-1',
            environment_name: 'development',
            role: 'write',
            can_read: true,
            can_write: true,
            can_admin: false,
          },
          {
            environment_id: 'env-2',
            environment_name: 'production',
            role: 'read',
            can_read: true,
            can_write: false,
            can_admin: false,
          },
        ],
        is_team_admin: false,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await client.getMyPermissions('proj-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/my-permissions',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result.permissions).toHaveLength(2);
      expect(result.is_team_admin).toBe(false);
      expect(result.permissions[0].can_write).toBe(true);
      expect(result.permissions[1].can_write).toBe(false);
    });

    it('handles team admin case', async () => {
      const mockResponse = {
        permissions: [
          {
            environment_id: 'env-1',
            environment_name: 'development',
            role: 'admin',
            can_read: true,
            can_write: true,
            can_admin: true,
          },
          {
            environment_id: 'env-2',
            environment_name: 'production',
            role: 'admin',
            can_read: true,
            can_write: true,
            can_admin: true,
          },
        ],
        is_team_admin: true,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await client.getMyPermissions('proj-1');

      expect(result.is_team_admin).toBe(true);
      expect(result.permissions.every(p => p.can_admin)).toBe(true);
    });

    it('handles non-admin case with limited permissions', async () => {
      const mockResponse = {
        permissions: [
          {
            environment_id: 'env-1',
            environment_name: 'development',
            role: 'read',
            can_read: true,
            can_write: false,
            can_admin: false,
          },
        ],
        is_team_admin: false,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await client.getMyPermissions('proj-1');

      expect(result.is_team_admin).toBe(false);
      expect(result.permissions[0].can_admin).toBe(false);
      expect(result.permissions[0].can_write).toBe(false);
      expect(result.permissions[0].can_read).toBe(true);
    });

    it('throws KeyEnvError on 404 project not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Project not found' }),
      } as Response);

      const error = await client.getMyPermissions('nonexistent-proj').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(404);
    });

    it('handles empty permissions array for new projects', async () => {
      const mockResponse = {
        permissions: [],
        is_team_admin: false,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await client.getMyPermissions('proj-1');

      expect(result.permissions).toEqual([]);
      expect(result.is_team_admin).toBe(false);
    });
  });

  // ============================================================================
  // getProjectDefaults
  // ============================================================================
  describe('getProjectDefaults', () => {
    it('returns defaults array', async () => {
      const mockDefaults = [
        {
          id: 'def-1',
          project_id: 'proj-1',
          environment_name: 'development',
          default_role: 'write',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'def-2',
          project_id: 'proj-1',
          environment_name: 'staging',
          default_role: 'read',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'def-3',
          project_id: 'proj-1',
          environment_name: 'production',
          default_role: 'none',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockDefaults }),
      } as Response);

      const defaults = await client.getProjectDefaults('proj-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/permissions/defaults',
        expect.objectContaining({ method: 'GET' })
      );
      expect(defaults).toHaveLength(3);
      expect(defaults[0].environment_name).toBe('development');
      expect(defaults[0].default_role).toBe('write');
      expect(defaults[2].default_role).toBe('none');
    });

    it('handles empty defaults', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as Response);

      const defaults = await client.getProjectDefaults('proj-1');

      expect(defaults).toEqual([]);
      expect(defaults).toHaveLength(0);
    });

    it('throws KeyEnvError on 404 project not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Project not found' }),
      } as Response);

      const error = await client.getProjectDefaults('nonexistent-proj').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(404);
    });

    it('throws KeyEnvError on 403 forbidden', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Access denied' }),
      } as Response);

      const error = await client.getProjectDefaults('proj-1').catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(403);
    });
  });

  // ============================================================================
  // setProjectDefaults
  // ============================================================================
  describe('setProjectDefaults', () => {
    it('successfully sets defaults', async () => {
      const mockDefaults = [
        {
          id: 'def-1',
          project_id: 'proj-1',
          environment_name: 'development',
          default_role: 'write',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'def-2',
          project_id: 'proj-1',
          environment_name: 'production',
          default_role: 'read',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockDefaults }),
      } as Response);

      const defaults = await client.setProjectDefaults('proj-1', [
        { environmentName: 'development', defaultRole: 'write' },
        { environmentName: 'production', defaultRole: 'read' },
      ]);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.keyenv.dev/api/v1/projects/proj-1/permissions/defaults',
        expect.objectContaining({
          method: 'PUT',
        })
      );
      expect(defaults).toHaveLength(2);
      expect(defaults[0].default_role).toBe('write');
      expect(defaults[1].default_role).toBe('read');
    });

    it('sends correctly formatted request with snake_case (environment_name, default_role)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as Response);

      await client.setProjectDefaults('proj-1', [
        { environmentName: 'development', defaultRole: 'write' },
        { environmentName: 'staging', defaultRole: 'read' },
        { environmentName: 'production', defaultRole: 'none' },
      ]);

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body).toEqual({
        defaults: [
          { environment_name: 'development', default_role: 'write' },
          { environment_name: 'staging', default_role: 'read' },
          { environment_name: 'production', default_role: 'none' },
        ],
      });
      // Verify snake_case is used
      expect(body.defaults[0]).toHaveProperty('environment_name');
      expect(body.defaults[0]).toHaveProperty('default_role');
      expect(body.defaults[0]).not.toHaveProperty('environmentName');
      expect(body.defaults[0]).not.toHaveProperty('defaultRole');
    });

    it('handles empty defaults array', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as Response);

      const defaults = await client.setProjectDefaults('proj-1', []);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ defaults: [] }),
        })
      );
      expect(defaults).toEqual([]);
    });

    it('throws KeyEnvError on 403 forbidden', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Only team admins can set project defaults' }),
      } as Response);

      const error = await client.setProjectDefaults('proj-1', [
        { environmentName: 'development', defaultRole: 'write' },
      ]).catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(403);
      expect(error.message).toBe('Only team admins can set project defaults');
    });

    it('throws KeyEnvError on 404 project not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Project not found' }),
      } as Response);

      const error = await client.setProjectDefaults('nonexistent-proj', [
        { environmentName: 'development', defaultRole: 'write' },
      ]).catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(404);
    });

    it('throws KeyEnvError on 400 for invalid environment name', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Environment "invalid" does not exist' }),
      } as Response);

      const error = await client.setProjectDefaults('proj-1', [
        { environmentName: 'invalid', defaultRole: 'write' },
      ]).catch((e) => e);

      expect(error).toBeInstanceOf(KeyEnvError);
      expect(error.status).toBe(400);
    });

    it('successfully sets all role types', async () => {
      const mockDefaults = [
        { id: 'def-1', project_id: 'proj-1', environment_name: 'dev', default_role: 'none', created_at: '2024-01-01T00:00:00Z' },
        { id: 'def-2', project_id: 'proj-1', environment_name: 'staging', default_role: 'read', created_at: '2024-01-01T00:00:00Z' },
        { id: 'def-3', project_id: 'proj-1', environment_name: 'prod', default_role: 'write', created_at: '2024-01-01T00:00:00Z' },
        { id: 'def-4', project_id: 'proj-1', environment_name: 'test', default_role: 'admin', created_at: '2024-01-01T00:00:00Z' },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockDefaults }),
      } as Response);

      const defaults = await client.setProjectDefaults('proj-1', [
        { environmentName: 'dev', defaultRole: 'none' },
        { environmentName: 'staging', defaultRole: 'read' },
        { environmentName: 'prod', defaultRole: 'write' },
        { environmentName: 'test', defaultRole: 'admin' },
      ]);

      expect(defaults).toHaveLength(4);
      expect(defaults.map(d => d.default_role)).toEqual(['none', 'read', 'write', 'admin']);
    });
  });
});
