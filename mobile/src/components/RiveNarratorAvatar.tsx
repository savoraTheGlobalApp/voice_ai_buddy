/**
 * RiveNarratorAvatar
 *
 * Drives the "Wave, Hear and Talk" Rive character via its state machine.
 * Place the exported .riv file at:  mobile/assets/narrator_avatar.riv
 *
 * Expected state machine name : "State Machine 1"   (update STATE_MACHINE if different)
 * Expected boolean inputs:
 *   "Talk" — true while Balu/narrator is speaking
 *   "Hear" — true while listening to the child (user-speaking)
 *   (idle is the default when both are false)
 *
 * Open the .riv in rive.app editor → State Machine tab to confirm exact names,
 * then update the constants below if needed.
 */
import { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Rive, { RiveRef, Fit, Alignment } from 'rive-react-native';

// ── Confirmed from Rive editor (Wave, Hear and Talk) ─────────────────────────
const RIV_RESOURCE   = 'narrator_avatar';   // assets/narrator_avatar.riv
const STATE_MACHINE  = 'State Machine 1';
const INPUT_TALKING  = 'Talk';              // boolean
const INPUT_HEARING  = 'Hear';              // boolean
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  isSpeaking  : boolean;
  isListening : boolean;   // true when child/user is speaking (drives Hear input)
  size        : number;
  blockType?  : string;    // kept for API compatibility, not used by Rive directly
}

export default function RiveNarratorAvatar({ isSpeaking, isListening, size }: Props) {
  const riveRef = useRef<RiveRef>(null);

  // Drive state machine inputs whenever speaking/listening state changes
  useEffect(() => {
    try {
      riveRef.current?.setInputState(STATE_MACHINE, INPUT_TALKING, isSpeaking);
    } catch (_) {}
  }, [isSpeaking]);

  useEffect(() => {
    try {
      riveRef.current?.setInputState(STATE_MACHINE, INPUT_HEARING, isListening && !isSpeaking);
    } catch (_) {}
  }, [isListening, isSpeaking]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Rive
        ref={riveRef}
        resourceName={RIV_RESOURCE}
        stateMachineName={STATE_MACHINE}
        fit={Fit.Contain}
        alignment={Alignment.Center}
        style={StyleSheet.absoluteFill}
        onError={(err) => console.warn('[RiveAvatar] error:', err)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
