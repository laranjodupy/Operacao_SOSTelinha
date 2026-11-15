import 'server-only';
import type { NextResponse } from 'next/server';
import type { AuthState } from './supabase-auth.ts';

/** Tokens remain in HttpOnly cookies and never appear in response JSON. */
export function writeAuthCookies(response: NextResponse,state:AuthState|undefined,secure:boolean) {
  const common={httpOnly:true,sameSite:'strict' as const,secure};
  if(state?.tokens) {
    response.cookies.set('tray_session',state.tokens.token,{...common,path:'/',expires:new Date(state.tokens.expiresAt)});
    response.cookies.set('tray_refresh',state.tokens.refreshToken,{...common,path:'/api',maxAge:7*24*3600});
  } else if(state?.clear) {
    response.cookies.set('tray_session','',{...common,path:'/',maxAge:0});
    response.cookies.set('tray_refresh','',{...common,path:'/api',maxAge:0});
  }
}
