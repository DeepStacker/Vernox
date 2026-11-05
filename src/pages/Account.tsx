import { useSeo } from '@/lib/seo';
import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SiteHeader } from '@/components/shop/SiteHeader';
import { SiteFooter } from '@/components/shop/SiteFooter';
import { useCatalog } from '@/lib/catalogContext';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useMyOrders } from '@/lib/data/orders';
import { OrderProgress } from '@/components/shop/OrderProgress';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders/orderStateMachine';
import { INDIAN_STATES_AND_UTS, isValidPincode, normalizeIndianMobile } from '@/lib/checkout/validation';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, MapPin, Truck, Calendar, Package, AlertCircle, Layers, Sun, Moon, User, Lock, Settings, History, ShieldCheck, Mail, Phone, ArrowRight, Eye, EyeOff, X, PhoneCall, Heart, Activity, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup, RecaptchaVerifier, type ConfirmationResult, signInWithPhoneNumber, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

export default function Account() {
  useSeo({ title: 'My account', noindex: true });
  const { storeConfig, wishlist, toggleWishlist, products } = useCatalog();
  const { user, profile: currentCustomer, signIn, register, signOut: logoutCustomer, updateProfile } = useAuth();
  const { data: customerOrders = [], isLoading: ordersLoading, error: ordersError } = useMyOrders(user?.uid);
  
  const { theme, setTheme } = useTheme();
  const [searchParams] = useSearchParams();
  
  // Navigation tabs inside dashboard
  const [activeTab, setActiveTab] = useState<'orders' | 'profile' | 'security' | 'wishlist'>('orders');
  
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'wishlist' || tab === 'orders' || tab === 'profile' || tab === 'security') {
      setActiveTab(tab);
    }
  }, [searchParams]);
  
  // Expandable orders
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

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

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case 'Pending_Payment': return 'text-yellow-600 bg-yellow-500/10 border-yellow-500/20';
      case 'Paid': case 'In_Design': return 'text-purple-600 bg-purple-500/10 border-purple-500/20';
      case 'Cutting': case 'Finishing': case 'Quality_Check': case 'Packed': return 'text-blue-600 bg-blue-500/10 border-blue-500/20';
      case 'Shipped': case 'Out_For_Delivery': return 'text-indigo-600 bg-indigo-500/10 border-indigo-500/20';
      case 'Delivered': return 'text-green-600 bg-green-500/10 border-green-500/20';
      case 'Cancelled': case 'Payment_Failed': case 'Expired': return 'text-red-600 bg-red-500/10 border-red-500/20';
      default: return 'text-zinc-600 bg-zinc-500/10 border-zinc-500/20';
    }
  };

  const handleToggleExpand = (orderId: string) => {
    setExpandedOrderId(prev => prev === orderId ? null : orderId);
  };

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
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="absolute top-4 right-4 p-2 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground transition"
              title="Toggle Theme Mode"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-brass" /> : <Moon className="w-3.5 h-3.5 text-oxblood" />}
            </button>

            {authMode === 'login' && (
              <div className="space-y-5 animate-fade-in">
                <div className="text-left space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.35em] text-brass font-bold">Atelier Accounts</span>
                  <h1 className="font-display text-2xl text-oxblood-deep font-semibold">Sign In</h1>
                  <p className="text-xs text-muted-foreground">Access your custom commission orders, shipping settings, and design backups.</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Email or User ID</label>
                    <input 
                      type="text" 
                      placeholder="name@example.com"
                      value={loginForm.emailOrPhone}
                      onChange={e => setLoginForm({ ...loginForm, emailOrPhone: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2.5 text-sm outline-none focus:border-oxblood font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Password</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        placeholder="••••••••"
                        value={loginForm.password}
                        onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="w-full bg-background border border-border rounded pl-3 pr-10 py-2.5 text-sm outline-none focus:border-oxblood font-mono"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
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
                  <span className="flex-shrink mx-4 uppercase tracking-widest text-[9px]">or authenticate with</span>
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
                  <span className="text-[10px] uppercase tracking-[0.35em] text-brass font-bold">SMS Gateways</span>
                  <h1 className="font-display text-2xl text-oxblood-deep font-semibold">Phone Sign In</h1>
                  <p className="text-xs text-muted-foreground">Secure mobile phone numbers with SMS verification codes.</p>
                </div>

                {!showOtpInput ? (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Mobile Phone Number</label>
                      <input 
                        type="tel" 
                        placeholder="+32 470 00 00 00"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        className="w-full bg-background border border-border rounded px-3 py-2.5 text-sm outline-none focus:border-oxblood font-mono font-medium"
                        required
                      />
                      <span className="text-[9px] text-muted-foreground/80 block mt-1 leading-normal">Requires international country code prefix.</span>
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
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">6-Digit Verification Code</label>
                      <input 
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
                  <span className="text-[10px] uppercase tracking-[0.35em] text-brass font-bold">Atelier Accounts</span>
                  <h1 className="font-display text-2xl text-oxblood-deep font-semibold">Create Account</h1>
                  <p className="text-xs text-muted-foreground">Sign up to prefill checkout addresses and browse order status updates.</p>
                </div>

                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Full Name</label>
                    <input 
                      type="text" 
                      placeholder="Jane Doe"
                      value={registerForm.name}
                      onChange={e => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Email Address</label>
                    <input 
                      type="email" 
                      placeholder="name@example.com"
                      value={registerForm.email}
                      onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Phone Number (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="+32 470 00 00 00"
                      value={registerForm.phone}
                      onChange={e => setRegisterForm({ ...registerForm, phone: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Create Password</label>
                    <input 
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
                  <span className="flex-shrink mx-4 uppercase tracking-widest text-[9px]">or</span>
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
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{currentCustomer.email || currentCustomer.phone}</p>
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
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-full border border-border bg-card p-2.5 rounded text-xs font-semibold flex items-center justify-center gap-2 hover:bg-muted text-muted-foreground hover:text-foreground transition"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-brass" /> : <Moon className="w-4 h-4 text-oxblood" />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

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
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="font-display text-3xl text-oxblood-deep font-semibold">Atelier Orders</h1>
                <p className="text-xs text-muted-foreground">Inspect tracking details, receipts, and custom commission canvas designs.</p>
              </div>

              {ordersLoading ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Loading your orders…</p>
              ) : ordersError ? (
                <div className="text-center py-12 border border-destructive/30 rounded bg-destructive/5 text-sm text-destructive">
                  We could not load your orders: {ordersError.message}
                </div>
              ) : customerOrders.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-border rounded bg-card/40 noise-overlay">
                  <Package className="w-10 h-10 mx-auto mb-4 text-muted-foreground/40" />
                  <p className="text-muted-foreground mb-6 font-serif-italic text-sm">No orders recorded under this account yet.</p>
                  <Link to="/shop" className="inline-flex bg-gradient-oxblood text-primary-foreground font-semibold px-6 py-3 rounded-full hover:shadow-soft transition text-xs uppercase tracking-widest">
                    Explore the Shop
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {customerOrders.map(o => {
                    const isExpanded = expandedOrderId === o.id;
                    const totalItemsCount = o.items.reduce((sum, i) => sum + i.quantity, 0);
                    
                    return (
                      <div 
                        key={o.id} 
                        className={`bg-card border rounded transition-all shadow-soft overflow-hidden ${
                          isExpanded ? 'border-oxblood/30 ring-1 ring-oxblood/10' : 'border-border/60 hover:border-oxblood/20'
                        }`}
                      >
                        {/* CARD SUMMARY HEADER */}
                        <div 
                          onClick={() => handleToggleExpand(o.id)}
                          className="p-5 flex flex-wrap items-center justify-between gap-4 cursor-pointer select-none"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm font-semibold text-brass">{o.orderNumber || o.id}</span>
                              <span className={`px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded-full border ${getStatusColor(o.status)}`}>
                                {ORDER_STATUS_LABELS[o.status]}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Placed: {new Date(o.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="font-semibold text-oxblood-deep font-mono">{storeConfig.currency}{o.total.toFixed(2)}</div>
                              <span className="text-[9px] uppercase tracking-widest text-brass font-bold">Secure Account Receipt</span>
                            </div>
                            <div className="p-1 hover:bg-muted rounded text-muted-foreground">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </div>
                        </div>

                        {/* EXPANDED DETAILED BODY */}
                        {isExpanded && (
                          <div className="border-t border-border/50 bg-background-warm/30 p-5 space-y-6 animate-fade-in">
                            <div className="space-y-4 bg-muted/20 border border-border/40 p-5 rounded-md">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/20 pb-2">
                                <History className="w-3.5 h-3.5" /> Order progress
                              </h4>
                              <OrderProgress status={o.status} />
                            </div>

                            {/* 1. Itemized List */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/30 pb-2">
                                <Package className="w-3.5 h-3.5" /> Order details
                              </h4>
                              <div className="divide-y divide-border/40">
                                {o.items.map(item => (
                                  <div key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0 items-center">
                                    <div className="w-16 h-16 shrink-0 bg-card border border-border/50 rounded p-2 flex items-center justify-center">
                                      {item.customDesignThumb ? (
                                        <img 
                                          src={item.customDesignThumb} 
                                          alt="" 
                                          className="w-full h-full object-contain" 
                                        />
                                      ) : (
                                        <ShapeThumb shapeId={item.shapeId} finish={item.finish} className="w-full h-full" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-display text-sm font-semibold text-oxblood-deep truncate">{item.productName}</div>
                                      <div className="text-xs text-muted-foreground capitalize font-medium">
                                        {item.finish} · {item.sizeLabel}
                                      </div>
                                      {item.customDesignRef && item.customDesignRef.startsWith('{') && (
                                        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-brass font-bold mt-1">
                                          <Layers className="w-2.5 h-2.5" /> Custom Design
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-right text-sm">
                                      <div className="font-semibold font-mono text-oxblood-deep">{storeConfig.currency}{(item.unitPrice * item.quantity).toFixed(2)}</div>
                                      <div className="text-xs text-muted-foreground">{storeConfig.currency}{item.unitPrice.toFixed(2)} x {item.quantity}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 2. Tracking details & Shipping details */}
                            <div className="grid md:grid-cols-2 gap-6 pt-2 border-t border-border/40">
                              {/* Shipping Coordinate Card */}
                              <div className="space-y-2 text-xs">
                                <h5 className="font-semibold text-oxblood flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5" /> Shipping Address
                                </h5>
                                <div className="text-muted-foreground leading-relaxed pl-5">
                                  <p className="font-semibold text-foreground">{o.customerName}</p>
                                  <p>{o.shippingAddress}</p>
                                  <p>{o.shippingCity}, {o.shippingState} {o.shippingPincode}</p>
                                  <p>{o.shippingCountry}</p>
                                </div>
                              </div>

                              {/* Order Tracking Card */}
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <h5 className="font-semibold text-oxblood flex items-center gap-1.5">
                                    <Truck className="w-3.5 h-3.5" /> Order Tracking
                                  </h5>
                                  <Link 
                                    to={`/track-order?id=${o.orderNumber || o.id}`}
                                    className="text-[10px] text-brass hover:text-oxblood font-semibold tracking-wider uppercase inline-flex items-center gap-1 transition"
                                  >
                                    Live Telemetry &rarr;
                                  </Link>
                                </div>
                                {o.tracking?.trackingNumber ? (
                                  <div className="text-muted-foreground leading-relaxed pl-5 space-y-1">
                                    <p>Carrier: <span className="font-semibold text-foreground capitalize">{o.tracking?.carrier || 'Courier'}</span></p>
                                    <p>Code: <span className="font-mono text-foreground font-semibold">{o.tracking?.trackingNumber}</span></p>
                                    {o.tracking?.estimatedDelivery && (
                                      <p className="flex items-center gap-1 text-emerald-600 mt-1">
                                        <Calendar className="w-3 h-3" /> Delivery: {o.tracking?.estimatedDelivery}
                                      </p>
                                    )}
                                    <div className="pt-2">
                                      <Link
                                        to={`/track-order?id=${o.orderNumber || o.id}`}
                                        className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-oxblood border border-oxblood/20 bg-oxblood/5 hover:bg-oxblood hover:text-white px-3 py-1.5 rounded transition uppercase tracking-wider"
                                      >
                                        <Activity className="w-3 h-3" /> Dedicated Tracking Portal
                                      </Link>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-muted-foreground leading-relaxed pl-5 space-y-2">
                                    <div className="flex items-start gap-1.5 bg-yellow-500/5 border border-yellow-500/10 p-2.5 rounded">
                                      <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-semibold text-foreground text-[11px]">Production in Queue</p>
                                        <p className="text-[10px] text-muted-foreground/80 mt-0.5">We are preparing your custom commission layout. Once laser cut and patinated, tracking codes will activate here.</p>
                                      </div>
                                    </div>
                                    <Link
                                      to={`/track-order?id=${o.orderNumber || o.id}`}
                                      className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-oxblood border border-oxblood/20 bg-oxblood/5 hover:bg-oxblood hover:text-white px-3 py-1.5 rounded transition uppercase tracking-wider"
                                    >
                                      <Activity className="w-3 h-3" /> Track Atelier Milestones &rarr;
                                    </Link>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Full Name</label>
                    <input 
                      type="text" 
                      value={profileForm.name}
                      onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-semibold"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Phone Number</label>
                    <input 
                      type="text" 
                      value={profileForm.phone}
                      onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                      placeholder="10-digit mobile"
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Default Shipping Street Address</label>
                    <input 
                      type="text" 
                      value={profileForm.address}
                      onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">City</label>
                    <input 
                      type="text" 
                      value={profileForm.city}
                      onChange={e => setProfileForm({ ...profileForm, city: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pincode</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      maxLength={6}
                      value={profileForm.pincode}
                      onChange={e => setProfileForm({ ...profileForm, pincode: e.target.value })}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">State / UT</label>
                    <select
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
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Current Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={passwordForm.currentPass}
                    onChange={e => setPasswordForm({ ...passwordForm, currentPass: e.target.value })}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">New Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={passwordForm.newPass}
                    onChange={e => setPasswordForm({ ...passwordForm, newPass: e.target.value })}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-oxblood font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Confirm New Password</label>
                  <input 
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
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest truncate">{p.tagline}</p>
                          <p className="text-sm font-semibold font-mono text-oxblood mt-1">{storeConfig.currency}{p.price}</p>
                        </div>
                        <div className="flex items-center gap-3 mt-3">
                          <Link
                            to={`/product/${p.slug}`}
                            className="bg-oxblood text-ivory text-[10px] uppercase tracking-widest font-semibold px-4 py-2 rounded hover:bg-oxblood-deep transition"
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