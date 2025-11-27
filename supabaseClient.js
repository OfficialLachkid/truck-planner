// supabaseClient.js
const SUPABASE_URL = "https://gufumobzgngpiqzracbv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1ZnVtb2J6Z25ncGlxenJhY2J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMTg3NTUsImV4cCI6MjA3OTY5NDc1NX0.VR0D8yGE-7wuNbwrnft4JKeW1pKhVro7ADKiM2UPuks";

const { createClient } = window.supabase;
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
