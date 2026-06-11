import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';

import { auth } from '../firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  return {
    user,
    loading: user === undefined,
    signIn: (email: string, password: string) =>
      signInWithEmailAndPassword(auth, email, password),
    signOut: () => signOut(auth),
  };
}
