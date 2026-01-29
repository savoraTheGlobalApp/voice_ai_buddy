"""
Unit tests for story_service.py
Tests dataclasses, prompt building logic, and Firebase operations.
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
from services.story_service import (
    StoryRequest,
    ChildProfile,
    StorySegment,
    StorySession,
    build_story_system_prompt,
    get_story_user_prompt,
    LENGTH_TO_SEGMENTS,
    save_story_session,
    fetch_story_session,
    list_story_sessions,
    update_story_status,
)


class TestDataclasses:
    """Test that dataclasses are created correctly."""

    def test_story_request_with_all_fields(self):
        request = StoryRequest(
            topics=["dinosaurs", "space"],
            values=["sharing", "kindness"],
            length="short",
            setting="prehistoric jungle"
        )
        assert request.topics == ["dinosaurs", "space"]
        assert request.values == ["sharing", "kindness"]
        assert request.length == "short"
        assert request.setting == "prehistoric jungle"

    def test_story_request_defaults(self):
        request = StoryRequest(
            topics=["adventure"],
            values=["bravery"]
        )
        assert request.length == "medium"
        assert request.setting is None

    def test_child_profile(self):
        child = ChildProfile(name="Emma", age=4)
        assert child.name == "Emma"
        assert child.age == 4

    def test_story_segment(self):
        segment = StorySegment(
            segment_index=0,
            narrative="Once upon a time...",
            segment_type="opening",
            discussion_question="What do you think happens next?"
        )
        assert segment.segment_index == 0
        assert segment.narrative == "Once upon a time..."
        assert segment.segment_type == "opening"
        assert segment.discussion_question == "What do you think happens next?"

    def test_story_segment_no_question(self):
        segment = StorySegment(
            segment_index=0,
            narrative="Once upon a time...",
            segment_type="opening"
        )
        assert segment.discussion_question is None

    def test_story_session(self):
        request = StoryRequest(topics=["space"], values=["courage"])
        segment = StorySegment(
            segment_index=0,
            narrative="In a galaxy far away...",
            segment_type="opening"
        )
        session = StorySession(
            session_id="test-123",
            child_name="Emma",
            child_age=5,
            request=request,
            title="Space Adventure",
            segments=[segment]
        )
        assert session.session_id == "test-123"
        assert session.child_name == "Emma"
        assert session.status == "generated"


class TestLengthMapping:
    """Test LENGTH_TO_SEGMENTS mapping."""

    def test_short_length(self):
        assert LENGTH_TO_SEGMENTS["short"] == 3

    def test_medium_length(self):
        assert LENGTH_TO_SEGMENTS["medium"] == 5

    def test_long_length(self):
        assert LENGTH_TO_SEGMENTS["long"] == 7


class TestBuildStorySystemPrompt:
    """Test the prompt building function."""

    def test_prompt_contains_child_name(self):
        child = ChildProfile(name="Emma", age=4)
        request = StoryRequest(topics=["dinosaurs"], values=["sharing"])
        prompt = build_story_system_prompt(child, request)
        assert "Emma" in prompt

    def test_prompt_contains_child_age(self):
        child = ChildProfile(name="Emma", age=4)
        request = StoryRequest(topics=["dinosaurs"], values=["sharing"])
        prompt = build_story_system_prompt(child, request)
        assert "4" in prompt

    def test_prompt_contains_topics(self):
        child = ChildProfile(name="Emma", age=4)
        request = StoryRequest(topics=["dinosaurs", "robots"], values=["sharing"])
        prompt = build_story_system_prompt(child, request)
        assert "dinosaurs" in prompt
        assert "robots" in prompt

    def test_prompt_contains_values(self):
        child = ChildProfile(name="Emma", age=4)
        request = StoryRequest(topics=["adventure"], values=["sharing", "kindness"])
        prompt = build_story_system_prompt(child, request)
        assert "sharing" in prompt
        assert "kindness" in prompt

    def test_prompt_contains_setting(self):
        child = ChildProfile(name="Emma", age=4)
        request = StoryRequest(
            topics=["adventure"],
            values=["bravery"],
            setting="underwater kingdom"
        )
        prompt = build_story_system_prompt(child, request)
        assert "underwater kingdom" in prompt

    def test_prompt_default_setting(self):
        child = ChildProfile(name="Emma", age=4)
        request = StoryRequest(topics=["adventure"], values=["bravery"])
        prompt = build_story_system_prompt(child, request)
        assert "magical world" in prompt

    def test_prompt_segment_count_short(self):
        child = ChildProfile(name="Emma", age=4)
        request = StoryRequest(topics=["adventure"], values=["bravery"], length="short")
        prompt = build_story_system_prompt(child, request)
        assert "3 segments" in prompt

    def test_prompt_segment_count_long(self):
        child = ChildProfile(name="Emma", age=4)
        request = StoryRequest(topics=["adventure"], values=["bravery"], length="long")
        prompt = build_story_system_prompt(child, request)
        assert "7 segments" in prompt

    def test_prompt_contains_json_format(self):
        child = ChildProfile(name="Emma", age=4)
        request = StoryRequest(topics=["adventure"], values=["bravery"])
        prompt = build_story_system_prompt(child, request)
        assert "JSON" in prompt
        assert "segment_index" in prompt
        assert "narrative" in prompt

    def test_prompt_age_appropriate_young_child(self):
        child = ChildProfile(name="Emma", age=3)
        request = StoryRequest(topics=["adventure"], values=["bravery"])
        prompt = build_story_system_prompt(child, request)
        assert "simple words" in prompt

    def test_prompt_age_appropriate_older_child(self):
        child = ChildProfile(name="Emma", age=9)
        request = StoryRequest(topics=["adventure"], values=["bravery"])
        prompt = build_story_system_prompt(child, request)
        assert "richer vocabulary" in prompt


class TestGetStoryUserPrompt:
    """Test the user prompt function."""

    def test_user_prompt_exists(self):
        prompt = get_story_user_prompt()
        assert len(prompt) > 0

    def test_user_prompt_mentions_json(self):
        prompt = get_story_user_prompt()
        assert "JSON" in prompt


# =============================================================================
# Firebase Storage Tests (Mocked)
# =============================================================================

class TestSaveStorySession:
    """Test save_story_session function with mocked Firebase."""

    @patch("services.story_service.get_db")
    def test_save_story_session_success(self, mock_get_db):
        """Test saving a story session to Firebase."""
        # Setup mock
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        mock_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_ref

        # Create test data
        segments = [
            StorySegment(
                segment_index=0,
                narrative="Once upon a time...",
                segment_type="opening",
                discussion_question=None
            )
        ]
        request = StoryRequest(topics=["dinosaurs"], values=["sharing"])

        # Call function
        save_story_session(
            uid="test-user",
            session_id="story-123",
            title="Test Story",
            segments=segments,
            request=request,
            child_name="Emma",
            child_age=5
        )

        # Verify Firebase was called
        mock_ref.set.assert_called_once()
        call_args = mock_ref.set.call_args[0][0]
        assert call_args["sessionId"] == "story-123"
        assert call_args["title"] == "Test Story"
        assert call_args["childName"] == "Emma"
        assert call_args["childAge"] == 5
        assert len(call_args["segments"]) == 1

    @patch("services.story_service.get_db")
    def test_save_story_session_with_multiple_segments(self, mock_get_db):
        """Test saving a story with multiple segments."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        mock_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_ref

        segments = [
            StorySegment(segment_index=0, narrative="Opening...", segment_type="opening"),
            StorySegment(segment_index=1, narrative="Middle...", segment_type="middle", discussion_question="What next?"),
            StorySegment(segment_index=2, narrative="End...", segment_type="resolution"),
        ]
        request = StoryRequest(topics=["space"], values=["courage"], length="short")

        save_story_session(
            uid="test-user",
            session_id="story-456",
            title="Space Adventure",
            segments=segments,
            request=request,
            child_name="Alex",
            child_age=7
        )

        call_args = mock_ref.set.call_args[0][0]
        assert len(call_args["segments"]) == 3
        assert call_args["segments"][1]["discussionQuestion"] == "What next?"


class TestFetchStorySession:
    """Test fetch_story_session function with mocked Firebase."""

    @patch("services.story_service.get_db")
    def test_fetch_story_session_exists(self, mock_get_db):
        """Test fetching an existing story session."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        # Create mock document
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "sessionId": "story-123",
            "title": "Test Story",
            "childName": "Emma",
            "childAge": 5,
            "request": {
                "topics": ["dinosaurs"],
                "values": ["sharing"],
                "length": "short",
                "setting": None
            },
            "segments": [
                {
                    "segmentIndex": 0,
                    "narrative": "Once upon a time...",
                    "segmentType": "opening",
                    "discussionQuestion": None
                }
            ],
            "status": "generated",
            "createdAt": MagicMock(timestamp=lambda: 1700000000.0)
        }
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value = mock_doc

        # Call function
        result = fetch_story_session("test-user", "story-123")

        # Verify result
        assert result is not None
        assert result.session_id == "story-123"
        assert result.title == "Test Story"
        assert result.child_name == "Emma"
        assert result.child_age == 5
        assert len(result.segments) == 1
        assert result.segments[0].narrative == "Once upon a time..."

    @patch("services.story_service.get_db")
    def test_fetch_story_session_not_found(self, mock_get_db):
        """Test fetching a non-existent story session."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        mock_doc = MagicMock()
        mock_doc.exists = False
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value = mock_doc

        result = fetch_story_session("test-user", "nonexistent")

        assert result is None


class TestListStorySessions:
    """Test list_story_sessions function with mocked Firebase."""

    @patch("services.story_service.get_db")
    def test_list_story_sessions_success(self, mock_get_db):
        """Test listing story sessions."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        # Create mock documents
        mock_doc1 = MagicMock()
        mock_doc1.id = "story-1"
        mock_doc1.to_dict.return_value = {
            "title": "First Story",
            "childName": "Emma",
            "request": {"topics": ["dinosaurs"]},
            "status": "generated",
            "createdAt": MagicMock(timestamp=lambda: 1700000000.0)
        }

        mock_doc2 = MagicMock()
        mock_doc2.id = "story-2"
        mock_doc2.to_dict.return_value = {
            "title": "Second Story",
            "childName": "Emma",
            "request": {"topics": ["space"]},
            "status": "read",
            "createdAt": MagicMock(timestamp=lambda: 1700001000.0)
        }

        mock_query = MagicMock()
        mock_query.stream.return_value = [mock_doc1, mock_doc2]
        mock_db.collection.return_value.document.return_value.collection.return_value.order_by.return_value.limit.return_value = mock_query

        # Call function
        result = list_story_sessions("test-user", limit=10)

        # Verify result
        assert len(result) == 2
        assert result[0]["session_id"] == "story-1"
        assert result[0]["title"] == "First Story"
        assert result[1]["session_id"] == "story-2"
        assert result[1]["status"] == "read"

    @patch("services.story_service.get_db")
    def test_list_story_sessions_empty(self, mock_get_db):
        """Test listing when no stories exist."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        mock_query = MagicMock()
        mock_query.stream.return_value = []
        mock_db.collection.return_value.document.return_value.collection.return_value.order_by.return_value.limit.return_value = mock_query

        result = list_story_sessions("test-user")

        assert result == []


class TestUpdateStoryStatus:
    """Test update_story_status function with mocked Firebase."""

    @patch("services.story_service.get_db")
    def test_update_story_status_success(self, mock_get_db):
        """Test updating story status."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        mock_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_ref

        update_story_status("test-user", "story-123", "favorite")

        mock_ref.update.assert_called_once()
        call_args = mock_ref.update.call_args[0][0]
        assert call_args["status"] == "favorite"

    def test_update_story_status_invalid(self):
        """Test updating with invalid status."""
        with pytest.raises(ValueError, match="Invalid status"):
            update_story_status("test-user", "story-123", "invalid_status")
