import { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/contexts/AuthContext';
import { trackUserSignedUp } from '../../src/utils/analytics';
import RiveNarratorAvatar from '../../src/components/RiveNarratorAvatar';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function SignUp() {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { signUp } = useAuth();

  const handleSignUp = async () => {
    if (!name || !age || !email || !password) { setError('Please fill in all fields'); return; }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 3 || ageNum > 10) { setError('Age must be between 3 and 10'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');
    try {
      await signUp(name, ageNum, email, password);
      trackUserSignedUp(name, ageNum);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') setError('This email is already registered');
      else if (err.code === 'auth/weak-password') setError('Password is too weak');
      else if (err.code === 'auth/invalid-email') setError('Invalid email address');
      else setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0} style={styles.flex}>
        <ScrollView
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
                  <RiveNarratorAvatar isSpeaking={false} isListening={false} size={SCREEN_W * 0.62} />
                  <Text style={styles.title}>YourStory</Text>
                  <Text style={styles.tagline}>Begin your child's story journey 📖</Text>
                </SafeAreaView>
              </LinearGradient>

              {/* ── Form card — sits below the bubble ── */}
              <View style={styles.formSection}>
                <View style={styles.card}>
                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <TextInput
                    style={styles.input}
                    placeholder="Child's Name"
                    placeholderTextColor="#c4956a"
                    value={name}
                    onChangeText={setName}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Child's Age (3–10)"
                    placeholderTextColor="#c4956a"
                    value={age}
                    onChangeText={setAge}
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Parent's Email"
                    placeholderTextColor="#c4956a"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Password (min 6 characters)"
                    placeholderTextColor="#c4956a"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />

                  <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleSignUp}
                    disabled={loading}
                  >
                    <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
                  </TouchableOpacity>

                  <Link href="/(auth)/sign-in" asChild>
                    <TouchableOpacity style={styles.linkButton}>
                      <Text style={styles.linkText}>
                        Already have an account? <Text style={styles.linkBold}>Sign In</Text>
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

  heroBubble: {
    width: SCREEN_W * 1.15,
    marginLeft: -(SCREEN_W * 0.075),
    minHeight: SCREEN_H * 0.42,
    borderBottomLeftRadius: SCREEN_W * 0.9,
    borderBottomRightRadius: SCREEN_W * 0.9,
    overflow: 'hidden',
  },
  heroInner: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingTop: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#7c2d12',
    letterSpacing: -0.5,
    marginTop: -8,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
  },

  formSection: {
    marginTop: 24,
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
    padding: 15,
    fontSize: 16,
    marginBottom: 12,
    color: '#1c0a00',
    borderWidth: 1.5,
    borderColor: '#fde8cc',
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
  linkButton: { marginTop: 18, marginBottom: 4, alignItems: 'center' },
  linkText: { color: '#b45309', fontSize: 14 },
  linkBold: { color: '#f97316', fontWeight: '700' },
});
