import { usePincodeAutofill } from '@/lib/shipping/usePincodeAutofill';
import { useSeo } from '@/lib/seo';
import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { useCatalog } from '@/lib/catalogContext';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useMyOrders } from '@/lib/data/orders';
import { OrderDetails } from '@/components/shop/OrderDetails';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/shop/StateViews';
import { toPublicSummary } from '@/lib/data/orderLookup';
import { INDIAN_STATES_AND_UTS, isValidPincode, normalizeIndianMobile } from '@/lib/checkout/validation';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { User, Lock, Settings, History, ShieldCheck, Phone, ArrowRight, Eye, EyeOff, X, PhoneCall, Heart, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup, RecaptchaVerifier, type ConfirmationResult, signInWithPhoneNumber, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

export default function Account() {
  useSeo({ title: 'My account', noindex: true });
  const { storeConfig, wishlist, toggleWishlist, products } = useCatalog();
  const { user, profile: currentCustomer, signIn, register, signOut: logoutCustomer, updateProfile } = useAuth();
  const { data: customerOrders = [], isLoading: ordersLoading, error: ordersError } = useMyOrders(user?.uid);
  
  const [searchParams] = useSearchParams();
  
  // Navigation tabs inside dashboard
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'security' | 'wishlist'>('orders');
  
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'wishlist' || tab === 'orders' || tab === 'profile' || tab === 'security') {
      setActiveTab(tab);
    }
  }, [searchParams]);
  
  // Auth Modes: 'login' | 'register' | 'phone'
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'phone'>('login');
  
  // Email/Password inputs
  const [loginForm, setLoginForm] = useState({ emailOrPhone: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Phone Auth Inputs
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // Nothing to clear: the verifier was never rendered or is already disposed.
        }
      }
    };
  }, []);

  // Profile Settings form states
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
  });
  // Typing the PIN fills an empty city/state (never overwrites typed values).
  usePincodeAutofill(profileForm.pincode, profileForm, patch => setProfileForm(prev => ({ ...prev, ...patch })));

  // Password Update form states
  const [passwordForm, setPasswordForm] = useState({
    currentPass: '',
    newPass: '',
    confirmPass: ''
  });

  // Load profile settings on mount/auth state change
  useEffect(() => {
    if (currentCustomer) {
      setProfileForm({
        name: currentCustomer.name || '',
        phone: currentCustomer.phone || '',
        address: currentCustomer.address || '',
        city: currentCustomer.city || '',
        state: currentCustomer.state || '',
        pincode: currentCustomer.pincode || '',
      });
    }
  }, [currentCustomer]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { emailOrPhone, password } = loginForm;
    if (!emailOrPhone || !password) {
      toast.error('Please enter both email and password.');
      return;
    }
    if (!emailOrPhone.includes('@')) {
      toast.error('Please sign in with the email address on your account.');
      return;
    }

    setAuthLoading(true);
    try {
      await signIn(emailOrPhone, password);
      toast.success('Signed in.');
    } catch {
      toast.error('Invalid email or password. Please verify your entries.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, phone, password } = registerForm;
    if (!name || !email || !password) {
      toast.error('Please enter Name, Email, and Password.');
      return;
    }

    if (phone && !normalizeIndianMobile(phone)) {
      toast.error('Enter a valid 10-digit Indian mobile number or leave it blank.');
      return;
    }

    setAuthLoading(true);
    try {
      await register({ email, phone: phone ? normalizeIndianMobile(phone) ?? phone : undefined, name, password });
      toast.success('Account created.');
    } catch (err) {
      toast.error(err instanceof Error && /email-already-in-use/.test(err.message)
        ? 'This email is already registered. Try signing in.'
        : 'Registration failed. Please check your details and try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Google Login popup
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success("Logged in via Google Authentication!");
    } catch (e: unknown) {
      toast.error((e instanceof Error && e.message) || "Google sign-in was cancelled or failed.");
      console.error(e);
    }
  };

  // Phone SMS Otp Send Handler
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) {
      toast.error("Please enter a valid phone number including country code (e.g., +1234567890)");
      return;
    }

    setSendingOtp(true);
    try {
      // Clear previous verifier instance if exists
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // Nothing to clear: the verifier was never rendered or is already disposed.
        }
        recaptchaVerifierRef.current = null;
      }

      // Initialize invisible recaptcha verifier bound to submit button
      const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-button', {
        size: 'invisible',
        callback: () => {
          // recaptcha completed
        }
      });
      recaptchaVerifierRef.current = recaptchaVerifier;

      const confirmation = await signInWithPhoneNumber(auth, phoneNumber.trim(), recaptchaVerifier);
      setConfirmationResult(confirmation);
      setShowOtpInput(true);
      toast.success("SMS confirmation code sent successfully!");
    } catch (err: unknown) {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // Nothing to clear: the verifier was never rendered or is already disposed.
        }
        recaptchaVerifierRef.current = null;
      }
      toast.error((err instanceof Error && err.message) || "SMS send failed. Confirm number formatting.");
      console.error(err);
    } finally {
      setSendingOtp(false);
    }
  };

  // Phone SMS Otp Verify Handler
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) {
      toast.error("Please enter the 6-digit confirmation code.");
      return;
    }

    setAuthLoading(true);
    try {
      await confirmationResult.confirm(otpCode.trim());
      toast.success("Phone authenticated successfully!");
      setShowOtpInput(false);
      setConfirmationResult(null);
    } catch {
      toast.error("Invalid verification code. Please request a new one.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileForm.phone && !normalizeIndianMobile(profileForm.phone)) {
      toast.error('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (profileForm.pincode && !isValidPincode(profileForm.pincode)) {
      toast.error('Enter a valid 6-digit pincode.');
      return;
    }
    try {
      await updateProfile({
        ...profileForm,
        phone: profileForm.phone ? normalizeIndianMobile(profileForm.phone) ?? profileForm.phone : '',
        country: 'India',
      });
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(`Profile was not saved: ${err instanceof Error ? err.message : 'please try again.'}`);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const { currentPass, newPass, confirmPass } = passwordForm;

    if (!currentPass || !newPass || !confirmPass) {
      toast.error('Please enter all security credentials.');
      return;
    }

    if (newPass !== confirmPass) {
      toast.error('New passwords do not match.');
      return;
    }

    try {
      const user = auth.currentUser;
      if (user && user.email) {
        // Reauthenticate
        const credential = EmailAuthProvider.credential(user.email, currentPass);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPass);
        
        toast.success('Account password updated successfully.');
        setPasswordForm({ currentPass: '', newPass: '', confirmPass: '' });
      }
    } catch (err: unknown) {
      toast.error((err instanceof Error && err.message) || "Failed to update password. Verify current credentials.");
      console.error(err);
    }
  };

  // AUTHENTICATION LOGIN / SIGN-UP CARD INTERFACE
  if (!currentCustomer) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SiteHeader />
        
        <section className="max-w-md mx-auto px-6 py-16 flex-1 w-full flex flex-col justify-center">

          <div className="bg-card border border-border shadow-luxe rounded p-6 sm:p-8 space-y-6 noise-overlay relative">

            {authMode === 'login' && (
              <div className="space-y-5 animate-fade-in">
                <div className="text-left space-y-1">
                  <h1 className="font-display text-2xl text-oxblood-deep font-semibold">Sign In</h1>
                  <p className="text-xs text-muted-foreground">Orders, addresses and saved designs.</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label htmlFor="login-email" className="text-xs font-medium text-muted-foreground">Email or User ID</label>
                    <input 
                      id="login-email"
                      type="text" 
                      autoComplete="username"
                      placeholder="name@example.com"
                      value={loginForm.emailOrPhone}
                      onChange={e => setLoginForm({ ...loginForm, emailOrPhone: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2.5 text-sm outline-none focus:border-oxblood font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="login-password" className="text-xs font-medium text-muted-foreground">Password</label>
                    <div className="relative">
                      <input 
                        id="login-password"
                        type={showPassword ? 'text' : 'password'} 
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={loginForm.password}
                        onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="w-full bg-background border border-border rounded pl-3 pr-10 py-2.5 text-sm outline-none focus:border-oxblood font-mono"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-gradient-oxblood text-primary-foreground py-3 rounded-full hover:shadow-soft transition text-xs uppercase tracking-widest font-semibold flex items-center justify-center gap-1 disabled:opacity-60"
                  >
                    {authLoading ? 'Signing in...' : 'Authenticate'} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="relative flex py-1 items-center text-xs text-muted-foreground/60">
                  <div className="flex-grow border-t border-border/50"></div>
                  <span className="flex-shrink mx-4 text-xs">or authenticate with</span>
                  <div className="flex-grow border-t border-border/50"></div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleGoogleLogin}
                    className="bg-card hover:bg-muted border border-border text-foreground py-2.5 rounded text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.2-5.136 4.2A5.76 5.76 0 0 1 8.2 12.8a5.76 5.76 0 0 1 5.79-5.8 5.66 5.66 0 0 1 3.93 1.54l3.1-3.1A9.97 9.97 0 0 0 13.99 2 9.99 9.99 0 0 0 4 12a9.99 9.99 0 0 0 9.99 10c5.3 0 9.77-3.83 9.77-10 0-.61-.07-1.18-.2-1.715H12.24z"/>
                    </svg>
                    <span>Google</span>
                  </button>

                  <button
                    onClick={() => setAuthMode('phone')}
                    className="bg-card hover:bg-muted border border-border text-foreground py-2.5 rounded text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>SMS Phone</span>
                  </button>
                </div>

                <div className="text-center pt-2 text-xs border-t border-border/40">
                  <span className="text-muted-foreground">New customer? </span>
                  <button 
                    onClick={() => setAuthMode('register')} 
                    className="text-brass hover:text-oxblood font-bold underline underline-offset-2"
                  >
                    Register Account
                  </button>
                </div>
              </div>
            )}

            {authMode === 'phone' && (
              <div className="space-y-5 animate-fade-in">
                <div className="text-left space-y-1">
                  <span className="text-xs uppercase tracking-[0.35em] text-brass font-bold">SMS Gateways</span>
                  <h1 className="font-display text-2xl text-oxblood-deep font-semibold">Phone Sign In</h1>
                  <p className="text-xs text-muted-foreground">Secure mobile phone numbers with SMS verification codes.</p>
                </div>

                {!showOtpInput ? (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="phone-number" className="text-xs font-medium text-muted-foreground">Mobile Phone Number</label>
                      <input id="phone-number" autoComplete="tel" 
                        type="tel" 
                        placeholder="+32 470 00 00 00"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        className="w-full bg-background border border-border rounded px-3 py-2.5 text-sm outline-none focus:border-oxblood font-mono font-medium"
                        required
                      />
                      <span className="text-xs text-muted-foreground/80 block mt-1 leading-normal">Requires international country code prefix.</span>
                    </div>

                    <button
                      id="recaptcha-button"
                      type="submit"
                      disabled={sendingOtp}
                      className="w-full bg-gradient-oxblood text-primary-foreground py-3 rounded-full hover:shadow-soft transition text-xs uppercase tracking-widest font-semibold flex items-center justify-center gap-1 disabled:opacity-60"
                    >
                      {sendingOtp ? 'Sending SMS...' : 'Request OTP Code'} <PhoneCall className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="otp-code" className="text-xs font-medium text-muted-foreground">6-Digit Verification Code</label>
                      <input id="otp-code" autoComplete="one-time-code" 
                        type="text" 
                        maxLength={6}
                        placeholder="123456"
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value)}
                        className="w-full bg-background border border-border rounded px-3 py-2.5 text-center text-lg outline-none focus:border-oxblood font-mono tracking-widest font-bold"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-gradient-oxblood text-primary-foreground py-3 rounded-full hover:shadow-soft transition text-xs uppercase tracking-widest font-semibold flex items-center justify-center gap-1 disabled:opacity-60"
                    >
                      {authLoading ? 'Verifying...' : 'Verify OTP Code'} <ShieldCheck className="w-3.5 h-3.5" />
                    </button>
                  </form>
                )}

                <div className="text-center pt-2 border-t border-border/40 text-xs">
                  <button 
                    onClick={() => {
                      setAuthMode('login');
                      setShowOtpInput(false);
                      setConfirmationResult(null);
                    }} 
                    className="text-brass hover:text-oxblood font-bold underline underline-offset-2"
                  >
                    Back to Email Sign In
                  </button>
                </div>
              </div>
            )}

            {authMode === 'register' && (
              <div className="space-y-5 animate-fade-in">
                <div className="text-left space-y-1">
                  <h1 className="font-display text-2xl text-oxblood-deep font-semibold">Create Account</h1>
                  <p className="text-xs text-muted-foreground">Sign up to prefill checkout addresses and browse order status updates.</p>
                </div>

                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div className="space-y-1">
                    <label htmlFor="register-name" className="text-xs font-medium text-muted-foreground">Full Name</label>
                    <input id="register-name" autoComplete="name" 
                      type="text" 
                      placeholder="Jane Doe"
                      value={registerForm.name}
                      onChange={e => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="register-email" className="text-xs font-medium text-muted-foreground">Email Address</label>
                    <input id="register-email" autoComplete="email" 
                      type="email" 
                      placeholder="name@example.com"
                      value={registerForm.email}
                      onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="register-phone" className="text-xs font-medium text-muted-foreground">Phone Number (Optional)</label>
                    <input id="register-phone" autoComplete="tel" 
                      type="text" 
                      placeholder="+32 470 00 00 00"
                      value={registerForm.phone}
                      onChange={e => setRegisterForm({ ...registerForm, phone: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="register-password" className="text-xs font-medium text-muted-foreground">Create Password</label>
                    <input id="register-password" autoComplete="new-password" 
                      type="password" 
                      placeholder="••••••••"
                      value={registerForm.password}
                      onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2.5 text-sm outline-none focus:border-oxblood font-mono"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-gradient-oxblood text-primary-foreground py-3 rounded-full hover:shadow-soft transition text-xs uppercase tracking-widest font-semibold flex items-center justify-center gap-1 mt-1 disabled:opacity-60"
                  >
                    {authLoading ? 'Registering...' : 'Register Account'} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="relative flex py-1 items-center text-xs text-muted-foreground/60">
                  <div className="flex-grow border-t border-border/50"></div>
                  <span className="flex-shrink mx-4 text-xs">or</span>
                  <div className="flex-grow border-t border-border/50"></div>
                </div>

                <button
                  onClick={handleGoogleLogin}
                  className="w-full bg-card hover:bg-muted border border-border text-foreground py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.2-5.136 4.2A5.76 5.76 0 0 1 8.2 12.8a5.76 5.76 0 0 1 5.79-5.8 5.66 5.66 0 0 1 3.93 1.54l3.1-3.1A9.97 9.97 0 0 0 13.99 2 9.99 9.99 0 0 0 4 12a9.99 9.99 0 0 0 9.99 10c5.3 0 9.77-3.83 9.77-10 0-.61-.07-1.18-.2-1.715H12.24z"/>
                  </svg>
                  <span>Google Registration</span>
                </button>

                <div className="text-center pt-2 text-xs border-t border-border/40">
                  <span className="text-muted-foreground">Already have an account? </span>
                  <button 
                    onClick={() => setAuthMode('login')} 
                    className="text-brass hover:text-oxblood font-bold underline underline-offset-2"
                  >
                    Sign In instead
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <SiteFooter />
      </div>
    );
  }

  // ACTIVE CUSTOMER LOGGED-IN ATELIER DASHBOARD
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      
      <section className="max-w-6xl mx-auto px-6 py-10 md:py-16 w-full flex-1 grid lg:grid-cols-[240px_1fr] gap-10">
        {/* Left Hand Navigation Menu */}
        <aside className="space-y-6">
          <div className="bg-card border border-border/60 rounded p-4 text-center space-y-3 noise-overlay">
            <div className="w-14 h-14 rounded-full bg-gradient-oxblood text-primary-foreground flex items-center justify-center mx-auto text-lg font-display font-bold relative">
              {currentCustomer.name ? currentCustomer.name.slice(0, 2).toUpperCase() : 'AT'}
              {currentCustomer.isGoogleUser && (
                <span className="absolute bottom-0 right-0 bg-blue-500 border border-card rounded-full p-0.5" title="Google Authenticated">
                  <svg className="w-2.5 h-2.5 fill-white" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </span>
              )}
            </div>
            <div>
              <h3 className="font-display font-semibold text-oxblood-deep leading-tight truncate">{currentCustomer.name}</h3>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{currentCustomer.email || currentCustomer.phone}</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {[
              { id: 'orders', label: 'My Orders', icon: History },
              { id: 'wishlist', label: 'My Wishlist', icon: Heart },
              { id: 'profile', label: 'Profile Address', icon: User },
              { id: 'security', label: 'Security Details', icon: Lock }
            ].map(tab => {
              const TabIcon = tab.icon;
              const isSelected = activeTab === tab.id;
              
              // Skip security tab for Google users (no passwords to edit)
              if (tab.id === 'security' && currentCustomer.isGoogleUser) return null;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`w-full p-3 rounded text-xs uppercase tracking-wider font-semibold flex items-center gap-3 transition-all ${
                    isSelected
                      ? 'bg-oxblood/5 text-oxblood border-l-2 border-oxblood'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  <TabIcon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-border/50 pt-4 flex flex-col gap-2">
            <Link
              to="/account/spaces"
              className="w-full p-3 rounded text-xs uppercase tracking-wider font-semibold flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span>My Space</span>
            </Link>

            <button
              onClick={logoutCustomer}
              className="w-full border border-oxblood/20 text-oxblood p-2.5 rounded text-xs font-semibold hover:bg-oxblood/5 transition"
            >
              Logout Account
            </button>
          </div>
        </aside>

        {/* Right Hand Context Panels */}
        <main className="space-y-6">
          {activeTab === 'orders' && (
            <div className="space-y-5 animate-fade-in">
              <h1 className="font-display text-3xl">My orders</h1>
              {ordersLoading ? (
                <LoadingBlock className="h-40" />
              ) : ordersError ? (
                <ErrorState>We could not load your orders: {ordersError.message}</ErrorState>
              ) : customerOrders.length === 0 ? (
                <EmptyState title="No orders yet" action={{ label: 'Shop designs', to: '/shop' }} />
              ) : (
                <div className="space-y-4">
                  {customerOrders.map(o => <OrderDetails key={o.id} order={toPublicSummary(o)} email={currentCustomer.email} />)}
                </div>
              )}
            </div>
          )}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fade-in max-w-2xl">
              <div>
                <h1 className="font-display text-3xl text-oxblood-deep font-semibold font-serif-italic">Profile Settings</h1>
                <p className="text-xs text-muted-foreground font-medium">Manage your shipping addresses to speed up checkout workflows.</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="bg-card border border-border/60 rounded p-6 space-y-5 noise-overlay">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="profile-name" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Full Name</label>
                    <input id="profile-name" autoComplete="name" 
                      type="text" 
                      value={profileForm.name}
                      onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-semibold"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="profile-phone" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Phone Number</label>
                    <input id="profile-phone" autoComplete="tel" 
                      type="text" 
                      value={profileForm.phone}
                      onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                      placeholder="10-digit mobile"
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label htmlFor="profile-address" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Default Shipping Street Address</label>
                    <input id="profile-address" autoComplete="street-address" 
                      type="text" 
                      value={profileForm.address}
                      onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="profile-pincode" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Pincode</label>
                    <input id="profile-pincode" autoComplete="postal-code" 
                      type="text" 
                      inputMode="numeric"
                      maxLength={6}
                      value={profileForm.pincode}
                      onChange={e => setProfileForm({ ...profileForm, pincode: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="profile-city" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">City</label>
                    <input id="profile-city" autoComplete="address-level2" 
                      type="text" 
                      value={profileForm.city}
                      onChange={e => setProfileForm({ ...profileForm, city: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label htmlFor="profile-state" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">State / UT</label>
                    <select id="profile-state" autoComplete="address-level1"
                      value={profileForm.state}
                      onChange={e => setProfileForm({ ...profileForm, state: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood"
                    >
                      <option value="">Select state</option>
                      {INDIAN_STATES_AND_UTS.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/40 flex justify-end">
                  <button
                    type="submit"
                    className="bg-gradient-oxblood text-primary-foreground py-2.5 px-6 rounded-full hover:shadow-soft text-xs uppercase tracking-widest font-bold"
                  >
                    Save Profile
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'security' && !currentCustomer.isGoogleUser && (
            <div className="space-y-6 animate-fade-in max-w-md">
              <div>
                <h1 className="font-display text-3xl text-oxblood-deep font-semibold">Security Settings</h1>
                <p className="text-xs text-muted-foreground font-medium">Update account passwords and inspect credentials.</p>
              </div>

              <form onSubmit={handleUpdatePassword} className="bg-card border border-border/60 rounded p-6 space-y-4 noise-overlay">
                <div className="space-y-1">
                  <label htmlFor="current-password" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Current Password</label>
                  <input id="current-password" autoComplete="current-password" 
                    type="password" 
                    placeholder="••••••••"
                    value={passwordForm.currentPass}
                    onChange={e => setPasswordForm({ ...passwordForm, currentPass: e.target.value })}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="new-password" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">New Password</label>
                  <input id="new-password" autoComplete="new-password" 
                    type="password" 
                    placeholder="••••••••"
                    value={passwordForm.newPass}
                    onChange={e => setPasswordForm({ ...passwordForm, newPass: e.target.value })}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="confirm-password" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Confirm New Password</label>
                  <input id="confirm-password" autoComplete="new-password" 
                    type="password" 
                    placeholder="••••••••"
                    value={passwordForm.confirmPass}
                    onChange={e => setPasswordForm({ ...passwordForm, confirmPass: e.target.value })}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    required
                  />
                </div>

                <div className="pt-2 border-t border-border/40 flex justify-end">
                  <button
                    type="submit"
                    className="bg-gradient-oxblood text-primary-foreground py-2.5 px-6 rounded-full hover:shadow-soft text-xs uppercase tracking-widest font-bold"
                  >
                    Update Password
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'wishlist' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="font-display text-3xl text-oxblood-deep font-semibold">My Wishlist</h1>
                <p className="text-xs text-muted-foreground">Products you have saved for later. You can quickly add them to your cart or customize them.</p>
              </div>

              {products.filter(p => wishlist.includes(p.id)).length === 0 ? (
                <div className="border border-dashed border-border/80 rounded p-12 text-center text-muted-foreground italic text-sm space-y-4">
                  <p>Your wishlist is currently empty.</p>
                  <Link to="/shop" className="inline-block bg-oxblood text-ivory px-6 py-2.5 rounded-full text-xs uppercase tracking-widest hover:bg-oxblood-deep transition font-semibold">
                    Browse Shop Catalog
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {products.filter(p => wishlist.includes(p.id)).map(p => (
                    <div key={p.id} className="bg-card border border-border/60 rounded overflow-hidden flex gap-4 p-4 noise-overlay shadow-soft hover:border-oxblood/35 transition-colors relative">
                      <div className="w-24 h-24 bg-gradient-to-br from-background via-card to-black rounded overflow-hidden p-2 flex items-center justify-center shrink-0">
                        <ShapeThumb shapeId={p.shapeId} finish={p.finishes[0]} className="w-full h-full" />
                      </div>
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <Link to={`/product/${p.slug}`} className="font-display text-lg text-oxblood-deep hover:underline truncate block font-semibold">
                            {p.name}
                          </Link>
                          <p className="text-xs text-muted-foreground uppercase tracking-widest truncate">{p.tagline}</p>
                          <p className="text-sm font-semibold font-mono text-oxblood mt-1">{storeConfig.currency}{p.price}</p>
                        </div>
                        <div className="flex items-center gap-3 mt-3">
                          <Link
                            to={`/product/${p.slug}`}
                            className="bg-oxblood text-ivory text-xs uppercase tracking-widest font-semibold px-4 py-2 rounded hover:bg-oxblood-deep transition"
                          >
                            Configure
                          </Link>
                          <button
                            onClick={() => toggleWishlist(p.id)}
                            className="text-xs text-destructive hover:underline font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </section>

      <SiteFooter />
    </div>
  );
}