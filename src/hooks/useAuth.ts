import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';

import { resolveAppLogin, senhaParaAuth } from '../../shared/mensageiro-auth';
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
      signInWithEmailAndPassword(auth, resolveAppLogin(email), senhaParaAuth(password)),
    signOut: () => signOut(auth),
  };
}
