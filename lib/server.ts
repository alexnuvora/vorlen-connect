import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { VorlenService } from './linkedin-service.mjs';
import { SupabaseStore } from './supabase-store.mjs';
import { fail } from './security.mjs';
export async function service(){const user=await getChatGPTUser();if(!user)fail('UNAUTHENTICATED','Sign in to Vorlen Connect.',401);const settings=env as unknown as Record<string,string>;return new VorlenService(new SupabaseStore(settings.SUPABASE_URL,settings.SUPABASE_SERVICE_ROLE_KEY,user!.userId),user!.userId,settings.CREDENTIAL_ENCRYPTION_KEY,settings);}
