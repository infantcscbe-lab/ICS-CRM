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

          // Asynchronously refresh latest profile from Supabase database
          if (parsed.profile.id) {
            supabase
              .from('profiles')
              .select('*')
              .eq('id', parsed.profile.id)
              .maybeSingle()
              .then(
                ({ data }) => {
                  if (data) {
                    const updatedProfile = data as Profile;
                    if (
                      parsed.profile.role === 'service_coordinator' ||
                      ['ICSEC012', 'ICSEC013'].includes((updatedProfile.employee_id || '').toUpperCase())
                    ) {
                      updatedProfile.role = 'service_coordinator';
                    }
                    updatedProfile.branch = updatedProfile.branch || parsed.profile.branch || 'cbe';
                    setProfile(updatedProfile);
                    localStorage.setItem(
                      'local_mock_auth_user',
                      JSON.stringify({ session: parsed.session, profile: updatedProfile })
                    );
                  }
                },
                () => {}
              );
          }
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
    }).catch(() => {
      setLoading(false);
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
    const isMasterPassword = password === 'ICS@2026' || password.toLowerCase() === 'ics@2026';
    
    // 1. Admin: Vimala (emp id: ICSEC008)
    if (
      (input === 'icsec008' || input === 'vimala' || input === 'vimala@ics-crm.com' || input === 'vimala@ics.com') &&
      (isMasterPassword || password === 'admin123')
    ) {
      const vimalaProfile: Profile = {
        id: 'a1000000-0000-0000-0000-000000000008',
        full_name: 'Vimala',
        employee_id: 'ICSEC008',
        email: 'vimala@ics-crm.com',
        phone: '+91 98400 00008',
        role: 'admin',
        branch: 'cbe',
        designation: 'Administrator',
        department: 'Management',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: Session = {
        access_token: 'mock-vimala-token',
        token_type: 'bearer',
        expires_in: 86400,
        refresh_token: 'mock-vimala-refresh',
        user: {
          id: vimalaProfile.id,
          app_metadata: { role: 'admin' },
          user_metadata: { full_name: vimalaProfile.full_name, role: 'admin' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as Session['user'],
      };

      setSession(mockSession);
      setProfile(vimalaProfile);
      localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: mockSession, profile: vimalaProfile }));
      return { error: null };
    }

    // 2. Service Co-ordinator: Jancirani (emp id: ICSEC012)
    if (
      (input === 'icsec012' || input === 'jancirani' || input === 'jancirani@ics-crm.com' || input === 'jancirani@ics.com') &&
      (isMasterPassword || password === 'admin123')
    ) {
      const janciraniProfile: Profile = {
        id: 'a1000000-0000-0000-0000-000000000012',
        full_name: 'Jancirani',
        employee_id: 'ICSEC012',
        email: 'jancirani@ics-crm.com',
        phone: '+91 98400 00012',
        role: 'service_coordinator',
        branch: 'cbe',
        designation: 'Service Co-ordinator',
        department: 'Service Coordination',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: Session = {
        access_token: 'mock-jancirani-token',
        token_type: 'bearer',
        expires_in: 86400,
        refresh_token: 'mock-jancirani-refresh',
        user: {
          id: janciraniProfile.id,
          app_metadata: { role: 'service_coordinator' },
          user_metadata: { full_name: janciraniProfile.full_name, role: 'service_coordinator' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as Session['user'],
      };

      setSession(mockSession);
      setProfile(janciraniProfile);
      localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: mockSession, profile: janciraniProfile }));
      return { error: null };
    }

    // 3. Service Co-ordinator: Harshiya Banu (emp id: ICSEC013)
    if (
      (input === 'icsec013' || input === 'harshiya' || input === 'harshiyabanu' || input === 'harshiya banu' || input === 'harshiya.banu@ics-crm.com') &&
      (isMasterPassword || password === 'admin123')
    ) {
      const harshiyaProfile: Profile = {
        id: 'a1000000-0000-0000-0000-000000000013',
        full_name: 'Harshiya Banu',
        employee_id: 'ICSEC013',
        email: 'harshiya.banu@ics-crm.com',
        phone: '+91 98400 00013',
        role: 'service_coordinator',
        branch: 'cbe',
        designation: 'Service Co-ordinator',
        department: 'Service Coordination',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: Session = {
        access_token: 'mock-harshiya-token',
        token_type: 'bearer',
        expires_in: 86400,
        refresh_token: 'mock-harshiya-refresh',
        user: {
          id: harshiyaProfile.id,
          app_metadata: { role: 'service_coordinator' },
          user_metadata: { full_name: harshiyaProfile.full_name, role: 'service_coordinator' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as Session['user'],
      };

      setSession(mockSession);
      setProfile(harshiyaProfile);
      localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: mockSession, profile: harshiyaProfile }));
      return { error: null };
    }

    // 4. Admin: TESTADMIN (emp id: TAD01)
    if (
      (input === 'tad01' || input === 'testadmin' || input === 'tad01@ics-crm.com') &&
      (isMasterPassword || password === 'admin123')
    ) {
      const testAdminProfile: Profile = {
        id: 'a1000000-0000-0000-0000-000000000099',
        full_name: 'TESTADMIN',
        employee_id: 'TAD01',
        email: 'tad01@ics-crm.com',
        phone: '+91 98400 00099',
        role: 'admin',
        branch: 'cbe',
        designation: 'Administrator',
        department: 'Management',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: Session = {
        access_token: 'mock-tad01-token',
        token_type: 'bearer',
        expires_in: 86400,
        refresh_token: 'mock-tad01-refresh',
        user: {
          id: testAdminProfile.id,
          app_metadata: { role: 'admin' },
          user_metadata: { full_name: testAdminProfile.full_name, role: 'admin' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as Session['user'],
      };

      setSession(mockSession);
      setProfile(testAdminProfile);
      localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: mockSession, profile: testAdminProfile }));
      return { error: null };
    }

    // 5. Service Engineers: Sreelal (ICSEC006), Pavithran (ICSEC014), Mani Rathnam (ICSEC015), Elavarasan (ICSEC016), TEST (TEST1)
    const engineerAccounts: Record<string, { id: string; name: string; empId: string; email: string; phone: string }> = {
      icsec006: { id: 'e1000000-0000-0000-0000-000000000006', name: 'Sreelal', empId: 'ICSEC006', email: 'sreelal@ics-crm.com', phone: '+91 98400 00006' },
      sreelal: { id: 'e1000000-0000-0000-0000-000000000006', name: 'Sreelal', empId: 'ICSEC006', email: 'sreelal@ics-crm.com', phone: '+91 98400 00006' },
      icsec014: { id: 'e1000000-0000-0000-0000-000000000014', name: 'Pavithran', empId: 'ICSEC014', email: 'pavithran@ics-crm.com', phone: '+91 98400 00014' },
      pavithran: { id: 'e1000000-0000-0000-0000-000000000014', name: 'Pavithran', empId: 'ICSEC014', email: 'pavithran@ics-crm.com', phone: '+91 98400 00014' },
      icsec015: { id: 'e1000000-0000-0000-0000-000000000015', name: 'Mani Rathnam', empId: 'ICSEC015', email: 'manirathnam@ics-crm.com', phone: '+91 98400 00015' },
      manirathnam: { id: 'e1000000-0000-0000-0000-000000000015', name: 'Mani Rathnam', empId: 'ICSEC015', email: 'manirathnam@ics-crm.com', phone: '+91 98400 00015' },
      'mani rathnam': { id: 'e1000000-0000-0000-0000-000000000015', name: 'Mani Rathnam', empId: 'ICSEC015', email: 'manirathnam@ics-crm.com', phone: '+91 98400 00015' },
      icsec016: { id: 'e1000000-0000-0000-0000-000000000016', name: 'Elavarasan', empId: 'ICSEC016', email: 'elavarasan@ics-crm.com', phone: '+91 98400 00016' },
      elavarasan: { id: 'e1000000-0000-0000-0000-000000000016', name: 'Elavarasan', empId: 'ICSEC016', email: 'elavarasan@ics-crm.com', phone: '+91 98400 00016' },
      test1: { id: 'e1000000-0000-0000-0000-000000000001', name: 'TEST', empId: 'TEST1', email: 'test1@ics-crm.com', phone: '+91 98400 00001' },
      test: { id: 'e1000000-0000-0000-0000-000000000001', name: 'TEST', empId: 'TEST1', email: 'test1@ics-crm.com', phone: '+91 98400 00001' },
    };

    if (engineerAccounts[input] && (isMasterPassword || password === 'admin123' || password === '')) {
      const engMeta = engineerAccounts[input];
      const engProfile: Profile = {
        id: engMeta.id,
        full_name: engMeta.name,
        employee_id: engMeta.empId,
        email: engMeta.email,
        phone: engMeta.phone,
        role: 'engineer',
        branch: 'cbe',
        designation: 'Service Engineer',
        department: 'Field Engineering',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: Session = {
        access_token: `mock-eng-token-${engMeta.empId}`,
        token_type: 'bearer',
        expires_in: 86400,
        refresh_token: `mock-eng-refresh-${engMeta.empId}`,
        user: {
          id: engProfile.id,
          app_metadata: { role: 'engineer' },
          user_metadata: { full_name: engProfile.full_name, role: 'engineer' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as Session['user'],
      };

      setSession(mockSession);
      setProfile(engProfile);
      localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: mockSession, profile: engProfile }));
      return { error: null };
    }

    // Check custom predefined username/password credentials
    if (input === 'admin1' && (password === 'admin123' || isMasterPassword)) {
      const adminProfile: Profile = {
        id: '11111111-1111-1111-1111-111111111111',
        full_name: 'Admin User',
        email: 'admin1@local',
        phone: '+91 98765 43210',
        role: 'admin',
        branch: 'cbe',
        designation: 'Administrator',
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
    if ((input === 'client1' || input === 'customer1' || input === 'client') && (password === 'client123' || password === 'customer123' || password === 'admin123' || isMasterPassword || password === '')) {
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
        branch: 'cbe',
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

    // Check Sales Executive demo credentials (se001 / kumar / sales1)
    if (
      (input === 'se001' || input === 'kumar' || input === 'sales1' || input === 'sales') &&
      (password === 'admin123' || password === 'sales123' || password === '123456' || password === '')
    ) {
      const salesProfile: Profile = {
        id: '33333333-3333-3333-3333-333333333333',
        employee_id: 'SE001',
        full_name: 'Kumar (Sales Executive)',
        email: 'kumar.sales@ics-crm.com',
        phone: '+91 98422 11223',
        role: 'sales_executive',
        branch: 'cbe',
        department: 'Sales & Business Development',
        designation: 'Sales Executive',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSession: Session = {
        access_token: 'mock-sales-token',
        token_type: 'bearer',
        expires_in: 86400,
        refresh_token: 'mock-sales-refresh',
        user: {
          id: salesProfile.id,
          app_metadata: { role: 'sales_executive' },
          user_metadata: { full_name: salesProfile.full_name, role: 'sales_executive' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as Session['user'],
      };

      setSession(mockSession);
      setProfile(salesProfile);
      localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: mockSession, profile: salesProfile }));
      return { error: null };
    }

    // Check Engineer demo credentials (engineer1 / engineer)
    if (input === 'engineer1' || input === 'engineer') {
      try {
        const { data: dbProfiles } = await supabase.from('profiles').select('*').eq('role', 'engineer');
        const activeEng = dbProfiles?.find((p) => p.is_active) || dbProfiles?.[0];
        if (activeEng) {
          const userSession: Session = {
            access_token: `mock-token-${activeEng.id}`,
            token_type: 'bearer',
            expires_in: 86400,
            refresh_token: `mock-refresh-${activeEng.id}`,
            user: {
              id: activeEng.id,
              app_metadata: { role: 'engineer' },
              user_metadata: { full_name: activeEng.full_name, role: 'engineer' },
              aud: 'authenticated',
              created_at: activeEng.created_at,
            } as unknown as Session['user'],
          };
          setSession(userSession);
          setProfile(activeEng as Profile);
          localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: userSession, profile: activeEng }));
          return { error: null };
        }
      } catch {
        // continue
      }
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
          const passMatch = !p.password_hash || p.password_hash === password || isMasterPassword;
          return (empMatch || emailMatch || nameMatch) && passMatch;
        });

        if (found) {
          const userProfile = { ...found } as Profile;
          if (
            ['ICSEC012', 'ICSEC013'].includes((userProfile.employee_id || '').toUpperCase()) ||
            (userProfile.designation || '').toLowerCase().includes('coordinator') ||
            (userProfile.designation || '').toLowerCase().includes('co-ordinator')
          ) {
            userProfile.role = 'service_coordinator';
          }
          userProfile.branch = userProfile.branch || 'cbe';

          const userSession: Session = {
            access_token: `mock-token-${userProfile.id}`,
            token_type: 'bearer',
            expires_in: 86400,
            refresh_token: `mock-refresh-${userProfile.id}`,
            user: {
              id: userProfile.id,
              app_metadata: { role: userProfile.role },
              user_metadata: { full_name: userProfile.full_name, role: userProfile.role },
              aud: 'authenticated',
              created_at: userProfile.created_at,
            } as unknown as Session['user'],
          };

          setSession(userSession);
          setProfile(userProfile);
          localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: userSession, profile: userProfile }));
          return { error: null };
        }
      }
    } catch {
      // ignore
    }

    // Authenticate client by email / phone / name / company directly from clients table
    try {
      const { data: dbClients } = await supabase.from('clients').select('*');
      if (dbClients && dbClients.length > 0) {
        const matchedClient = dbClients.find((c) => {
          const cEmail = (c.email || '').toLowerCase().trim();
          const cPhone = (c.phone || '').replace(/\D/g, '');
          const inputCleanPhone = input.replace(/\D/g, '');
          const cName = (c.client_name || '').toLowerCase().trim();
          const cCompany = (c.company_name || '').toLowerCase().trim();

          const emailMatch = cEmail && cEmail === input;
          const phoneMatch = inputCleanPhone && cPhone && (cPhone === inputCleanPhone || cPhone.endsWith(inputCleanPhone));
          const nameMatch = cName === input || cCompany === input;

          return emailMatch || phoneMatch || nameMatch;
        });

        if (matchedClient) {
          // Check password: match against client's custom password or fallback demo
          const passMatch = !matchedClient.password || matchedClient.password === password || password === 'client123' || password === 'customer123';
          if (!passMatch) {
            return { error: 'Invalid client portal password.' };
          }

          const clientPortalProfile: Profile = {
            id: matchedClient.id,
            client_id: matchedClient.id,
            company_name: matchedClient.company_name || matchedClient.client_name,
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

    // Only try standard Supabase authentication if a valid email is entered
    if (input.includes('@') && input.includes('.')) {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: input, password });
        if (error) {
          return { error: 'Invalid username or password' };
        }
        return { error: null };
      } catch {
        return { error: 'Invalid username or password' };
      }
    }

    return { error: 'Invalid username or password' };
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
