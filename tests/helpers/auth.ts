import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Test-only helper for exercising auth.uid()-dependent RPCs and RLS policies
// under a REAL signed-in user identity, instead of the service-role bypass
// every other test file in tests/ uses for setup. Local Supabase has
// email/password sign-up enabled (see supabase/config.toml [auth]), so we
// can create a confirmed user via the admin API and sign in as them.

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

let counter = 0;

export interface AuthedTestUser {
  userId: string;
  email: string;
  client: SupabaseClient;
}

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Creates a confirmed test user via the admin API and returns a Supabase
 * client authenticated as that user (anon key + password session). Use this
 * whenever a test needs `auth.uid()` to resolve to a real user -- e.g.
 * `crear_organizacion` (identifies the caller via auth.uid()) or the
 * membership-based RLS policies (0011_rls_rewrite.sql).
 */
export async function createAuthedUser(tag: string): Promise<AuthedTestUser> {
  const admin = adminClient();
  const email = `test-${tag}-${Date.now()}-${counter++}@example.com`;
  const password = "test-password-123!";

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw createError ?? new Error(`Failed to create test user for tag "${tag}"`);
  }

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw signInError;
  }

  return { userId: created.user.id, email, client };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const admin = adminClient();
  await admin.auth.admin.deleteUser(userId);
}
