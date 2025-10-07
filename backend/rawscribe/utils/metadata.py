# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Metadata Classes for CLAIRE
Contains metadata structures for drafts, ELNs, and base metadata functionality
"""

import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# create BaseMetadata class with common fields and methods for DraftMetadata and ELNMetadata
class BaseMetadata:
    """Common metadata structure"""
    def __init__(
        self,
        sop_id: str,
        user_id: str,
        timestamp: datetime,
        size_bytes: int = 0,
        checksum: Optional[str] = None,
        variables: Optional[List[str]] = None
    ):
        self.sop_id = sop_id
        self.user_id = user_id
        self.timestamp = timestamp
        self.size_bytes = size_bytes
        self.checksum = checksum
        self.variables = variables or []

    @property
    def uuid(self) -> str:
        """Get unique identifier for metadata"""
        return f"{self.sop_id}-{self.user_id}-{self.timestamp.isoformat()}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            'sop_id': self.sop_id,
            'user_id': self.user_id,
            'timestamp': self.timestamp.isoformat(),
            'size_bytes': self.size_bytes,
            'checksum': self.checksum,
            'variables': self.variables
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'BaseMetadata':
        return cls(
            sop_id=data['sop_id'],
            user_id=data['user_id'],
            timestamp=datetime.fromisoformat(data['timestamp']),
            size_bytes=data.get('size_bytes', 0),
            checksum=data.get('checksum'),
            variables=data.get('variables', [])
        )

    @classmethod
    def create_timestamp(cls) -> datetime:
        """Create a timezone-aware timestamp for metadata"""
        return datetime.now(timezone.utc)

    @classmethod
    def calculate_size_bytes(cls, data: Any) -> int:
        """Calculate size in bytes for data"""
        if isinstance(data, dict):
            return len(json.dumps(data, sort_keys=True).encode('utf-8'))
        elif isinstance(data, str):
            return len(data.encode('utf-8'))
        else:
            return len(str(data).encode('utf-8'))

    @classmethod
    def ensure_timezone_aware(cls, timestamp: datetime) -> datetime:
        """Ensure timestamp is timezone-aware, defaulting to UTC if naive"""
        if timestamp.tzinfo is None:
            return timestamp.replace(tzinfo=timezone.utc)
        return timestamp

    def update_size_from_data(self, data: Any) -> None:
        """Update size_bytes based on data"""
        self.size_bytes = self.calculate_size_bytes(data)

    def update_timestamp(self, timestamp: Optional[datetime] = None) -> None:
        """Update timestamp with timezone awareness"""
        if timestamp is None:
            timestamp = self.create_timestamp()
        else:
            timestamp = self.ensure_timezone_aware(timestamp)
        self.timestamp = timestamp

    @classmethod
    def create(
        cls,
        sop_id: str,
        user_id: str,
        timestamp: Optional[datetime] = None,
        size_bytes: Optional[int] = None,
        data: Optional[Dict[str, Any]] = None,
        eln_document: Optional[Dict[str, Any]] = None,
        checksum: Optional[str] = None,
        variables: Optional[List[str]] = None,
        **kwargs
    ) -> 'BaseMetadata':
        """Generic factory method for creating metadata with common patterns"""
        # Handle timestamp
        if timestamp is None:
            timestamp = cls.create_timestamp()
        else:
            timestamp = cls.ensure_timezone_aware(timestamp)
        
        # Calculate size from data if not provided
        if size_bytes is None:
            # Prefer eln_document over data for size calculation
            data_for_size = eln_document if eln_document else data
            if data_for_size is not None:
                size_bytes = cls.calculate_size_bytes(data_for_size)
            else:
                size_bytes = 0
        
        # Create metadata instance
        return cls(
            sop_id=sop_id,
            user_id=user_id,
            timestamp=timestamp,
            size_bytes=size_bytes,
            checksum=checksum,
            variables=variables or [],
            **kwargs
        )


# Metadata classes
class DraftMetadata(BaseMetadata):
    """Draft metadata structure"""
    def __init__(
        self,
        draft_id: str,
        sop_id: str,
        user_id: str,
        session_id: str,
        timestamp: datetime,
        completion_percentage: float = 0.0,
        title: Optional[str] = None,
        size_bytes: int = 0,
        draft_uuid: Optional[str] = None,
        checksum: Optional[str] = None,
        variables: Optional[List[str]] = None
    ):
        super().__init__(sop_id, user_id, timestamp, size_bytes, checksum, variables)
        self.draft_id = draft_id
        self.session_id = session_id
        self.completion_percentage = completion_percentage
        self.title = title
        self._draft_uuid = draft_uuid

    # override uuid method to return draft_uuid, call uuid from draft_uuid so you don't break existing code
    @property
    def draft_uuid(self) -> str:
        """Get draft UUID - use stored value or extract from draft_id as fallback"""
        if self._draft_uuid:
            return self._draft_uuid
        # Fallback: extract from draft_id (last 8 characters before any extension)
        # For draft_id like "draft-user-proj-20250729_123456-abc12345"
        parts = self.draft_id.split('-')
        if parts:
            return parts[-1]  # Last part should be the UUID
        return ""

    def to_dict(self) -> Dict[str, Any]:
        # call super to_dict to get the base metadata
        base_dict = super().to_dict()
        return {
            'draft_id': self.draft_id,
            'draft_uuid': self.draft_uuid,
            'session_id': self.session_id,
            'completion_percentage': self.completion_percentage,
            'title': self.title,
            **base_dict
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DraftMetadata':
        return cls(
            draft_id=data['draft_id'],
            sop_id=data['sop_id'],
            user_id=data['user_id'],
            session_id=data['session_id'],
            timestamp=datetime.fromisoformat(data['timestamp']),
            completion_percentage=data.get('completion_percentage', 0.0),
            title=data.get('title'),
            size_bytes=data.get('size_bytes', 0),
            draft_uuid=data.get('draft_uuid'),
            checksum=data.get('checksum'),
            variables=data.get('variables', [])
        )


class ELNMetadata(BaseMetadata):
    """ELN submission metadata structure"""
    def __init__(
        self,
        eln_uuid: str,
        filename: str,
        sop_id: str,
        user_id: str,
        status: str,
        timestamp: datetime,
        size_bytes: int = 0,
        checksum: Optional[str] = None,
        variables: Optional[List[str]] = None
    ):
        super().__init__(sop_id, user_id, timestamp, size_bytes, checksum, variables)
        self.eln_uuid = eln_uuid
        self.filename = filename
        self.status = status

    def to_dict(self) -> Dict[str, Any]:
        # call super to_dict to get the base metadata
        base_dict = super().to_dict()
        return {
            'eln_uuid': self.eln_uuid,
            'filename': self.filename,
            'status': self.status,
            **base_dict
        }

    def to_response_dict(self) -> Dict[str, Any]:
        """Convert metadata to dictionary format suitable for API responses"""
        return {
            'eln_uuid': self.eln_uuid,
            'filename': self.filename,
            'sop_id': self.sop_id,
            'user_id': self.user_id,
            'status': self.status,
            'timestamp': self.timestamp.isoformat(),
            'size_bytes': self.size_bytes,
            'checksum': self.checksum,
            'variables': self.variables
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ELNMetadata':
        return cls(
            eln_uuid=data['eln_uuid'],
            filename=data['filename'],
            sop_id=data['sop_id'],
            user_id=data['user_id'],
            status=data['status'],
            timestamp=datetime.fromisoformat(data['timestamp']),
            size_bytes=data.get('size_bytes', 0),
            checksum=data.get('checksum'),
            variables=data.get('variables', [])
        )