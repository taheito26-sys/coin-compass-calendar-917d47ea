-- Clear old policies
DROP POLICY IF EXISTS "Users can read own non-sensitive preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can read all own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;

-- Create fresh ones
CREATE POLICY "Users can read all own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Add UNIQUE constraint for Upsert logic (user_id and key pair must be unique)
ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_key_key;
ALTER TABLE public.user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_key_unique;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_key_unique UNIQUE (user_id, "key");
