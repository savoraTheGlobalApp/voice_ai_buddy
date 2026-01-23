"""
Story generation service.
Handles story creation, prompt building, and story session management.
"""
import logging
from typing import List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
from firebase_admin import firestore

from .firebase_service import get_db

logger = logging.getLogger(__name__)


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class StoryRequest:
    """Parent's input for story generation."""
    topics: List[str]                    # e.g., ["dinosaurs", "space"]
    values: List[str]                    # e.g., ["sharing", "kindness"]
    length: str = "medium"               # "short" | "medium" | "long"
    setting: Optional[str] = None        # e.g., "forest", "underwater"


@dataclass
class ChildProfile:
    """Child's basic information from Firebase UserData."""
    name: str
    age: int


@dataclass
class StorySegment:
    """One segment of the generated story."""
    segment_index: int
    narrative: str
    segment_type: str                    # "opening" | "middle" | "climax" | "resolution"
    discussion_question: Optional[str] = None


@dataclass
class StorySession:
    """Complete story session for persistence."""
    session_id: str
    child_name: str
    child_age: int
    request: StoryRequest
    title: str
    segments: List[StorySegment]
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "generated"            # "generated" | "read" | "favorite"


# =============================================================================
# Constants
# =============================================================================

LENGTH_TO_SEGMENTS = {
    "short": 3,
    "medium": 5,
    "long": 7,
}


# =============================================================================
# Prompt Building
# =============================================================================

def build_story_system_prompt(child: ChildProfile, request: StoryRequest) -> str:
    """
    Build the system prompt for OpenAI to generate a personalized story.

    Args:
        child: Child's profile (name, age)
        request: Parent's story request (topics, values, etc.)

    Returns:
        System prompt string for the LLM
    """
    num_segments = LENGTH_TO_SEGMENTS.get(request.length, 5)

    # Build topics string
    topics_str = ", ".join(request.topics) if request.topics else "adventure"

    # Build values string
    values_str = ", ".join(request.values) if request.values else "kindness"

    # Build setting string
    setting_str = request.setting if request.setting else "a magical world"

    prompt = f"""You are a children's story generator creating personalized, interactive stories for parents to read aloud to their children.

## Child Information
- Name: {child.name}
- Age: {child.age} years old

## Story Requirements
- Topics/Themes: {topics_str}
- Values to Teach: {values_str}
- Setting: {setting_str}
- Number of Segments: {num_segments}

## Story Structure
Create a story with exactly {num_segments} segments following this structure:
- Segment 1: "opening" - Introduce {child.name} and the setting, hook the listener
- Segments 2-{num_segments - 1}: "middle" - Build the adventure, introduce challenges related to the values
- Final segment: "resolution" - Conclude with {child.name} learning or demonstrating the values

## Age-Appropriate Guidelines (Age {child.age})
{"- Use simple words and short sentences" if child.age <= 4 else ""}
{"- Keep concepts concrete and relatable" if child.age <= 4 else ""}
{"- Include repetition and rhythm" if child.age <= 4 else ""}
{"- Use slightly more complex vocabulary" if 5 <= child.age <= 7 else ""}
{"- Include simple cause-and-effect" if 5 <= child.age <= 7 else ""}
{"- Can include mild suspense" if 5 <= child.age <= 7 else ""}
{"- Can use richer vocabulary and longer sentences" if child.age >= 8 else ""}
{"- Can include more complex themes and character development" if child.age >= 8 else ""}

## Discussion Questions
Include a discussion question in 2-3 segments (not all). These should:
- Be open-ended (not yes/no)
- Relate to the values being taught
- Be appropriate for a {child.age}-year-old
- Help the parent engage the child in the story

## Output Format
Respond with valid JSON in this exact format:
{{
    "title": "Story title here",
    "segments": [
        {{
            "segment_index": 0,
            "narrative": "The story text for the parent to read aloud...",
            "segment_type": "opening",
            "discussion_question": null
        }},
        {{
            "segment_index": 1,
            "narrative": "More story text...",
            "segment_type": "middle",
            "discussion_question": "What do you think will happen next?"
        }}
    ]
}}

## Important Notes
- Make {child.name} the main character or a central figure
- Keep each segment 3-5 sentences for younger children, 5-8 for older
- The narrative should flow naturally when read aloud
- Weave the values naturally into the story, don't be preachy
- Make it engaging and fun!
"""

    return prompt


def get_story_user_prompt() -> str:
    """
    Get the user prompt to send alongside the system prompt.

    Returns:
        User prompt string
    """
    return "Generate the story now. Respond only with the JSON, no additional text."


# =============================================================================
# Firebase Storage Functions
# =============================================================================

def save_story_session(
    uid: str,
    session_id: str,
    title: str,
    segments: List[StorySegment],
    request: StoryRequest,
    child_name: str,
    child_age: int
) -> None:
    """
    Save a generated story session to Firebase.

    Args:
        uid: Firebase user ID
        session_id: Unique story session ID
        title: Story title
        segments: List of story segments
        request: Original story request
        child_name: Child's name
        child_age: Child's age
    """
    db = get_db()
    ref = db.collection("users").document(uid).collection("stories").document(session_id)

    try:
        ref.set({
            "sessionId": session_id,
            "title": title,
            "childName": child_name,
            "childAge": child_age,
            "request": {
                "topics": request.topics,
                "values": request.values,
                "length": request.length,
                "setting": request.setting
            },
            "segments": [
                {
                    "segmentIndex": seg.segment_index,
                    "narrative": seg.narrative,
                    "segmentType": seg.segment_type,
                    "discussionQuestion": seg.discussion_question
                }
                for seg in segments
            ],
            "status": "generated",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        logger.info(f"Saved story session: {session_id} for user {uid}")
    except Exception as e:
        logger.error(f"Failed to save story session {session_id}: {e}")
        raise


def fetch_story_session(uid: str, session_id: str) -> Optional[StorySession]:
    """
    Fetch a specific story session from Firebase.

    Args:
        uid: Firebase user ID
        session_id: Story session ID

    Returns:
        StorySession object or None if not found
    """
    db = get_db()
    ref = db.collection("users").document(uid).collection("stories").document(session_id)

    try:
        doc_snap = ref.get()
        if not doc_snap.exists:
            return None

        data = doc_snap.to_dict()
        if not data:
            return None

        # Parse request
        request_data = data.get("request", {})
        request = StoryRequest(
            topics=request_data.get("topics", []),
            values=request_data.get("values", []),
            length=request_data.get("length", "medium"),
            setting=request_data.get("setting")
        )

        # Parse segments
        segments = [
            StorySegment(
                segment_index=seg.get("segmentIndex", idx),
                narrative=seg.get("narrative", ""),
                segment_type=seg.get("segmentType", "middle"),
                discussion_question=seg.get("discussionQuestion")
            )
            for idx, seg in enumerate(data.get("segments", []))
        ]

        # Parse created_at
        created_at = data.get("createdAt")
        if hasattr(created_at, "timestamp"):
            created_at_dt = datetime.fromtimestamp(created_at.timestamp(), tz=timezone.utc)
        else:
            created_at_dt = datetime.now(timezone.utc)

        return StorySession(
            session_id=data.get("sessionId", session_id),
            child_name=data.get("childName", ""),
            child_age=data.get("childAge", 0),
            request=request,
            title=data.get("title", ""),
            segments=segments,
            created_at=created_at_dt,
            status=data.get("status", "generated")
        )
    except Exception as e:
        logger.error(f"Failed to fetch story session {session_id}: {e}")
        raise


def list_story_sessions(uid: str, limit: int = 20) -> List[dict]:
    """
    List story sessions for a user, ordered by creation date (newest first).

    Args:
        uid: Firebase user ID
        limit: Maximum number of stories to return

    Returns:
        List of story summary dicts with id, title, createdAt, status
    """
    db = get_db()
    stories_ref = db.collection("users").document(uid).collection("stories")

    try:
        # Query stories ordered by createdAt descending
        query = stories_ref.order_by("createdAt", direction=firestore.Query.DESCENDING).limit(limit)
        docs = query.stream()

        stories = []
        for doc_snap in docs:
            data = doc_snap.to_dict()
            if not data:
                continue

            # Parse created_at for response
            created_at = data.get("createdAt")
            if hasattr(created_at, "isoformat"):
                created_at_str = created_at.isoformat()
            elif hasattr(created_at, "timestamp"):
                created_at_str = datetime.fromtimestamp(
                    created_at.timestamp(), tz=timezone.utc
                ).isoformat()
            else:
                created_at_str = None

            stories.append({
                "session_id": doc_snap.id,
                "title": data.get("title", "Untitled Story"),
                "child_name": data.get("childName", ""),
                "topics": data.get("request", {}).get("topics", []),
                "status": data.get("status", "generated"),
                "created_at": created_at_str
            })

        return stories
    except Exception as e:
        logger.error(f"Failed to list story sessions for {uid}: {e}")
        raise


def update_story_status(uid: str, session_id: str, status: str) -> None:
    """
    Update the status of a story session.

    Args:
        uid: Firebase user ID
        session_id: Story session ID
        status: New status ("generated", "read", "favorite")
    """
    if status not in ("generated", "read", "favorite"):
        raise ValueError(f"Invalid status: {status}")

    db = get_db()
    ref = db.collection("users").document(uid).collection("stories").document(session_id)

    try:
        ref.update({
            "status": status,
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        logger.info(f"Updated story {session_id} status to {status}")
    except Exception as e:
        logger.error(f"Failed to update story status {session_id}: {e}")
        raise
