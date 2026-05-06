// Supabase Configuration
const SUPABASE_URL = 'https://xiglqnhzqlqoibmjlazg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpZ2xxbmh6cWxxb2libWpsYXpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzAyNDUsImV4cCI6MjA5MzY0NjI0NX0.TotDKkOd9X_Upc1dJfJNikj5rfDTbERCfWQ-ae2P_hM';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
