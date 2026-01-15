# KeyEnv Node.js SDK

Official Node.js SDK for [KeyEnv](https://keyenv.dev) - Secure secrets management for development teams.

## Installation

```bash
npm install keyenv
```

## Quick Start

```typescript
import { KeyEnv } from 'keyenv';

const client = new KeyEnv({
  token: process.env.KEYENV_TOKEN!,
});

// Load secrets into process.env
await client.loadEnv('your-project-id', 'production');
console.log(process.env.DATABASE_URL);
```

## Usage

### Initialize the Client

```typescript
import { KeyEnv } from 'keyenv';

const client = new KeyEnv({
  token: 'your-service-token',
});
```

### Export Secrets

```typescript
// Get all secrets as an array
const secrets = await client.exportSecrets('project-id', 'production');
for (const secret of secrets) {
  console.log(`${secret.key}=${secret.value}`);
}

// Get secrets as a key-value object
const env = await client.exportSecretsAsObject('project-id', 'production');
console.log(env.DATABASE_URL);

// Load directly into process.env
const count = await client.loadEnv('project-id', 'production');
console.log(`Loaded ${count} secrets`);
```

### Manage Secrets

```typescript
// Get a single secret
const secret = await client.getSecret('project-id', 'production', 'DATABASE_URL');
console.log(secret.value);

// Set a secret (creates or updates)
await client.setSecret('project-id', 'production', 'API_KEY', 'sk_live_...');

// Delete a secret
await client.deleteSecret('project-id', 'production', 'OLD_KEY');
```

### Bulk Import

```typescript
const result = await client.bulkImport('project-id', 'development', [
  { key: 'DATABASE_URL', value: 'postgres://localhost/mydb' },
  { key: 'REDIS_URL', value: 'redis://localhost:6379' },
  { key: 'API_KEY', value: 'sk_test_...', description: 'Test API key' },
], { overwrite: true });

console.log(`Created: ${result.created}, Updated: ${result.updated}`);
```

### Generate .env File

```typescript
import { writeFileSync } from 'fs';

const envContent = await client.generateEnvFile('project-id', 'production');
writeFileSync('.env', envContent);
```

### List Projects and Environments

```typescript
// List all projects
const projects = await client.listProjects();
for (const project of projects) {
  console.log(`${project.name} (${project.id})`);
}

// Get project with environments
const project = await client.getProject('project-id');
for (const env of project.environments) {
  console.log(`  - ${env.name}`);
}
```

### Service Token Info

```typescript
// Get current user or service token info
const user = await client.getCurrentUser();

if (user.auth_type === 'service_token') {
  // Service tokens can access multiple projects
  console.log('Projects:', user.project_ids);
  console.log('Scopes:', user.scopes);
}
```

## Error Handling

```typescript
import { KeyEnv, KeyEnvError } from 'keyenv';

try {
  await client.getSecret('project-id', 'production', 'MISSING_KEY');
} catch (error) {
  if (error instanceof KeyEnvError) {
    console.error(`Error ${error.status}: ${error.message}`);
    if (error.status === 404) {
      console.error('Secret not found');
    }
  }
}
```

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```typescript
import type { Secret, SecretWithValue, Project } from 'keyenv';
```

## API Reference

### `new KeyEnv(options)`

Create a new KeyEnv client.

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `token` | `string` | Yes | - | Service token |
| `timeout` | `number` | No | `30000` | Request timeout (ms) |

### Methods

| Method | Description |
|--------|-------------|
| `getCurrentUser()` | Get current user/token info |
| `listProjects()` | List all accessible projects |
| `getProject(id)` | Get project with environments |
| `listEnvironments(projectId)` | List environments in a project |
| `listSecrets(projectId, env)` | List secret keys (no values) |
| `exportSecrets(projectId, env)` | Export secrets with values |
| `exportSecretsAsObject(projectId, env)` | Export as key-value object |
| `getSecret(projectId, env, key)` | Get single secret |
| `setSecret(projectId, env, key, value)` | Create or update secret |
| `deleteSecret(projectId, env, key)` | Delete secret |
| `bulkImport(projectId, env, secrets)` | Bulk import secrets |
| `loadEnv(projectId, env)` | Load secrets into process.env |
| `generateEnvFile(projectId, env)` | Generate .env file content |
| `listPermissions(projectId, env)` | List permissions for an environment |
| `setPermission(projectId, env, userId, role)` | Set user's permission |
| `deletePermission(projectId, env, userId)` | Delete user's permission |
| `getMyPermissions(projectId)` | Get current user's permissions |
| `getProjectDefaults(projectId)` | Get default permissions |
| `setProjectDefaults(projectId, defaults)` | Set default permissions |

## License

MIT
