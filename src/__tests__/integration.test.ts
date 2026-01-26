/**
 * Integration tests for KeyEnv Node.js SDK
 *
 * These tests run against a live test API server.
 *
 * Prerequisites:
 *   - Start test infrastructure: `make test-infra-up` (from repo root)
 *   - API runs at http://localhost:8081/api/v1
 *
 * Environment variables:
 *   - KEYENV_API_URL: API base URL (e.g., http://localhost:8081)
 *   - KEYENV_TOKEN: Service token (default: env_test_integration_token_12345)
 *   - KEYENV_PROJECT: Project slug (default: sdk-test)
 *
 * Run:
 *   KEYENV_API_URL=http://localhost:8081 npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KeyEnv, KeyEnvError } from '../index.js';

// Skip integration tests if API URL is not configured
const API_URL = process.env.KEYENV_API_URL;
const SKIP_INTEGRATION = !API_URL;

// Test configuration
const TEST_TOKEN = process.env.KEYENV_TOKEN || 'env_test_integration_token_12345';
const TEST_PROJECT = process.env.KEYENV_PROJECT || 'sdk-test';
const TEST_ENVIRONMENT = 'development';

// Generate unique key prefix to avoid conflicts between test runs
const TEST_PREFIX = `TEST_${Date.now()}_`;

describe.skipIf(SKIP_INTEGRATION)('Integration Tests', () => {
  let client: KeyEnv;
  const createdKeys: string[] = [];

  beforeAll(() => {
    client = new KeyEnv({
      token: TEST_TOKEN,
      baseUrl: API_URL,
    });
  });

  afterAll(async () => {
    // Clean up all secrets created during tests
    for (const key of createdKeys) {
      try {
        await client.deleteSecret(TEST_PROJECT, TEST_ENVIRONMENT, key);
      } catch {
        // Ignore errors during cleanup (secret might already be deleted)
      }
    }
  });

  describe('Authentication', () => {
    it('validates token and returns user info', async () => {
      const user = await client.validateToken();

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.auth_type).toBe('service_token');
    });

    it('rejects invalid token', async () => {
      const badClient = new KeyEnv({
        token: 'invalid_token',
        baseUrl: API_URL,
      });

      await expect(badClient.validateToken()).rejects.toThrow(KeyEnvError);
    });
  });

  describe('Projects', () => {
    it('lists accessible projects', async () => {
      const projects = await client.listProjects();

      expect(Array.isArray(projects)).toBe(true);
      expect(projects.length).toBeGreaterThan(0);

      // Find our test project
      const testProject = projects.find((p) => p.slug === TEST_PROJECT);
      expect(testProject).toBeDefined();
      expect(testProject?.name).toBeDefined();
    });

    it('gets project details with environments', async () => {
      const project = await client.getProject(TEST_PROJECT);

      expect(project).toBeDefined();
      expect(project.slug).toBe(TEST_PROJECT);
      expect(Array.isArray(project.environments)).toBe(true);
      expect(project.environments.length).toBeGreaterThan(0);

      // Verify expected environments exist
      const envNames = project.environments.map((e) => e.name);
      expect(envNames).toContain('development');
    });

    it('returns 404 for non-existent project', async () => {
      await expect(client.getProject('non-existent-project-slug')).rejects.toThrow(KeyEnvError);

      try {
        await client.getProject('non-existent-project-slug');
      } catch (error) {
        expect(error).toBeInstanceOf(KeyEnvError);
        expect((error as KeyEnvError).status).toBe(404);
      }
    });
  });

  describe('Environments', () => {
    it('lists environments for a project', async () => {
      const environments = await client.listEnvironments(TEST_PROJECT);

      expect(Array.isArray(environments)).toBe(true);
      expect(environments.length).toBeGreaterThan(0);

      const envNames = environments.map((e) => e.name);
      expect(envNames).toContain('development');
    });
  });

  describe('Secrets CRUD', () => {
    const secretKey = `${TEST_PREFIX}API_KEY`;
    const secretValue = 'sk_test_secret_value_12345';
    const secretDescription = 'Test API key for integration tests';

    it('creates a new secret', async () => {
      createdKeys.push(secretKey);

      const secret = await client.createSecret(
        TEST_PROJECT,
        TEST_ENVIRONMENT,
        secretKey,
        secretValue,
        secretDescription
      );

      expect(secret).toBeDefined();
      expect(secret.key).toBe(secretKey);
      expect(secret.description).toBe(secretDescription);
      expect(secret.version).toBe(1);
    });

    it('retrieves the secret with value', async () => {
      const secret = await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, secretKey);

      expect(secret).toBeDefined();
      expect(secret.key).toBe(secretKey);
      expect(secret.value).toBe(secretValue);
      expect(secret.description).toBe(secretDescription);
    });

    it('lists secrets (without values)', async () => {
      const secrets = await client.listSecrets(TEST_PROJECT, TEST_ENVIRONMENT);

      expect(Array.isArray(secrets)).toBe(true);

      const foundSecret = secrets.find((s) => s.key === secretKey);
      expect(foundSecret).toBeDefined();
      expect(foundSecret?.key).toBe(secretKey);
      // listSecrets should not return values
      expect((foundSecret as { value?: string })?.value).toBeUndefined();
    });

    it('updates the secret', async () => {
      const newValue = 'sk_test_updated_value_67890';
      const newDescription = 'Updated description';

      const secret = await client.updateSecret(
        TEST_PROJECT,
        TEST_ENVIRONMENT,
        secretKey,
        newValue,
        newDescription
      );

      expect(secret).toBeDefined();
      expect(secret.key).toBe(secretKey);
      expect(secret.version).toBe(2);
      expect(secret.description).toBe(newDescription);

      // Verify the value was updated
      const fetched = await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, secretKey);
      expect(fetched.value).toBe(newValue);
    });

    it('retrieves secret history', async () => {
      const history = await client.getSecretHistory(TEST_PROJECT, TEST_ENVIRONMENT, secretKey);

      expect(Array.isArray(history)).toBe(true);
      // History stores previous versions only (not the current version)
      // After create + update, history has 1 entry (the original version 1)
      expect(history.length).toBeGreaterThanOrEqual(1);

      // History should contain the previous version
      const versions = history.map((h) => h.version);
      expect(versions).toContain(1);
    });

    it('deletes the secret', async () => {
      await client.deleteSecret(TEST_PROJECT, TEST_ENVIRONMENT, secretKey);

      // Remove from cleanup list since it's already deleted
      const index = createdKeys.indexOf(secretKey);
      if (index > -1) {
        createdKeys.splice(index, 1);
      }

      // Verify it's deleted
      await expect(
        client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, secretKey)
      ).rejects.toThrow(KeyEnvError);
    });
  });

  describe('setSecret (upsert)', () => {
    const upsertKey = `${TEST_PREFIX}UPSERT_KEY`;

    afterAll(async () => {
      try {
        await client.deleteSecret(TEST_PROJECT, TEST_ENVIRONMENT, upsertKey);
      } catch {
        // Ignore cleanup errors
      }
    });

    it('creates secret if it does not exist', async () => {
      createdKeys.push(upsertKey);

      const secret = await client.setSecret(
        TEST_PROJECT,
        TEST_ENVIRONMENT,
        upsertKey,
        'initial_value'
      );

      expect(secret).toBeDefined();
      expect(secret.key).toBe(upsertKey);
      expect(secret.version).toBe(1);
    });

    it('updates secret if it exists', async () => {
      const secret = await client.setSecret(
        TEST_PROJECT,
        TEST_ENVIRONMENT,
        upsertKey,
        'updated_value'
      );

      expect(secret).toBeDefined();
      expect(secret.key).toBe(upsertKey);
      expect(secret.version).toBe(2);
    });
  });

  describe('Export Secrets', () => {
    const exportKey1 = `${TEST_PREFIX}EXPORT_1`;
    const exportKey2 = `${TEST_PREFIX}EXPORT_2`;

    beforeAll(async () => {
      // Create test secrets for export
      await client.createSecret(TEST_PROJECT, TEST_ENVIRONMENT, exportKey1, 'export_value_1');
      await client.createSecret(TEST_PROJECT, TEST_ENVIRONMENT, exportKey2, 'export_value_2');
      createdKeys.push(exportKey1, exportKey2);
    });

    it('exports all secrets with values', async () => {
      const secrets = await client.exportSecrets(TEST_PROJECT, TEST_ENVIRONMENT);

      expect(Array.isArray(secrets)).toBe(true);

      const key1 = secrets.find((s) => s.key === exportKey1);
      const key2 = secrets.find((s) => s.key === exportKey2);

      expect(key1).toBeDefined();
      expect(key1?.value).toBe('export_value_1');
      expect(key2).toBeDefined();
      expect(key2?.value).toBe('export_value_2');
    });

    it('exports secrets as key-value object', async () => {
      const env = await client.exportSecretsAsObject(TEST_PROJECT, TEST_ENVIRONMENT);

      expect(typeof env).toBe('object');
      expect(env[exportKey1]).toBe('export_value_1');
      expect(env[exportKey2]).toBe('export_value_2');
    });

    it('generates .env file content', async () => {
      const content = await client.generateEnvFile(TEST_PROJECT, TEST_ENVIRONMENT);

      expect(typeof content).toBe('string');
      expect(content).toContain('# Generated by KeyEnv');
      expect(content).toContain(`${exportKey1}=export_value_1`);
      expect(content).toContain(`${exportKey2}=export_value_2`);
    });
  });

  describe('Bulk Import', () => {
    const bulkKey1 = `${TEST_PREFIX}BULK_1`;
    const bulkKey2 = `${TEST_PREFIX}BULK_2`;
    const bulkKey3 = `${TEST_PREFIX}BULK_3`;

    afterAll(async () => {
      // Clean up bulk imported secrets
      for (const key of [bulkKey1, bulkKey2, bulkKey3]) {
        try {
          await client.deleteSecret(TEST_PROJECT, TEST_ENVIRONMENT, key);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('bulk imports multiple secrets', async () => {
      const result = await client.bulkImport(
        TEST_PROJECT,
        TEST_ENVIRONMENT,
        [
          { key: bulkKey1, value: 'bulk_value_1', description: 'Bulk secret 1' },
          { key: bulkKey2, value: 'bulk_value_2', description: 'Bulk secret 2' },
        ]
      );

      expect(result).toBeDefined();
      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);

      // Track for cleanup
      createdKeys.push(bulkKey1, bulkKey2);

      // Verify secrets were created
      const secret1 = await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, bulkKey1);
      expect(secret1.value).toBe('bulk_value_1');

      const secret2 = await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, bulkKey2);
      expect(secret2.value).toBe('bulk_value_2');
    });

    it('bulk import with overwrite=false skips existing', async () => {
      const result = await client.bulkImport(
        TEST_PROJECT,
        TEST_ENVIRONMENT,
        [
          { key: bulkKey1, value: 'new_value_1' }, // Exists
          { key: bulkKey3, value: 'bulk_value_3' }, // New
        ],
        { overwrite: false }
      );

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.updated).toBe(0);

      createdKeys.push(bulkKey3);

      // Verify existing secret was NOT updated
      const secret1 = await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, bulkKey1);
      expect(secret1.value).toBe('bulk_value_1'); // Original value
    });

    it('bulk import with overwrite=true updates existing', async () => {
      const result = await client.bulkImport(
        TEST_PROJECT,
        TEST_ENVIRONMENT,
        [
          { key: bulkKey1, value: 'overwritten_value_1' },
        ],
        { overwrite: true }
      );

      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);

      // Verify secret was updated
      const secret1 = await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, bulkKey1);
      expect(secret1.value).toBe('overwritten_value_1');
    });
  });

  describe('Load Environment', () => {
    const loadEnvKey = `${TEST_PREFIX}LOAD_ENV_TEST`;
    const originalEnvValue = process.env[loadEnvKey];

    beforeAll(async () => {
      await client.createSecret(TEST_PROJECT, TEST_ENVIRONMENT, loadEnvKey, 'loaded_env_value');
      createdKeys.push(loadEnvKey);
    });

    afterAll(() => {
      // Restore original env value
      if (originalEnvValue !== undefined) {
        process.env[loadEnvKey] = originalEnvValue;
      } else {
        delete process.env[loadEnvKey];
      }
    });

    it('loads secrets into process.env', async () => {
      const count = await client.loadEnv(TEST_PROJECT, TEST_ENVIRONMENT);

      expect(count).toBeGreaterThan(0);
      expect(process.env[loadEnvKey]).toBe('loaded_env_value');
    });
  });

  describe('Error Handling', () => {
    it('returns proper error for non-existent secret', async () => {
      try {
        await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, 'NON_EXISTENT_KEY_12345');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(KeyEnvError);
        expect((error as KeyEnvError).status).toBe(404);
      }
    });

    it('returns proper error for duplicate key', async () => {
      const dupKey = `${TEST_PREFIX}DUPLICATE_KEY`;
      createdKeys.push(dupKey);

      // Create first
      await client.createSecret(TEST_PROJECT, TEST_ENVIRONMENT, dupKey, 'value1');

      // Try to create again
      try {
        await client.createSecret(TEST_PROJECT, TEST_ENVIRONMENT, dupKey, 'value2');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(KeyEnvError);
        // Could be 400 or 409 depending on API implementation
        expect([400, 409]).toContain((error as KeyEnvError).status);
      }
    });
  });

  describe('Special Characters', () => {
    const specialKey = `${TEST_PREFIX}SPECIAL_CHARS`;

    afterAll(async () => {
      try {
        await client.deleteSecret(TEST_PROJECT, TEST_ENVIRONMENT, specialKey);
      } catch {
        // Ignore cleanup errors
      }
    });

    it('handles values with special characters', async () => {
      const specialValue = 'postgres://user:p@ss=word!@localhost:5432/db?ssl=true&timeout=30';
      createdKeys.push(specialKey);

      await client.createSecret(TEST_PROJECT, TEST_ENVIRONMENT, specialKey, specialValue);

      const secret = await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, specialKey);
      expect(secret.value).toBe(specialValue);
    });

    it('handles multiline values', async () => {
      const multilineValue = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy
-----END RSA PRIVATE KEY-----`;

      await client.updateSecret(TEST_PROJECT, TEST_ENVIRONMENT, specialKey, multilineValue);

      const secret = await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, specialKey);
      expect(secret.value).toBe(multilineValue);
    });

    it('handles JSON values', async () => {
      const jsonValue = JSON.stringify({ key: 'value', nested: { array: [1, 2, 3] } });

      await client.updateSecret(TEST_PROJECT, TEST_ENVIRONMENT, specialKey, jsonValue);

      const secret = await client.getSecret(TEST_PROJECT, TEST_ENVIRONMENT, specialKey);
      expect(secret.value).toBe(jsonValue);
      expect(JSON.parse(secret.value)).toEqual({ key: 'value', nested: { array: [1, 2, 3] } });
    });
  });
});
