// pages/_app.js
import '../styles/globals.css';
import Nav from '../components/Nav';
import Toast from '../components/Toast';
import { AuthProvider } from '../lib/auth';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Nav />
      <Component {...pageProps} />
      <Toast />
    </AuthProvider>
  );
}
