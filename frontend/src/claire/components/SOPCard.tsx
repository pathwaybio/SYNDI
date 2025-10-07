// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import { SOPMetadata } from '@shared/types/sop';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/components/ui/card';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/components/ui/collapsible';
import { Calendar, User, FileText, Tag, ExternalLink, ChevronDown, ChevronRight, Hash } from 'lucide-react';

interface SOPCardProps {
  sop: SOPMetadata;
  onSelect?: (sop: SOPMetadata) => void;
  selected?: boolean;
  className?: string;
}

export const SOPCard: React.FC<SOPCardProps> = ({
  sop,
  onSelect,
  selected = false,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    onSelect?.(sop);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <Card 
      className={`transition-all duration-200 hover:shadow-lg ${
        selected ? 'ring-2 ring-primary' : ''
      } ${className}`}
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg font-semibold line-clamp-2">
                  {sop.title}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground mt-1">
                  {sop.name}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="flex-shrink-0">
                  v{sop.version}
                </Badge>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {sop.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {sop.description}
              </p>
            )}
            
            <div className="space-y-2">
              <div className="flex items-center text-xs text-muted-foreground">
                <Hash className="w-3 h-3 mr-1" />
                <span>ID: {sop.id}</span>
              </div>
              
              {sop.author && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <User className="w-3 h-3 mr-1" />
                  <span>{sop.author}</span>
                </div>
              )}
              
              {sop.date_published && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3 mr-1" />
                  <span>Published: {formatDate(sop.date_published)}</span>
                </div>
              )}
              
              <div className="flex items-center text-xs text-muted-foreground">
                <FileText className="w-3 h-3 mr-1" />
                <span>File: {sop.filename}</span>
              </div>
            </div>
            
            {sop.keywords.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center text-xs text-muted-foreground mb-1">
                  <Tag className="w-3 h-3 mr-1" />
                  <span>Keywords:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {sop.keywords.slice(0, 3).map((keyword, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                  {sop.keywords.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{sop.keywords.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
            
            {onSelect && (
              <div className="mt-4 pt-3 border-t">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={handleClick}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open SOP
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}; 