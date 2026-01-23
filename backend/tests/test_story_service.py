"""
Unit tests for story_service.py
Tests dataclasses and prompt building logic.
"""
import pytest
from services.story_service import (
    StoryRequest,
    ChildProfile,
    StorySegment,
    StorySession,
    build_story_system_prompt,
    get_story_user_prompt,
    LENGTH_TO_SEGMENTS,
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
