
-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- 2. Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 5. RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. Seed admin role for taheito26@gmail.com
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'taheito26@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 7. Allow admins to SELECT all transactions (existing policy only allows own)
CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 8. Allow admins to SELECT all lots
CREATE POLICY "Admins can view all lots"
  ON public.lots FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 9. Allow admins to SELECT all portfolio_snapshots
CREATE POLICY "Admins can view all portfolio snapshots"
  ON public.portfolio_snapshots FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 10. Allow admins to SELECT all position_snapshots
CREATE POLICY "Admins can view all position snapshots"
  ON public.position_snapshots FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 11. Allow admins to view all imported_files
CREATE POLICY "Admins can view all imported files"
  ON public.imported_files FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 12. Allow admins to view all user_preferences
CREATE POLICY "Admins can view all user preferences"
  ON public.user_preferences FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 13. Allow admins to view all import_batches
CREATE POLICY "Admins can view all import batches"
  ON public.import_batches FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
