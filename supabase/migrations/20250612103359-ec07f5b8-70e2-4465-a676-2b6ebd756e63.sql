
-- Create enum for user roles
CREATE TYPE public.user_role AS ENUM ('admin', 'editor', 'viewer');

-- Create enum for workspace types
CREATE TYPE public.workspace_type AS ENUM ('dev', 'qa', 'review', 'design', 'documentation');

-- Create profiles table for user management
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Create workspaces table
CREATE TABLE public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  workspace_type workspace_type NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Create workspace permissions table
CREATE TABLE public.workspace_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_level user_role NOT NULL DEFAULT 'viewer',
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE(workspace_id, user_id)
);

-- Create files table
CREATE TABLE public.files (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Create security definer functions to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_permission(workspace_id UUID, user_id UUID)
RETURNS user_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT permission_level 
  FROM public.workspace_permissions 
  WHERE workspace_permissions.workspace_id = $1 AND workspace_permissions.user_id = $2;
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE USING (public.get_user_role(auth.uid()) = 'admin');

-- RLS Policies for workspaces
CREATE POLICY "Users can view workspaces they have access to" ON public.workspaces
  FOR SELECT USING (
    created_by = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.workspace_permissions 
      WHERE workspace_id = workspaces.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and editors can create workspaces" ON public.workspaces
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'editor')
  );

CREATE POLICY "Workspace creators and admins can update workspaces" ON public.workspaces
  FOR UPDATE USING (
    created_by = auth.uid() OR 
    public.get_user_role(auth.uid()) = 'admin'
  );

-- RLS Policies for workspace permissions
CREATE POLICY "Users can view permissions for workspaces they access" ON public.workspace_permissions
  FOR SELECT USING (
    user_id = auth.uid() OR
    public.get_user_role(auth.uid()) = 'admin' OR
    EXISTS (
      SELECT 1 FROM public.workspaces 
      WHERE id = workspace_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "Admins and workspace creators can manage permissions" ON public.workspace_permissions
  FOR ALL USING (
    public.get_user_role(auth.uid()) = 'admin' OR
    EXISTS (
      SELECT 1 FROM public.workspaces 
      WHERE id = workspace_id AND created_by = auth.uid()
    )
  );

-- RLS Policies for files
CREATE POLICY "Users can view files in accessible workspaces" ON public.files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      LEFT JOIN public.workspace_permissions wp ON w.id = wp.workspace_id
      WHERE w.id = workspace_id AND (
        w.created_by = auth.uid() OR 
        wp.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users with editor/admin access can upload files" ON public.files
  FOR INSERT WITH CHECK (
    public.get_workspace_permission(workspace_id, auth.uid()) IN ('admin', 'editor') OR
    public.get_user_role(auth.uid()) = 'admin' OR
    EXISTS (
      SELECT 1 FROM public.workspaces 
      WHERE id = workspace_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "Users with editor/admin access can delete files" ON public.files
  FOR DELETE USING (
    uploaded_by = auth.uid() OR
    public.get_workspace_permission(workspace_id, auth.uid()) IN ('admin', 'editor') OR
    public.get_user_role(auth.uid()) = 'admin' OR
    EXISTS (
      SELECT 1 FROM public.workspaces 
      WHERE id = workspace_id AND created_by = auth.uid()
    )
  );

-- Create storage bucket for files
INSERT INTO storage.buckets (id, name, public) VALUES ('workspace-files', 'workspace-files', false);

-- Storage policies
CREATE POLICY "Authenticated users can view files" ON storage.objects
  FOR SELECT USING (
    auth.role() = 'authenticated' AND 
    bucket_id = 'workspace-files'
  );

CREATE POLICY "Authenticated users can upload files" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND 
    bucket_id = 'workspace-files'
  );

CREATE POLICY "Users can delete their uploaded files" ON storage.objects
  FOR DELETE USING (
    auth.role() = 'authenticated' AND 
    bucket_id = 'workspace-files'
  );

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    'viewer'
  );
  RETURN NEW;
END;
$$;

-- Trigger to automatically create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
