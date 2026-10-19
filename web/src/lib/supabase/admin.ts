import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client for server actions and jobs. Never import from client code.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
