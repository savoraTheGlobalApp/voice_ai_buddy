"""
API tests for story generation endpoints.
Tests the /api/users/{uid}/stories/generate endpoint.
"""
import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


class TestStoryGenerateEndpoint:
    """Test POST /api/users/{uid}/stories/generate endpoint."""

    def test_generate_story_success(self):
        """Test successful story generation with valid request."""
        response = client.post(
            "/api/users/test-user/stories/generate",
            json={
                "topics": ["dinosaurs", "space"],
                "values": ["sharing", "bravery"],
                "length": "short"
            }
        )
        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "session_id" in data
        assert "title" in data
        assert "segments" in data

        # Check session_id format
        assert data["session_id"].startswith("story-")

        # Check segments exist
        assert len(data["segments"]) > 0

    def test_generate_story_response_structure(self):
        """Test that response has correct segment structure."""
        response = client.post(
            "/api/users/test-user/stories/generate",
            json={
                "topics": ["adventure"],
                "values": ["kindness"],
                "length": "short"
            }
        )
        assert response.status_code == 200
        data = response.json()

        # Check each segment has required fields
        for segment in data["segments"]:
            assert "segment_index" in segment
            assert "narrative" in segment
            assert "segment_type" in segment
            assert "discussion_question" in segment  # Can be null

    def test_generate_story_with_setting(self):
        """Test story generation with optional setting."""
        response = client.post(
            "/api/users/test-user/stories/generate",
            json={
                "topics": ["pirates"],
                "values": ["teamwork"],
                "length": "medium",
                "setting": "tropical island"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data

    def test_generate_story_default_length(self):
        """Test that length defaults to medium."""
        response = client.post(
            "/api/users/test-user/stories/generate",
            json={
                "topics": ["robots"],
                "values": ["honesty"]
            }
        )
        assert response.status_code == 200

    def test_generate_story_missing_topics(self):
        """Test validation error when topics missing."""
        response = client.post(
            "/api/users/test-user/stories/generate",
            json={
                "values": ["kindness"]
            }
        )
        assert response.status_code == 422  # Validation error

    def test_generate_story_missing_values(self):
        """Test validation error when values missing."""
        response = client.post(
            "/api/users/test-user/stories/generate",
            json={
                "topics": ["adventure"]
            }
        )
        assert response.status_code == 422  # Validation error

    def test_generate_story_empty_topics(self):
        """Test with empty topics list."""
        response = client.post(
            "/api/users/test-user/stories/generate",
            json={
                "topics": [],
                "values": ["kindness"]
            }
        )
        # Empty list is valid, will use defaults
        assert response.status_code == 200

    def test_generate_story_unique_session_ids(self):
        """Test that each generation creates unique session_id."""
        response1 = client.post(
            "/api/users/test-user/stories/generate",
            json={"topics": ["space"], "values": ["courage"]}
        )
        response2 = client.post(
            "/api/users/test-user/stories/generate",
            json={"topics": ["space"], "values": ["courage"]}
        )

        assert response1.status_code == 200
        assert response2.status_code == 200

        id1 = response1.json()["session_id"]
        id2 = response2.json()["session_id"]
        assert id1 != id2

    def test_generate_story_different_users(self):
        """Test story generation works for different user IDs."""
        response1 = client.post(
            "/api/users/user-abc/stories/generate",
            json={"topics": ["adventure"], "values": ["bravery"]}
        )
        response2 = client.post(
            "/api/users/user-xyz/stories/generate",
            json={"topics": ["adventure"], "values": ["bravery"]}
        )

        assert response1.status_code == 200
        assert response2.status_code == 200
