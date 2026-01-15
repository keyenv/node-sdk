/** KeyEnv client configuration options */
export interface KeyEnvOptions {
  /** Service token for authentication */
  token: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Cache TTL in seconds for exportSecrets/loadEnv (default: 0 = disabled). Also configurable via KEYENV_CACHE_TTL env var. */
  cacheTtl?: number;
}

/** User or service token info */
export interface User {
  id: string;
  email?: string;
  name?: string;
  clerk_id?: string;
  avatar_url?: string;
  /** Present for service tokens */
  auth_type?: 'service_token' | 'user';
  /** Team ID (for service tokens) */
  team_id?: string;
  /** Project IDs (for project-scoped service tokens) */
  project_ids?: string[];
  /** Token scopes (for service tokens) */
  scopes?: string[];
  created_at: string;
}

/** Project */
export interface Project {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  description?: string;
  created_at: string;
}

/** Environment */
export interface Environment {
  id: string;
  project_id: string;
  name: string;
  inherits_from?: string;
  created_at: string;
}

/** Project with environments */
export interface ProjectWithEnvironments extends Project {
  environments: Environment[];
}

/** Secret (without value) */
export interface Secret {
  id: string;
  environment_id: string;
  key: string;
  type: string;
  description?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Secret with decrypted value */
export interface SecretWithValue extends Secret {
  value: string;
  inherited_from?: string;
}

/** Secret history entry */
export interface SecretHistory {
  id: string;
  secret_id: string;
  value: string;
  version: number;
  changed_by?: string;
  changed_at: string;
}

/** Bulk import request item */
export interface BulkSecretItem {
  key: string;
  value: string;
  description?: string;
}

/** Bulk import result */
export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: number;
}

/** API error response */
export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/** KeyEnv API error */
export class KeyEnvError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'KeyEnvError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Environment permission role */
export type EnvironmentRole = 'none' | 'read' | 'write' | 'admin';

/** Environment permission for a user */
export interface EnvironmentPermission {
  id: string;
  environment_id: string;
  user_id: string;
  role: EnvironmentRole;
  user_email?: string;
  user_name?: string;
  granted_by?: string;
  created_at: string;
  updated_at: string;
}

/** User's permission for an environment */
export interface MyPermission {
  environment_id: string;
  environment_name: string;
  role: EnvironmentRole;
  can_read: boolean;
  can_write: boolean;
  can_admin: boolean;
}

/** Response for getting user's permissions */
export interface MyPermissionsResponse {
  permissions: MyPermission[];
  is_team_admin: boolean;
}

/** Project default permission for an environment */
export interface ProjectDefault {
  id: string;
  project_id: string;
  environment_name: string;
  default_role: EnvironmentRole;
  created_at: string;
}
