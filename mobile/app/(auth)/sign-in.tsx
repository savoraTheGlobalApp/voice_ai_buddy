import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/contexts/AuthContext';
import { trackUserLogin } from '../../src/utils/analytics';
import RiveNarratorAvatar from '../../src/components/RiveNarratorAvatar';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();

  const handleSignIn = async () => {
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    setError('');
    try {
      await signIn(email, password);
      trackUserLogin();
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') setError('Invalid email or password');
      else if (err.code === 'auth/invalid-email') setError('Invalid email address');
      else setError('Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>

              {/* ── Circular hero bubble ── */}
              <LinearGradient
                colors={['#ffe8c8', '#ffd4a0', '#ffbe70']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.heroBubble}
              >
                <SafeAreaView edges={['top']} style={styles.heroInner}>
                  <RiveNarratorAvatar isSpeaking={false} isListening={false} size={SCREEN_W * 0.78} />
                  <Text style={styles.title}>YourStory</Text>
                  <Text style={styles.tagline}>Magical stories for little minds ✨</Text>
                </SafeAreaView>
              </LinearGradient>

              {/* ── Form card — sits below the bubble ── */}
              <View style={styles.formSection}>
                <View style={styles.card}>
                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <TextInput
                    style={styles.input}
                    placeholder="Parent's Email"
                    placeholderTextColor="#c4956a"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Password"
                      placeholderTextColor="#c4956a"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#c4956a" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleSignIn}
                    disabled={loading}
                  >
                    <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign In'}</Text>
                  </TouchableOpacity>

                  <Link href="/(auth)/sign-up" asChild>
                    <TouchableOpacity style={styles.linkButton}>
                      <Text style={styles.linkText}>
                        New here? <Text style={styles.linkBold}>Create an account</Text>
                      </Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>

            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff8f0' },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },

  // Large oval dome — wider than screen so sides curve, big bottom radius = circular bottom edge
  heroBubble: {
    width: SCREEN_W * 1.15,
    marginLeft: -(SCREEN_W * 0.075),
    minHeight: SCREEN_H * 0.54,
    borderBottomLeftRadius: SCREEN_W * 0.9,
    borderBottomRightRadius: SCREEN_W * 0.9,
    overflow: 'hidden',
  },
  heroInner: {
    alignItems: 'center',
    paddingBottom: 28,
    paddingTop: 4,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#7c2d12',
    letterSpacing: -0.5,
    marginTop: -12,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 15,
    color: '#92400e',
    textAlign: 'center',
  },

  // Form starts below dome with generous spacing
  formSection: {
    marginTop: 28,
    paddingBottom: 32,
  },
  card: {
    marginHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#78350f',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#fde8cc',
  },
  error: { color: '#ef4444', textAlign: 'center', marginBottom: 14, fontSize: 14 },
  input: {
    backgroundColor: '#fff8f0',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    marginBottom: 14,
    color: '#1c0a00',
    borderWidth: 1.5,
    borderColor: '#fde8cc',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff8f0',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#fde8cc',
    marginBottom: 14,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#1c0a00',
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  button: {
    backgroundColor: '#f97316',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.30,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonDisabled: { backgroundColor: '#fdba74', shadowOpacity: 0, elevation: 0 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  linkButton: { marginTop: 20, marginBottom: 4, alignItems: 'center' },
  linkText: { color: '#b45309', fontSize: 14 },
  linkBold: { color: '#f97316', fontWeight: '700' },
});
