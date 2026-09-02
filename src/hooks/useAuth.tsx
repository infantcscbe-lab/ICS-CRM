import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/database';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem('local_mock_auth_user');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.session && parsed?.profile) {
          setSession(parsed.session);
          setProfile(parsed.profile);
          setLoading(false);
          return;
        }
      } catch {
        localStorage.removeItem('local_mock_auth_user');
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        loadProfile(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const isMockActive = !!localStorage.getItem('local_mock_auth_user');
      if (isMockActive) return;

      setSession(newSession);
      if (newSession) {
        (async () => {
          await loadProfile(newSession.user.id);
        })();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Profile load error:', error);
    }
    setProfile(data as Profile | null);
    setLoading(false);
  }

  async function signIn(usernameOrEmail: string, password: string) {
    const input = usernameOrEmail.trim().toLowerCase();
    
    // Check custom predefined username/password credentials
    if (input === 'admin1' && password === 'admin123') {
      const adminProfile: Profile = {
        id: '11111111-1111-1111-1111-111111111111',
        full_name: 'Admin User',
        email: 'admin1@local',
        phone: '+91 98765 43210',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      const mockSession: Session = {
        access_token: 'mock-admin-token',
        token_type: 'bearer',
        expires_in: 86400,
        refresh_token: 'mock-admin-refresh',
        user: {
          id: adminProfile.id,
          app_metadata: { role: 'admin' },
          user_metadata: { full_name: adminProfile.full_name, role: 'admin' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as Session['user'],
      };

      setSession(mockSession);
      setProfile(adminProfile);
      localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: mockSession, profile: adminProfile }));
      return { error: null };
    }

    // Check client portal demo credential
    if ((input === 'client1' || input === 'customer1' || input === 'client') && (password === 'client123' || password === 'customer123' || password === 'admin123' || password === '')) {
      // Try to bind to an existing client from DB if available
      let boundClientId = 'c1111111-1111-1111-1111-111111111111';
      let boundCompanyName = 'Tech Solutions Pvt Ltd';
      let boundClientName = 'Mr. Rajesh Kumar';
      let boundPhone = '+91 98765 00001';
      let boundEmail = 'contact@techsolutions.com';
      let boundAddress = '12 MG Road, Indiranagar, Bengaluru';

      try {
        const { data: dbClients } = await supabase.from('clients').select('*').limit(1);
        if (dbClients && dbClients.length > 0) {
          const firstClient = dbClients[0];
          boundClientId = firstClient.id;
          boundCompanyName = firstClient.company_name || firstClient.client_name;
          boundClientName = firstClient.client_name;
          boundPhone = firstClient.phone || boundPhone;
          boundEmail = firstClient.email || boundEmail;
          boundAddress = `${firstClient.address || ''}, ${firstClient.city || ''}`.trim().replace(/^,|,$/g, '');
        }
      } catch {
        // ignore
      }

      const clientProfile: Profile = {
        id: '22222222-2222-2222-2222-222222222222',
        client_id: boundClientId,
        company_name: boundCompanyName,
        full_name: boundClientName,
        email: boundEmail,
        phone: boundPhone,
        role: 'client',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: Session = {
        access_token: 'mock-client-token',
        token_type: 'bearer',
        expires_in: 86400,
        refresh_token: 'mock-client-refresh',
        user: {
          id: clientProfile.id,
          app_metadata: { role: 'client' },
          user_metadata: { full_name: clientProfile.full_name, role: 'client' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as Session['user'],
      };

      setSession(mockSession);
      setProfile(clientProfile);
      localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: mockSession, profile: clientProfile }));
      return { error: null };
    }

    // Authenticate engineers and staff directly from Supabase database profiles table
    try {
      const { data: dbProfiles } = await supabase.from('profiles').select('*');
      if (dbProfiles && dbProfiles.length > 0) {
        const found = dbProfiles.find((p) => {
          const name = (p.full_name || '').toLowerCase().trim();
          const nameNoSpace = name.replace(/\s+/g, '');
          const email = (p.email || '').toLowerCase().trim();
          const empId = (p.employee_id || '').toLowerCase().trim();
          const emailPrefix = email.split('@')[0];

          const empMatch = empId === input;
          const emailMatch = email === input || emailPrefix === input;
          const nameMatch = name === input || nameNoSpace === input;
          const passMatch = !p.password_hash || p.password_hash === password;
          return (empMatch || emailMatch || nameMatch) && passMatch;
        });

        if (found) {
          const userSession: Session = {
            access_token: `mock-token-${found.id}`,
            token_type: 'bearer',
            expires_in: 86400,
            refresh_token: `mock-refresh-${found.id}`,
            user: {
              id: found.id,
              app_metadata: { role: found.role },
              user_metadata: { full_name: found.full_name, role: found.role },
              aud: 'authenticated',
              created_at: found.created_at,
            } as unknown as Session['user'],
          };

          setSession(userSession);
          setProfile(found as Profile);
          localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: userSession, profile: found }));
          return { error: null };
        }
      }
    } catch {
      // ignore
    }

    // Authenticate client by client_code / email / phone directly from clients table
    try {
      const { data: dbClients } = await supabase.from('clients').select('*');
      if (dbClients && dbClients.length > 0) {
        const matchedClient = dbClients.find((c) => {
          const cCode = (c.client_code || '').toLowerCase().trim();
          const cEmail = (c.email || '').toLowerCase().trim();
          const cPhone = (c.phone || '').replace(/\D/g, '');
          const inputCleanPhone = input.replace(/\D/g, '');
          const cName = (c.client_name || '').toLowerCase().trim();
          const cCompany = (c.company_name || '').toLowerCase().trim();

          const codeMatch = cCode && cCode === input;
          const emailMatch = cEmail && cEmail === input;
          const phoneMatch = inputCleanPhone && cPhone && (cPhone === inputCleanPhone || cPhone.endsWith(inputCleanPhone));
          const nameMatch = cName === input || cCompany === input;

          return codeMatch || emailMatch || phoneMatch || nameMatch;
        });

        if (matchedClient) {
          const clientPortalProfile: Profile = {
            id: matchedClient.id,
            client_id: matchedClient.id,
            company_name: matchedClient.company_name || matchedClient.client_name,
            client_code: matchedClient.client_code || null,
            full_name: matchedClient.client_name,
            email: matchedClient.email || '',
            phone: matchedClient.phone || '',
            role: 'client',
            is_active: true,
            created_at: matchedClient.created_at || new Date().toISOString(),
            updated_at: matchedClient.updated_at || new Date().toISOString(),
          };

          const userSession: Session = {
            access_token: `mock-client-token-${matchedClient.id}`,
            token_type: 'bearer',
            expires_in: 86400,
            refresh_token: `mock-client-refresh-${matchedClient.id}`,
            user: {
              id: matchedClient.id,
              app_metadata: { role: 'client' },
              user_metadata: { full_name: clientPortalProfile.full_name, role: 'client' },
              aud: 'authenticated',
              created_at: clientPortalProfile.created_at,
            } as unknown as Session['user'],
          };

          setSession(userSession);
          setProfile(clientPortalProfile);
          localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: userSession, profile: clientPortalProfile }));
          return { error: null };
        }
      }
    } catch {
      // ignore
    }

    // Try standard Supabase authentication if email format entered
    const { error } = await supabase.auth.signInWithPassword({ email: input, password });
    if (error) {
      return { error: 'Invalid username or password' };
    }
    return { error: null };
  }

  async function signOut() {
    localStorage.removeItem('local_mock_auth_user');
    await supabase.auth.signOut().catch(() => {});
    setSession(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useRole(): UserRole | null {
  const { profile } = useAuth();
  return profile?.role ?? null;
}
