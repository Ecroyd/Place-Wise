"use client";
import {useEffect} from 'react';
import {track} from '@/src/lib/client/track';
// One anonymous "visit" per page load.
export function VisitTracker(){useEffect(()=>{track({kind:'visit',path:window.location.pathname});},[]);return null;}
