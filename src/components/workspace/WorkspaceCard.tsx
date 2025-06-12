
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, Upload, Users } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';

type Workspace = Tables<'workspaces'>;

interface WorkspaceCardProps {
  workspace: Workspace;
  onEnter: (workspace: Workspace) => void;
  userRole?: string;
}

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ workspace, onEnter, userRole }) => {
  const getWorkspaceIcon = (type: string) => {
    switch (type) {
      case 'dev':
        return '💻';
      case 'qa':
        return '🧪';
      case 'review':
        return '📋';
      case 'design':
        return '🎨';
      case 'documentation':
        return '📚';
      default:
        return '📁';
    }
  };

  const getWorkspaceColor = (type: string) => {
    switch (type) {
      case 'dev':
        return 'bg-blue-500';
      case 'qa':
        return 'bg-green-500';
      case 'review':
        return 'bg-yellow-500';
      case 'design':
        return 'bg-purple-500';
      case 'documentation':
        return 'bg-gray-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg ${getWorkspaceColor(workspace.workspace_type)} flex items-center justify-center text-white text-lg`}>
              {getWorkspaceIcon(workspace.workspace_type)}
            </div>
            <div>
              <CardTitle className="text-lg">{workspace.name}</CardTitle>
              <CardDescription>{workspace.description}</CardDescription>
            </div>
          </div>
          <Badge variant="secondary">{workspace.workspace_type}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <div className="flex items-center space-x-1">
              <Users className="h-4 w-4" />
              <span>{userRole || 'viewer'}</span>
            </div>
          </div>
          <Button onClick={() => onEnter(workspace)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Enter Workspace
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
