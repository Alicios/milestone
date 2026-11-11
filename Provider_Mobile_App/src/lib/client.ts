import { createProviderApi } from './api';
import { supabase } from './supabase';
export const api = createProviderApi(supabase);
