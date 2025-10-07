# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Unit tests for RBAC enforcement utilities
Tests the functional permission checking and enforcement
"""

import pytest
from fastapi import HTTPException
from rawscribe.utils.auth import User
from rawscribe.utils.rbac_enforcement import (
    can_submit, require_submit_permission,
    can_manage_drafts, require_draft_permission,
    can_view_data, require_view_permission,
    can_view_user_data, filter_viewable_data,
    get_user_role_display, has_role
)

class TestCanSubmit:
    """Test submit permission checking"""
    
    def test_admin_can_submit_anything(self):
        admin = User(
            id="admin1", email="admin@test.com", username="admin", name="Admin",
            groups=["admin"], permissions=["*"], is_admin=True
        )
        assert can_submit(admin, "sop1") is True
        assert can_submit(admin, None) is True
    
    def test_researcher_can_submit_sops(self):
        researcher = User(
            id="researcher1", email="researcher@test.com", username="researcher", name="Researcher",
            groups=["researcher"], permissions=["submit:SOP*", "view:own", "view:group", "draft:*"]
        )
        assert can_submit(researcher, "sop1") is True
        assert can_submit(researcher, None) is True
    
    def test_viewer_cannot_submit(self):
        viewer = User(
            id="viewer1", email="viewer@test.com", username="viewer", name="Viewer",
            groups=["viewer"], permissions=["view:own", "view:group"]
        )
        assert can_submit(viewer, "sop1") is False
        assert can_submit(viewer, None) is False
    
    def test_wildcard_submit_permission(self):
        user = User(
            id="user1", email="user@test.com", username="user", name="User",
            groups=["custom"], permissions=["submit:*"]
        )
        assert can_submit(user, "sop1") is True
        assert can_submit(user, "anything") is True
    
    def test_specific_sop_permission(self):
        user = User(
            id="user1", email="user@test.com", username="user", name="User",
            groups=["custom"], permissions=["submit:sop1"]
        )
        assert can_submit(user, "sop1") is True
        assert can_submit(user, "sop2") is False


class TestRequireSubmitPermission:
    """Test submit permission enforcement"""
    
    def test_admin_passes_check(self):
        admin = User(
            id="admin1", email="admin@test.com", username="admin", name="Admin",
            groups=["admin"], permissions=["*"], is_admin=True
        )
        # Should not raise exception
        require_submit_permission(admin, "sop1")
    
    def test_unauthorized_user_raises_exception(self):
        viewer = User(
            id="viewer1", email="viewer@test.com", username="viewer", name="Viewer",
            groups=["viewer"], permissions=["view:own"]
        )
        with pytest.raises(HTTPException) as exc_info:
            require_submit_permission(viewer, "sop1")
        assert exc_info.value.status_code == 403
        assert "Insufficient permissions to submit" in str(exc_info.value.detail)


class TestCanManageDrafts:
    """Test draft management permission checking"""
    
    def test_researcher_can_manage_drafts(self):
        researcher = User(
            id="researcher1", email="researcher@test.com", username="researcher", name="Researcher",
            groups=["researcher"], permissions=["draft:*", "submit:SOP*", "view:own"]
        )
        assert can_manage_drafts(researcher, "create") is True
        assert can_manage_drafts(researcher, "update") is True
        assert can_manage_drafts(researcher, "delete") is True
    
    def test_viewer_cannot_manage_drafts(self):
        viewer = User(
            id="viewer1", email="viewer@test.com", username="viewer", name="Viewer",
            groups=["viewer"], permissions=["view:own", "view:group"]
        )
        assert can_manage_drafts(viewer, "create") is False
        assert can_manage_drafts(viewer, "update") is False
    
    def test_specific_draft_action_permission(self):
        user = User(
            id="user1", email="user@test.com", username="user", name="User",
            groups=["custom"], permissions=["draft:create", "draft:update"]
        )
        assert can_manage_drafts(user, "create") is True
        assert can_manage_drafts(user, "update") is True
        assert can_manage_drafts(user, "delete") is False


class TestCanViewData:
    """Test view permission checking"""
    
    def test_admin_can_view_all(self):
        admin = User(
            id="admin1", email="admin@test.com", username="admin", name="Admin",
            groups=["admin"], permissions=["*"], is_admin=True
        )
        assert can_view_data(admin, "own") is True
        assert can_view_data(admin, "group") is True
        assert can_view_data(admin, "all") is True
    
    def test_researcher_view_permissions(self):
        researcher = User(
            id="researcher1", email="researcher@test.com", username="researcher", name="Researcher",
            groups=["researcher"], permissions=["view:own", "view:group", "submit:SOP*"]
        )
        assert can_view_data(researcher, "own") is True
        assert can_view_data(researcher, "group") is True
        assert can_view_data(researcher, "all") is False
    
    def test_viewer_basic_permissions(self):
        viewer = User(
            id="viewer1", email="viewer@test.com", username="viewer", name="Viewer",
            groups=["viewer"], permissions=["view:own", "view:group"]
        )
        assert can_view_data(viewer, "own") is True
        assert can_view_data(viewer, "group") is True
        assert can_view_data(viewer, "all") is False


class TestCanViewUserData:
    """Test user-specific data viewing permissions"""
    
    def test_can_view_own_data(self):
        user = User(
            id="user1", email="user@test.com", username="user1", name="User",
            groups=["researcher"], permissions=["view:own"]
        )
        assert can_view_user_data(user, "user1") is True
        assert can_view_user_data(user, user.id) is True
        assert can_view_user_data(user, "other_user") is False
    
    def test_group_view_permission(self):
        user = User(
            id="user1", email="user@test.com", username="user1", name="User",
            groups=["researcher"], permissions=["view:group"]
        )
        assert can_view_user_data(user, "other_user") is True
    
    def test_admin_can_view_any_user_data(self):
        admin = User(
            id="admin1", email="admin@test.com", username="admin", name="Admin",
            groups=["admin"], permissions=["*"], is_admin=True
        )
        assert can_view_user_data(admin, "any_user") is True


class TestFilterViewableData:
    """Test data filtering based on view permissions"""
    
    def test_admin_sees_all_data(self):
        admin = User(
            id="admin1", email="admin@test.com", username="admin", name="Admin",
            groups=["admin"], permissions=["*"], is_admin=True
        )
        data = [
            {"user_id": "user1", "content": "data1"},
            {"user_id": "user2", "content": "data2"},
            {"user_id": "user3", "content": "data3"}
        ]
        filtered = filter_viewable_data(admin, data)
        assert len(filtered) == 3
    
    def test_user_sees_only_own_data(self):
        user = User(
            id="user1", email="user@test.com", username="user1", name="User",
            groups=["researcher"], permissions=["view:own"]
        )
        data = [
            {"user_id": "user1", "content": "data1"},
            {"user_id": "user2", "content": "data2"},
            {"user_id": "user3", "content": "data3"}
        ]
        filtered = filter_viewable_data(user, data)
        assert len(filtered) == 1
        assert filtered[0]["user_id"] == "user1"
    
    def test_group_permission_sees_all_data(self):
        user = User(
            id="user1", email="user@test.com", username="user1", name="User",
            groups=["researcher"], permissions=["view:group"]
        )
        data = [
            {"user_id": "user1", "content": "data1"},
            {"user_id": "user2", "content": "data2"},
            {"user_id": "user3", "content": "data3"}
        ]
        filtered = filter_viewable_data(user, data)
        assert len(filtered) == 3


class TestRoleUtilities:
    """Test role-related utility functions"""
    
    def test_get_user_role_display(self):
        admin = User(
            id="admin1", email="admin@test.com", username="admin", name="Admin",
            groups=["admin"], permissions=["*"], is_admin=True
        )
        assert get_user_role_display(admin) == "Admin"
        
        researcher = User(
            id="researcher1", email="researcher@test.com", username="researcher", name="Researcher",
            groups=["researcher"], permissions=["submit:SOP*"]
        )
        assert get_user_role_display(researcher) == "Researcher"
        
        viewer = User(
            id="viewer1", email="viewer@test.com", username="viewer", name="Viewer",
            groups=["viewer"], permissions=["view:own"]
        )
        assert get_user_role_display(viewer) == "Viewer"
    
    def test_has_role(self):
        admin = User(
            id="admin1", email="admin@test.com", username="admin", name="Admin",
            groups=["admin"], permissions=["*"], is_admin=True
        )
        assert has_role(admin, "admin") is True
        assert has_role(admin, "researcher") is False
        
        researcher = User(
            id="researcher1", email="researcher@test.com", username="researcher", name="Researcher",
            groups=["researcher"], permissions=["submit:SOP*"]
        )
        assert has_role(researcher, "researcher") is True
        assert has_role(researcher, "admin") is False
        assert has_role(researcher, "viewer") is False


class TestPermissionIntegration:
    """Test integration scenarios with multiple permission types"""
    
    def test_researcher_full_workflow_permissions(self):
        """Test that a researcher can perform their typical workflow"""
        researcher = User(
            id="researcher1", email="researcher@test.com", username="researcher", name="Researcher",
            groups=["researcher"], permissions=["submit:SOP*", "view:own", "view:group", "draft:*"]
        )
        
        # Can create and manage drafts
        assert can_manage_drafts(researcher, "create") is True
        assert can_manage_drafts(researcher, "update") is True
        assert can_manage_drafts(researcher, "delete") is True
        
        # Can submit SOPs
        assert can_submit(researcher, "sop1") is True
        
        # Can view appropriate data
        assert can_view_data(researcher, "own") is True
        assert can_view_data(researcher, "group") is True
        assert can_view_data(researcher, "all") is False
    
    def test_viewer_read_only_access(self):
        """Test that a viewer has appropriate read-only access"""
        viewer = User(
            id="viewer1", email="viewer@test.com", username="viewer", name="Viewer",
            groups=["viewer"], permissions=["view:own", "view:group"]
        )
        
        # Cannot create or manage drafts
        assert can_manage_drafts(viewer, "create") is False
        assert can_manage_drafts(viewer, "update") is False
        
        # Cannot submit SOPs
        assert can_submit(viewer, "sop1") is False
        
        # Can view appropriate data
        assert can_view_data(viewer, "own") is True
        assert can_view_data(viewer, "group") is True
        assert can_view_data(viewer, "all") is False