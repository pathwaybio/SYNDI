// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

// React Query hooks for SOP template CRUD operations
// useSOPTemplates, useCreateSOPTemplate, useUpdateSOPTemplate, useDeleteSOPTemplate
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const fetchSOPTemplates = async () => {
  const { data } = await axios.get('/api/sop-templates');
  return data;
};

const createSOPTemplate = async (newTemplate: any) => {
  // TODO: Replace with real API call when backend is ready
  // For now, simulate success for development/testing
  console.log('📝 SOP Template would be created:', newTemplate);
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Return simulated response
  return {
    id: newTemplate.id,
    ...newTemplate,
    created_at: new Date().toISOString(),
    status: 'created'
  };
  
  // Real API call (commented out until backend is ready):
  // const { data } = await axios.post('/api/sop-templates', newTemplate);
  // return data;
};

const updateSOPTemplate = async ({ id, updatedTemplate }: { id: string, updatedTemplate: any }) => {
  const { data } = await axios.put(`/api/sop-templates/${id}`, updatedTemplate);
  return data;
};

const deleteSOPTemplate = async (id: string) => {
  const { data } = await axios.delete(`/api/sop-templates/${id}`);
  return data;
};

export const useSOPTemplates = () => {
  return useQuery({
    queryKey: ['sopTemplates'],
    queryFn: fetchSOPTemplates,
  });
};

export const useCreateSOPTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSOPTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sopTemplates'] });
    },
  });
};

export const useUpdateSOPTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSOPTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sopTemplates'] });
    },
  });
};

export const useDeleteSOPTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSOPTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sopTemplates'] });
    },
  });
};
