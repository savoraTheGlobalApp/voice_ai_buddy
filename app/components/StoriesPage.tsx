'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';

// Types
interface StorySegment {
  segment_index: number;
  narrative: string;
  segment_type: string;
  discussion_question: string | null;
}

interface Story {
  session_id: string;
  title: string;
  segments: StorySegment[];
  child_name?: string;
  child_age?: number;
  status?: string;
  created_at?: string;
  request?: {
    topics: string[];
    values: string[];
    length: string;
    setting: string | null;
  };
}

interface StorySummary {
  session_id: string;
  title: string;
  child_name: string;
  topics: string[];
  status: string;
  created_at: string;
}

// API functions
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(response: Response, fallbackMessage: string) {
  if (response.status === 401) {
    throw new Error('Session expired. Please sign in again.');
  }
  if (response.status === 429) {
    const error = await response.json().catch(() => ({ detail: 'Rate limit reached' }));
    throw new Error(error.detail || 'Rate limit reached. Please try again later.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: fallbackMessage }));
    throw new Error(error.detail || fallbackMessage);
  }
}

async function generateStory(uid: string, request: {
  topics: string[];
  values: string[];
  length: string;
  setting?: string;
}): Promise<Story> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${BACKEND_URL}/api/users/${uid}/stories/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  await handleResponse(response, 'Failed to generate story');
  return response.json();
}

async function listStories(uid: string): Promise<StorySummary[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${BACKEND_URL}/api/users/${uid}/stories`, { headers });

  await handleResponse(response, 'Failed to load stories');
  const data = await response.json();
  return data.stories;
}

async function getStory(uid: string, sessionId: string): Promise<Story> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${BACKEND_URL}/api/users/${uid}/stories/${sessionId}`, { headers });

  await handleResponse(response, 'Failed to load story');
  return response.json();
}

async function updateStoryStatus(uid: string, sessionId: string, status: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${BACKEND_URL}/api/users/${uid}/stories/${sessionId}/status?status=${status}`,
    { method: 'PATCH', headers }
  );

  await handleResponse(response, 'Failed to update story status');
}

// Suggested options
const SUGGESTED_TOPICS = ['dinosaurs', 'space', 'animals', 'superheroes', 'princesses', 'robots', 'ocean', 'forest', 'magic', 'pirates'];
const SUGGESTED_VALUES = ['kindness', 'sharing', 'honesty', 'courage', 'patience', 'friendship', 'gratitude', 'respect', 'perseverance', 'empathy'];

export default function StoriesPage() {
  const { currentUser, userData, loading: authLoading } = useAuth();
  const router = useRouter();

  // View state
  const [activeView, setActiveView] = useState<'list' | 'create' | 'view'>('list');

  // Form state
  const [topics, setTopics] = useState<string[]>([]);
  const [values, setValues] = useState<string[]>([]);
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [setting, setSetting] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [valueInput, setValueInput] = useState('');

  // Story state
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);

  // Loading/error state
  const [loading, setLoading] = useState(false);
  const [loadingStories, setLoadingStories] = useState(false);
  const [error, setError] = useState('');

  // Auth protection
  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.push('/');
    }
  }, [currentUser, authLoading, router]);

  // Load stories on mount
  useEffect(() => {
    if (currentUser?.uid) {
      loadStories();
    }
  }, [currentUser?.uid]);

  const loadStories = async () => {
    if (!currentUser?.uid) return;
    setLoadingStories(true);
    try {
      const data = await listStories(currentUser.uid);
      setStories(data);
    } catch (err) {
      console.error('Failed to load stories:', err);
    } finally {
      setLoadingStories(false);
    }
  };

  const handleAddTopic = (topic: string) => {
    const trimmed = topic.trim().toLowerCase();
    if (trimmed && !topics.includes(trimmed)) {
      setTopics([...topics, trimmed]);
    }
    setTopicInput('');
  };

  const handleAddValue = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !values.includes(trimmed)) {
      setValues([...values, trimmed]);
    }
    setValueInput('');
  };

  const handleRemoveTopic = (topic: string) => {
    setTopics(topics.filter(t => t !== topic));
  };

  const handleRemoveValue = (value: string) => {
    setValues(values.filter(v => v !== value));
  };

  const handleGenerate = async () => {
    if (!currentUser?.uid) return;
    if (topics.length === 0) {
      setError('Please add at least one topic');
      return;
    }
    if (values.length === 0) {
      setError('Please add at least one value');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const story = await generateStory(currentUser.uid, {
        topics,
        values,
        length,
        setting: setting || undefined,
      });
      setCurrentStory(story);
      setCurrentSegmentIndex(0);
      setActiveView('view');
      // Refresh stories list
      loadStories();
    } catch (err: any) {
      setError(err.message || 'Failed to generate story');
    } finally {
      setLoading(false);
    }
  };

  const handleViewStory = async (sessionId: string) => {
    if (!currentUser?.uid) return;
    setLoading(true);
    setError('');

    try {
      const story = await getStory(currentUser.uid, sessionId);
      setCurrentStory(story);
      setCurrentSegmentIndex(0);
      setActiveView('view');
      // Mark as read
      try {
        await updateStoryStatus(currentUser.uid, sessionId, 'read');
        loadStories();
      } catch (e) {
        // Ignore status update errors
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load story');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async (sessionId: string, currentStatus: string) => {
    if (!currentUser?.uid) return;
    const newStatus = currentStatus === 'favorite' ? 'read' : 'favorite';
    try {
      await updateStoryStatus(currentUser.uid, sessionId, newStatus);
      loadStories();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleBack = () => {
    setActiveView('list');
    setCurrentStory(null);
    setCurrentSegmentIndex(0);
  };

  const handleNewStory = () => {
    setTopics([]);
    setValues([]);
    setLength('medium');
    setSetting('');
    setError('');
    setActiveView('create');
  };

  const handleBackToApp = () => {
    router.push('/app');
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    padding: '20px',
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    maxWidth: '600px',
    width: '100%',
    margin: '0 auto',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: '#111827',
    margin: 0,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
    color: '#111827',
    backgroundColor: 'white',
  };

  const chipContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '8px',
  };

  const chipStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    borderRadius: '16px',
    fontSize: '14px',
    fontWeight: 500,
  };

  const chipRemoveStyle: React.CSSProperties = {
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
  };

  const suggestionStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '4px 10px',
    margin: '4px',
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    borderRadius: '12px',
    fontSize: '12px',
    cursor: 'pointer',
    border: '1px solid #e5e7eb',
  };

  const primaryButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: 'white',
    backgroundColor: loading ? '#9ca3af' : '#3b82f6',
    border: 'none',
    borderRadius: '8px',
    cursor: loading ? 'not-allowed' : 'pointer',
    marginBottom: '12px',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#6b7280',
    backgroundColor: 'transparent',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
  };

  const storyCardStyle: React.CSSProperties = {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    cursor: 'pointer',
    border: '1px solid #e5e7eb',
    transition: 'box-shadow 0.2s',
  };

  const discussionBoxStyle: React.CSSProperties = {
    backgroundColor: '#fef3c7',
    border: '2px solid #f59e0b',
    borderRadius: '12px',
    padding: '16px',
    marginTop: '16px',
  };

  const segmentStyle: React.CSSProperties = {
    fontSize: '18px',
    lineHeight: 1.8,
    color: '#374151',
    marginBottom: '16px',
  };

  if (authLoading || !currentUser) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // List View
  if (activeView === 'list') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Stories</h1>
            <button
              onClick={handleBackToApp}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                color: '#6b7280',
                backgroundColor: 'transparent',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Back to App
            </button>
          </div>

          <button
            onClick={handleNewStory}
            style={{ ...primaryButtonStyle, marginBottom: '24px' }}
          >
            + Create New Story
          </button>

          {loadingStories ? (
            <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading stories...</p>
          ) : stories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ color: '#6b7280', marginBottom: '8px' }}>No stories yet</p>
              <p style={{ color: '#9ca3af', fontSize: '14px' }}>Create your first story!</p>
            </div>
          ) : (
            stories.map((story) => (
              <div
                key={story.session_id}
                style={storyCardStyle}
                onClick={() => handleViewStory(story.session_id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: '0 0 8px 0' }}>
                      {story.title}
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                      {story.topics.map((topic) => (
                        <span
                          key={topic}
                          style={{
                            padding: '2px 8px',
                            backgroundColor: '#e0e7ff',
                            color: '#3730a3',
                            borderRadius: '10px',
                            fontSize: '12px',
                          }}
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                      {new Date(story.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(story.session_id, story.status);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '20px',
                    }}
                  >
                    {story.status === 'favorite' ? '⭐' : '☆'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Create View
  if (activeView === 'create') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Create Story</h1>
          </div>

          <p style={{ color: '#6b7280', marginBottom: '24px' }}>
            Create a personalized story for {userData?.name || 'your child'}
          </p>

          {/* Topics */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Topics *</label>
            <div style={chipContainerStyle}>
              {topics.map((topic) => (
                <span key={topic} style={chipStyle}>
                  {topic}
                  <span style={chipRemoveStyle} onClick={() => handleRemoveTopic(topic)}>×</span>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  handleAddTopic(topicInput);
                }
              }}
              placeholder="Type and press Enter"
              style={inputStyle}
            />
            <div style={{ marginTop: '8px' }}>
              {SUGGESTED_TOPICS.filter(t => !topics.includes(t)).slice(0, 5).map((topic) => (
                <span
                  key={topic}
                  style={suggestionStyle}
                  onClick={() => handleAddTopic(topic)}
                >
                  + {topic}
                </span>
              ))}
            </div>
          </div>

          {/* Values */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Values to Teach *</label>
            <div style={chipContainerStyle}>
              {values.map((value) => (
                <span key={value} style={chipStyle}>
                  {value}
                  <span style={chipRemoveStyle} onClick={() => handleRemoveValue(value)}>×</span>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  handleAddValue(valueInput);
                }
              }}
              placeholder="Type and press Enter"
              style={inputStyle}
            />
            <div style={{ marginTop: '8px' }}>
              {SUGGESTED_VALUES.filter(v => !values.includes(v)).slice(0, 5).map((value) => (
                <span
                  key={value}
                  style={suggestionStyle}
                  onClick={() => handleAddValue(value)}
                >
                  + {value}
                </span>
              ))}
            </div>
          </div>

          {/* Length */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Story Length</label>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value as 'short' | 'medium' | 'long')}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="short">Short (3 segments)</option>
              <option value="medium">Medium (5 segments)</option>
              <option value="long">Long (7 segments)</option>
            </select>
          </div>

          {/* Setting */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Setting (Optional)</label>
            <input
              type="text"
              value={setting}
              onChange={(e) => setSetting(e.target.value)}
              placeholder="e.g., underwater kingdom, magical forest"
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '16px', textAlign: 'center' }}>
              {error}
            </p>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            style={primaryButtonStyle}
          >
            {loading ? 'Generating Story...' : 'Generate Story'}
          </button>

          <button
            onClick={handleBack}
            disabled={loading}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // View Story
  if (activeView === 'view' && currentStory) {
    const segment = currentStory.segments[currentSegmentIndex];
    const totalSegments = currentStory.segments.length;

    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, maxWidth: '700px' }}>
          <div style={headerStyle}>
            <button
              onClick={handleBack}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                color: '#6b7280',
                backgroundColor: 'transparent',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              ← Back
            </button>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {currentSegmentIndex + 1} / {totalSegments}
            </span>
          </div>

          <h1 style={{ ...titleStyle, textAlign: 'center', marginBottom: '8px' }}>
            {currentStory.title}
          </h1>

          <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '32px', fontSize: '14px' }}>
            {segment.segment_type.charAt(0).toUpperCase() + segment.segment_type.slice(1)}
          </p>

          <div style={segmentStyle}>
            {segment.narrative}
          </div>

          {segment.discussion_question && (
            <div style={discussionBoxStyle}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', margin: 0 }}>
                Discussion Question
              </p>
              <p style={{ fontSize: '16px', color: '#92400e', margin: '8px 0 0 0', fontWeight: 500 }}>
                {segment.discussion_question}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
            <button
              onClick={() => setCurrentSegmentIndex(Math.max(0, currentSegmentIndex - 1))}
              disabled={currentSegmentIndex === 0}
              style={{
                ...secondaryButtonStyle,
                flex: 1,
                opacity: currentSegmentIndex === 0 ? 0.5 : 1,
                cursor: currentSegmentIndex === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              ← Previous
            </button>
            <button
              onClick={() => {
                if (currentSegmentIndex < totalSegments - 1) {
                  setCurrentSegmentIndex(currentSegmentIndex + 1);
                } else {
                  handleBack();
                }
              }}
              style={{
                ...primaryButtonStyle,
                flex: 1,
                marginBottom: 0,
              }}
            >
              {currentSegmentIndex < totalSegments - 1 ? 'Next →' : 'Finish'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
