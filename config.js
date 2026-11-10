// =====================================================================
//  Genesis CRM — public config
//  Supabase → Project Settings → API. The anon key is MEANT to be public:
//  all protection comes from Row-Level Security in 001_schema.sql.
//  NEVER put the service_role key here.
// =====================================================================
export const CONFIG = {
  SUPABASE_URL: "https://broeopflwofwffjoalfh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2VvcGZsd29md2Zmam9hbGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMTMxODIsImV4cCI6MjEwOTg4OTE4Mn0.yT_kru79EyWBq2R9sAiap3qaw_vQBaPpywkMj8VYK_4",
  COMPANY: "Genesis Infoserve",
  IDLE_LOGOUT_MIN: 30,
};
