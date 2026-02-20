 'use client';
 
 import { useEffect, useState } from 'react';
 import { useRouter, useSearchParams } from 'next/navigation';
 import type { Account } from 'appwrite';
 import { Button } from '@/components/ui/button';
 
 export default function AuthCallback() {
   const router = useRouter();
   const params = useSearchParams();
   const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
 
   useEffect(() => {
     const userId = params.get('userId') || '';
     const secret = params.get('secret') || '';
     if (!userId || !secret) {
       setStatus('error');
       return;
     }
     setStatus('working');
     import('@/lib/appwrite')
       .then(({ getAppwriteAccount }) => {
         const account: Account = getAppwriteAccount();
         return account.createSession({ userId, secret });
       })
       .then(() => {
         router.replace('/');
       })
       .catch(() => {
         setStatus('error');
       });
   }, [params, router]);
 
   return (
     <div className="min-h-screen flex items-center justify-center p-6">
       <div className="glass rounded-2xl p-6 shadow-lg text-center">
         {status !== 'error' ? (
           <>
             <div className="text-lg font-semibold mb-2">Signing you in…</div>
             <div className="inline-flex items-center gap-1 justify-center">
               <span className="copilotKitActivityDot" />
               <span className="copilotKitActivityDot" style={{ animationDelay: '0.15s' }} />
               <span className="copilotKitActivityDot" style={{ animationDelay: '0.3s' }} />
             </div>
           </>
         ) : (
           <>
             <div className="text-lg font-semibold mb-2">Sign-in failed</div>
             <div className="text-sm text-muted-foreground mb-4">Missing or invalid callback parameters.</div>
             <Button variant="default" className="rounded-full h-10 px-5" onClick={() => router.replace('/')}>
               Go Home
             </Button>
           </>
         )}
       </div>
     </div>
   );
 }
