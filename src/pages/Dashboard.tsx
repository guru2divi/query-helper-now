
import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { WorkspaceCard } from '@/components/workspace/WorkspaceCard';
import { CreateWorkspaceDialog } from '@/components/workspace/CreateWorkspaceDialog';
import { WorkspaceView } from '@/components/workspace/WorkspaceView';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type Workspace = Tables<'workspaces'>;

export const Dashboard = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, string>>({});
  const { isEditor } = useAuth();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    try {
      const { data: workspacesData, error: workspacesError } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false });

      if (workspacesError) throw workspacesError;

      const { data: permissionsData, error: permissionsError } = await supabase
        .from('workspace_permissions')
        .select('workspace_id, permission_level');

      if (permissionsError) throw permissionsError;

      const permissionsMap: Record<string, string> = {};
      permissionsData?.forEach(permission => {
        permissionsMap[permission.workspace_id] = permission.permission_level;
      });

      setWorkspaces(workspacesData || []);
      setUserPermissions(permissionsMap);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch workspaces');
    }
  };

  if (selectedWorkspace) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-6">
          <WorkspaceView
            workspace={selectedWorkspace}
            onBack={() => setSelectedWorkspace(null)}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Workspaces</h1>
            <p className="text-gray-600">Manage your project files and collaborate with your team</p>
          </div>
          {isEditor && <CreateWorkspaceDialog onWorkspaceCreated={fetchWorkspaces} />}
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              onEnter={setSelectedWorkspace}
              userRole={userPermissions[workspace.id]}
            />
          ))}
        </div>

        {workspaces.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No workspaces yet</h3>
            <p className="text-gray-500 mb-4">Get started by creating your first workspace</p>
            {isEditor && <CreateWorkspaceDialog onWorkspaceCreated={fetchWorkspaces} />}
          </div>
        )}
      </main>
    </div>
  );
};
