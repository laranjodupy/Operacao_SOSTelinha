import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localScreenshotAccess,authenticated} from '../lib/server/auth.ts';
test('screenshot access works only on loopback in explicit development mode',async()=>{
 const previous={flag:process.env.LOCAL_SCREENSHOT_MODE,mode:process.env.NODE_ENV,vercel:process.env.VERCEL};
 const request=(host:string)=>({url:`http://${host}/api/session`,headers:new Headers({host}),cookies:{get:()=>undefined}} as any);
 try {
  Object.assign(process.env,{LOCAL_SCREENSHOT_MODE:'true',NODE_ENV:'development'});delete process.env.VERCEL;
  assert.equal(localScreenshotAccess(request('localhost:3000')),true);
  assert.equal(await authenticated(request('localhost:3000')),true);
  assert.equal(localScreenshotAccess(request('192.168.0.2:3000')),false);
  assert.equal(localScreenshotAccess(request('example.com')),false);
  assert.equal(localScreenshotAccess({...request('localhost:3000'),headers:new Headers({host:'example.com'})}),false);
  Object.assign(process.env,{NODE_ENV:'production'});assert.equal(await authenticated(request('localhost:3000')),false);
  Object.assign(process.env,{NODE_ENV:'development'});process.env.VERCEL='1';assert.equal(await authenticated(request('localhost:3000')),false);
  delete process.env.VERCEL;delete process.env.LOCAL_SCREENSHOT_MODE;assert.equal(await authenticated(request('localhost:3000')),false);
 }finally{
  for(const [key,value] of Object.entries({LOCAL_SCREENSHOT_MODE:previous.flag,NODE_ENV:previous.mode,VERCEL:previous.vercel}))
   if(value===undefined) delete process.env[key];else process.env[key]=value;
 }
});
