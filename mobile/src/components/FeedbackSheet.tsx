/**
 * Post-first-story feedback bottom sheet.
 * Collects star ratings for 4 attributes + optional comment.
 * Shown once after the child completes their first story.
 */
import React, { useRef, useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { trackFeedbackSubmitted, FeedbackRatings } from '../utils/analytics';

const { height: SCREEN_H } = Dimensions.get('window');

const ATTRIBUTES: { key: keyof Omit<FeedbackRatings, 'overall' | 'comment'>; label: string; icon: string }[] = [
  { key: 'engagement',         label: 'Story engagement',       icon: '✨' },
  { key: 'age_appropriateness', label: 'Age appropriateness',    icon: '👶' },
  { key: 'audio_quality',      label: 'Narrator voice & audio', icon: '🎧' },
];

function StarRow({
  value,
  onChange,
  color,
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={30}
            color={star <= value ? '#f59e0b' : color}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function FeedbackSheet() {
  const { showFeedback, completeFeedback, dismissFeedback } = useOnboarding();
  const { userData } = useAuth();
  const { colors } = useTheme();

  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  const [overall, setOverall] = useState(0);
  const [engagement, setEngagement] = useState(0);
  const [ageAppropriateness, setAgeAppropriateness] = useState(0);
  const [audioQuality, setAudioQuality] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (showFeedback) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [showFeedback]);

  const canSubmit = overall > 0 && engagement > 0 && ageAppropriateness > 0 && audioQuality > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const ratings: FeedbackRatings = {
      overall,
      engagement,
      age_appropriateness: ageAppropriateness,
      audio_quality: audioQuality,
      comment: comment.trim() || undefined,
    };
    trackFeedbackSubmitted(ratings);
    await completeFeedback();
    setSubmitting(false);
  };

  const childName = userData?.name ?? 'your child';

  return (
    <Modal visible={showFeedback} transparent animationType="none">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={dismissFeedback} />
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
                {/* Handle */}
                <View style={styles.handle} />

                {/* Header */}
                <View style={styles.header}>
                  <Text style={[styles.sheetTitle, { color: colors.text }]}>
                    How was {childName}'s first story? 📖
                  </Text>
                  <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                    Your feedback helps us improve for children like {childName}.
                  </Text>
                </View>

                {/* Overall rating */}
                <View style={[styles.ratingRow, { borderBottomColor: colors.surfaceBorder }]}>
                  <Text style={[styles.ratingLabel, { color: colors.text }]}>⭐ Overall experience</Text>
                  <StarRow value={overall} onChange={setOverall} color={colors.surfaceBorder} />
                </View>

                {/* Attribute ratings */}
                {ATTRIBUTES.map((attr) => {
                  const valueMap: Record<string, number> = {
                    engagement: engagement,
                    age_appropriateness: ageAppropriateness,
                    audio_quality: audioQuality,
                  };
                  const setterMap: Record<string, (v: number) => void> = {
                    engagement: setEngagement,
                    age_appropriateness: setAgeAppropriateness,
                    audio_quality: setAudioQuality,
                  };
                  return (
                    <View key={attr.key} style={[styles.ratingRow, { borderBottomColor: colors.surfaceBorder }]}>
                      <Text style={[styles.ratingLabel, { color: colors.text }]}>
                        {attr.icon} {attr.label}
                      </Text>
                      <StarRow
                        value={valueMap[attr.key]}
                        onChange={setterMap[attr.key]}
                        color={colors.surfaceBorder}
                      />
                    </View>
                  );
                })}

                {/* Optional comment */}
                <View style={styles.commentSection}>
                  <Text style={[styles.ratingLabel, { color: colors.text }]}>
                    💬 Anything else? (optional)
                  </Text>
                  <TextInput
                    value={comment}
                    onChangeText={setComment}
                    placeholder="Tell us more..."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={3}
                    style={[
                      styles.commentInput,
                      { backgroundColor: colors.background, color: colors.text, borderColor: colors.surfaceBorder },
                    ]}
                  />
                </View>

                {/* Buttons */}
                <View style={styles.buttons}>
                  <TouchableOpacity onPress={dismissFeedback} style={styles.skipBtn}>
                    <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={!canSubmit || submitting}
                    style={[
                      styles.submitBtn,
                      { backgroundColor: canSubmit ? colors.accent : colors.surfaceBorder },
                    ]}
                  >
                    <Text style={styles.submitText}>
                      {submitting ? 'Sending...' : 'Submit feedback'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: SCREEN_H * 0.9,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  ratingRow: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 8,
  },
  ratingLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  starRow: {
    flexDirection: 'row',
    gap: 6,
  },
  commentSection: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
