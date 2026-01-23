"""
API tests for story generation endpoints.
Tests the /api/users/{uid}/stories/generate endpoint.
Uses mocked OpenAI responses to avoid API calls during testing.
"""
import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient


# Mock OpenAI response that matches expected story structure
MOCK_STORY_RESPONSE = {
    "title": "The Dinosaur Adventure",
    "segments": [
        {
            "segment_index": 0,
            "narrative": "Once upon a time, there was a friendly dinosaur named Rex.",
            "segment_type": "opening",
            "discussion_question": None
        },
        {
            "segment_index": 1,
            "narrative": "Rex met a little bird who was lost and scared.",
            "segment_type": "middle",
            "discussion_question": "How do you think Rex can help the bird?"
        },
        {
            "segment_index": 2,
            "narrative": "Rex helped the bird find its way home. They became best friends.",
            "segment_type": "resolution",
            "discussion_question": None
        }
    ]
}


def create_mock_openai_response():
    """Create a mock httpx response that mimics OpenAI API."""
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(MOCK_STORY_RESPONSE)
                }
            }
        ]
    }
    return mock_response


@pytest.fixture
def mock_openai():
    """Fixture to mock OpenAI API calls."""
    with patch("httpx.AsyncClient") as mock_client:
        # Create async context manager mock
        mock_instance = AsyncMock()
        mock_client.return_value.__aenter__.return_value = mock_instance
        mock_instance.post.return_value = create_mock_openai_response()
        yield mock_instance


@pytest.fixture
def mock_env_api_key():
    """Fixture to mock OPENAI_API_KEY environment variable."""
    with patch.dict("os.environ", {"OPENAI_API_KEY": "test-api-key"}):
        yield


# Import app after setting up potential mocks
from main import app
client = TestClient(app)


class TestStoryGenerateEndpoint:
    """Test POST /api/users/{uid}/stories/generate endpoint."""

    def test_generate_story_success(self, mock_openai, mock_env_api_key):
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

    def test_generate_story_response_structure(self, mock_openai, mock_env_api_key):
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

    def test_generate_story_with_setting(self, mock_openai, mock_env_api_key):
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

    def test_generate_story_default_length(self, mock_openai, mock_env_api_key):
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

    def test_generate_story_empty_topics(self, mock_openai, mock_env_api_key):
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

    def test_generate_story_unique_session_ids(self, mock_openai, mock_env_api_key):
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

    def test_generate_story_different_users(self, mock_openai, mock_env_api_key):
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

    def test_generate_story_calls_openai(self, mock_openai, mock_env_api_key):
        """Test that OpenAI API is called with correct parameters."""
        response = client.post(
            "/api/users/test-user/stories/generate",
            json={
                "topics": ["dinosaurs"],
                "values": ["sharing"],
                "length": "short"
            }
        )
        assert response.status_code == 200

        # Verify OpenAI was called
        mock_openai.post.assert_called_once()

        # Check the call arguments
        call_args = mock_openai.post.call_args
        assert "https://api.openai.com/v1/chat/completions" in call_args[0]

    def test_generate_story_returns_mocked_title(self, mock_openai, mock_env_api_key):
        """Test that response contains the mocked story title."""
        response = client.post(
            "/api/users/test-user/stories/generate",
            json={
                "topics": ["dinosaurs"],
                "values": ["sharing"],
                "length": "short"
            }
        )
        assert response.status_code == 200
        data = response.json()

        # Should match our mock response
        assert data["title"] == "The Dinosaur Adventure"
        assert len(data["segments"]) == 3


class TestStoryGenerateEndpointErrors:
    """Test error handling in story generation."""

    def test_generate_story_no_api_key(self):
        """Test error when OPENAI_API_KEY is not set."""
        with patch.dict("os.environ", {}, clear=True):
            # Remove OPENAI_API_KEY from environment
            with patch("os.getenv", return_value=None):
                response = client.post(
                    "/api/users/test-user/stories/generate",
                    json={
                        "topics": ["adventure"],
                        "values": ["bravery"]
                    }
                )
                # Should get 500 error about missing API key
                assert response.status_code == 500

    def test_generate_story_openai_error(self, mock_env_api_key):
        """Test handling of OpenAI API errors."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance

            # Mock a failed response
            mock_response = MagicMock()
            mock_response.is_success = False
            mock_response.text = "API Error: Rate limit exceeded"
            mock_instance.post.return_value = mock_response

            response = client.post(
                "/api/users/test-user/stories/generate",
                json={
                    "topics": ["adventure"],
                    "values": ["bravery"]
                }
            )
            assert response.status_code == 500
            assert "Failed to generate story" in response.json()["detail"]

    def test_generate_story_invalid_json_response(self, mock_env_api_key):
        """Test handling of invalid JSON from OpenAI."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance

            # Mock a response with invalid JSON
            mock_response = MagicMock()
            mock_response.is_success = True
            mock_response.json.return_value = {
                "choices": [
                    {
                        "message": {
                            "content": "This is not valid JSON"
                        }
                    }
                ]
            }
            mock_instance.post.return_value = mock_response

            response = client.post(
                "/api/users/test-user/stories/generate",
                json={
                    "topics": ["adventure"],
                    "values": ["bravery"]
                }
            )
            assert response.status_code == 500
            assert "Failed to parse" in response.json()["detail"]


# =============================================================================
# Story Retrieval Endpoint Tests
# =============================================================================

class TestListStoriesEndpoint:
    """Test GET /api/users/{uid}/stories endpoint."""

    def test_list_stories_success(self):
        """Test listing stories with mocked Firebase."""
        with patch("main.FIREBASE_SERVICES_AVAILABLE", True):
            with patch("main.is_firebase_available", return_value=True):
                with patch("main._list_story_sessions") as mock_list:
                    mock_list.return_value = [
                        {
                            "session_id": "story-1",
                            "title": "First Story",
                            "child_name": "Emma",
                            "topics": ["dinosaurs"],
                            "status": "generated",
                            "created_at": "2024-01-01T00:00:00+00:00"
                        },
                        {
                            "session_id": "story-2",
                            "title": "Second Story",
                            "child_name": "Emma",
                            "topics": ["space"],
                            "status": "read",
                            "created_at": "2024-01-02T00:00:00+00:00"
                        }
                    ]

                    response = client.get("/api/users/test-user/stories")

                    assert response.status_code == 200
                    data = response.json()
                    assert "stories" in data
                    assert len(data["stories"]) == 2
                    assert data["stories"][0]["session_id"] == "story-1"

    def test_list_stories_with_limit(self):
        """Test listing stories with custom limit."""
        with patch("main.FIREBASE_SERVICES_AVAILABLE", True):
            with patch("main.is_firebase_available", return_value=True):
                with patch("main._list_story_sessions") as mock_list:
                    mock_list.return_value = []

                    response = client.get("/api/users/test-user/stories?limit=5")

                    assert response.status_code == 200
                    mock_list.assert_called_once_with("test-user", 5)

    def test_list_stories_firebase_unavailable(self):
        """Test listing stories when Firebase is not available."""
        with patch("main.FIREBASE_SERVICES_AVAILABLE", False):
            response = client.get("/api/users/test-user/stories")
            assert response.status_code == 503


class TestGetStoryEndpoint:
    """Test GET /api/users/{uid}/stories/{session_id} endpoint."""

    def test_get_story_success(self):
        """Test getting a specific story."""
        from services.story_service import StorySession, StoryRequest, StorySegment
        from datetime import datetime, timezone

        mock_story = StorySession(
            session_id="story-123",
            child_name="Emma",
            child_age=5,
            request=StoryRequest(topics=["dinosaurs"], values=["sharing"]),
            title="Dinosaur Adventure",
            segments=[
                StorySegment(
                    segment_index=0,
                    narrative="Once upon a time...",
                    segment_type="opening",
                    discussion_question=None
                )
            ],
            created_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            status="generated"
        )

        with patch("main.FIREBASE_SERVICES_AVAILABLE", True):
            with patch("main.is_firebase_available", return_value=True):
                with patch("main._fetch_story_session", return_value=mock_story):
                    response = client.get("/api/users/test-user/stories/story-123")

                    assert response.status_code == 200
                    data = response.json()
                    assert data["session_id"] == "story-123"
                    assert data["title"] == "Dinosaur Adventure"
                    assert data["child_name"] == "Emma"
                    assert len(data["segments"]) == 1

    def test_get_story_not_found(self):
        """Test getting a non-existent story."""
        with patch("main.FIREBASE_SERVICES_AVAILABLE", True):
            with patch("main.is_firebase_available", return_value=True):
                with patch("main._fetch_story_session", return_value=None):
                    response = client.get("/api/users/test-user/stories/nonexistent")

                    assert response.status_code == 404
                    assert "not found" in response.json()["detail"]

    def test_get_story_firebase_unavailable(self):
        """Test getting story when Firebase is not available."""
        with patch("main.FIREBASE_SERVICES_AVAILABLE", False):
            response = client.get("/api/users/test-user/stories/story-123")
            assert response.status_code == 503


class TestUpdateStoryStatusEndpoint:
    """Test PATCH /api/users/{uid}/stories/{session_id}/status endpoint."""

    def test_update_status_success(self):
        """Test updating story status to favorite."""
        with patch("main.FIREBASE_SERVICES_AVAILABLE", True):
            with patch("main.is_firebase_available", return_value=True):
                with patch("main._update_story_status") as mock_update:
                    response = client.patch(
                        "/api/users/test-user/stories/story-123/status?status=favorite"
                    )

                    assert response.status_code == 200
                    assert "favorite" in response.json()["message"]
                    mock_update.assert_called_once_with("test-user", "story-123", "favorite")

    def test_update_status_to_read(self):
        """Test updating story status to read."""
        with patch("main.FIREBASE_SERVICES_AVAILABLE", True):
            with patch("main.is_firebase_available", return_value=True):
                with patch("main._update_story_status"):
                    response = client.patch(
                        "/api/users/test-user/stories/story-123/status?status=read"
                    )

                    assert response.status_code == 200

    def test_update_status_invalid(self):
        """Test updating with invalid status."""
        with patch("main.FIREBASE_SERVICES_AVAILABLE", True):
            with patch("main.is_firebase_available", return_value=True):
                response = client.patch(
                    "/api/users/test-user/stories/story-123/status?status=invalid"
                )

                assert response.status_code == 400
                assert "must be" in response.json()["detail"]

    def test_update_status_firebase_unavailable(self):
        """Test updating status when Firebase is not available."""
        with patch("main.FIREBASE_SERVICES_AVAILABLE", False):
            response = client.patch(
                "/api/users/test-user/stories/story-123/status?status=read"
            )
            assert response.status_code == 503
