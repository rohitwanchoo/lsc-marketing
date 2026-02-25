import { LoginClient } from './LoginClient';

// Server component — reads env vars server-side, passes flags to client
export default function LoginPage() {
  const hasGoogle   = !!(process.env.GOOGLE_CLIENT_ID   && process.env.GOOGLE_CLIENT_SECRET);
  const hasLinkedIn = !!(process.env.LINKEDIN_AUTH_CLIENT_ID && process.env.LINKEDIN_AUTH_CLIENT_SECRET);
  return <LoginClient hasGoogle={hasGoogle} hasLinkedIn={hasLinkedIn} />;
}
