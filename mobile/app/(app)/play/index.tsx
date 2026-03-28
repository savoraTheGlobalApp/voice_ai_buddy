import { Redirect } from 'expo-router';

// Legacy play screen — replaced by Balu tab (F06).
// Redirect so Android back-stack never lands here.
export default function PlayRedirect() {
  return <Redirect href="/(app)/balu" />;
}
