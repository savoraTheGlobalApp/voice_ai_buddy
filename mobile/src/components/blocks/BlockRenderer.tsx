import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import {
  ContentBlock,
  isTextBlock,
  isHookBlock,
  isStoryBodyBlock,
  isReflectionBlock,
  isBlessingBlock,
  isQuizBlock,
} from '../../types/stories';

import { TextBlockComponent } from './TextBlock';
import { HookBlockComponent } from './HookBlock';
import { StoryBodyBlockComponent } from './StoryBodyBlock';
import { ReflectionBlockComponent } from './ReflectionBlock';
import { BlessingBlockComponent } from './BlessingBlock';
import { DiscussionBlockComponent } from './DiscussionBlock';
import { QuizBlockComponent } from './QuizBlock';
import { DividerBlockComponent } from './DividerBlock';
import { CharacterIntroBlockComponent } from './CharacterIntroBlock';
import { ValueHighlightBlockComponent } from './ValueHighlightBlock';
import { UnknownBlockComponent } from './UnknownBlock';

interface BlockRendererProps {
  block: ContentBlock;
  language: 'en' | 'hi';
  onQuizAnswer?: (blockId: string, isCorrect: boolean) => void;
  fadeAnim?: Animated.Value;
}

export function BlockRenderer({
  block,
  language,
  onQuizAnswer,
  fadeAnim,
}: BlockRendererProps) {
  const renderBlock = () => {
    switch (block.type) {
      case 'text':
        if (isTextBlock(block)) {
          return <TextBlockComponent block={block} language={language} />;
        }
        break;

      case 'hook':
        if (isHookBlock(block)) {
          return <HookBlockComponent block={block} language={language} />;
        }
        break;

      case 'story_body':
        if (isStoryBodyBlock(block)) {
          return <StoryBodyBlockComponent block={block} language={language} />;
        }
        break;

      case 'reflection':
        if (isReflectionBlock(block)) {
          return <ReflectionBlockComponent block={block} language={language} />;
        }
        break;

      case 'blessing':
        if (isBlessingBlock(block)) {
          return <BlessingBlockComponent block={block} language={language} />;
        }
        break;

      case 'discussion':
        return <DiscussionBlockComponent block={block as any} language={language} />;

      case 'quiz':
        if (isQuizBlock(block)) {
          return (
            <QuizBlockComponent
              block={block}
              language={language}
              onAnswer={(isCorrect) => onQuizAnswer?.(block.id, isCorrect)}
            />
          );
        }
        break;

      case 'divider':
        return <DividerBlockComponent block={block as any} />;

      case 'character_intro':
        return <CharacterIntroBlockComponent block={block as any} language={language} />;

      case 'value_highlight':
        return <ValueHighlightBlockComponent block={block as any} language={language} />;

      case 'audio':
        // Audio block - placeholder for future implementation
        return null;

      case 'image':
        // Image block - placeholder for future implementation
        return null;

      default:
        return <UnknownBlockComponent block={block} />;
    }

    return <UnknownBlockComponent block={block} />;
  };

  const content = renderBlock();

  if (!content) return null;

  if (fadeAnim) {
    return (
      <Animated.View style={[styles.blockContainer, { opacity: fadeAnim }]}>
        {content}
      </Animated.View>
    );
  }

  return <View style={styles.blockContainer}>{content}</View>;
}

const styles = StyleSheet.create({
  blockContainer: {
    marginHorizontal: 4,
  },
});
