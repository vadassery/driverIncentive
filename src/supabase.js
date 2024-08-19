// src/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://aobcelfbawxxsalayguh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvYmNlbGZiYXd4eHNhbGF5Z3VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQwNDEwMDQsImV4cCI6MjAzOTYxNzAwNH0.9Y6PK59s7-2WXh1k4BMueB4j6yeKyVLL6K4IZk0tri4';

export const supabase = createClient(supabaseUrl, supabaseKey);

