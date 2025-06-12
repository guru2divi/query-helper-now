
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Upload, Search, Trash2, Download } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

type Workspace = Tables<'workspaces'>;
type File = Tables<'files'>;

interface WorkspaceViewProps {
  workspace: Workspace;
  onBack: () => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ workspace, onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { isEditor, profile } = useAuth();

  useEffect(() => {
    fetchFiles();
  }, [workspace.id]);

  const fetchFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch files');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${workspace.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('workspace-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('files')
        .insert({
          workspace_id: workspace.id,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: profile!.id,
        });

      if (dbError) throw dbError;

      toast.success('File uploaded successfully!');
      fetchFiles();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const handleFileDelete = async (file: File) => {
    try {
      const { error: storageError } = await supabase.storage
        .from('workspace-files')
        .remove([file.file_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', file.id);

      if (dbError) throw dbError;

      toast.success('File deleted successfully!');
      fetchFiles();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete file');
    }
  };

  const handleFileDownload = async (file: File) => {
    try {
      const { data, error } = await supabase.storage
        .from('workspace-files')
        .download(file.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error.message || 'Failed to download file');
    }
  };

  const filteredFiles = files.filter(file =>
    file.file_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Workspaces
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{workspace.name}</h1>
            <p className="text-gray-600">{workspace.description}</p>
          </div>
        </div>
        {isEditor && (
          <div className="flex items-center space-x-2">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isLoading}
            />
            <Button asChild disabled={isLoading}>
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-4 w-4 mr-2" />
                {isLoading ? 'Uploading...' : 'Upload File'}
              </label>
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2">
        <Search className="h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search files..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      <div className="grid gap-4">
        {filteredFiles.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-gray-500">No files found in this workspace.</p>
            </CardContent>
          </Card>
        ) : (
          filteredFiles.map((file) => (
            <Card key={file.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{file.file_name}</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleFileDownload(file)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    {(isEditor || file.uploaded_by === profile?.id) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFileDelete(file)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Size: {file.file_size ? formatFileSize(file.file_size) : 'Unknown'}</span>
                  <span>Uploaded: {new Date(file.created_at).toLocaleDateString()}</span>
                  <span>Type: {file.mime_type || 'Unknown'}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
