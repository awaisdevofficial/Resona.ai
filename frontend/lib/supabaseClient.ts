import { createClient } from "@supabase/supabase-js"

// Use placeholders when unset so the app builds (e.g. after fresh clone). Auth will work once real values are in .env.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

